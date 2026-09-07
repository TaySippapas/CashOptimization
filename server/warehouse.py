"""Pooled Databricks SQL warehouse access: connections, read cache, fan-out.

Extracted from uc_repo_v2.py so the connection/caching machinery can be tested
without a warehouse (see tests/) and shared by any repository module, rather
than living as globals inside one 53KB file of queries.

Measured against the Serverless Starter Warehouse: opening a session costs
~1.2s (TCP + TLS + Databricks auth handshake) while a query on an open one
costs ~0.4s, so connections are pooled and reused — worth ~1.2s per request.
Waking a *stopped* serverless warehouse is a separate ~8.8s one-off that
pooling cannot avoid; don't confuse the two when reading timings.

Connections are dropped on error so a broken one is never reused, and after
MAX_AGE as a backstop against sessions that go bad while idle.

Separate from server/sql_client.py, which is the *unpooled* client for the
older flat-table pipeline (uc_repo.py and scripts/legacy/). Those two must not
be merged: the old path opens a connection per call by design.
"""
from __future__ import annotations

import logging
import os
import queue
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import date
from functools import lru_cache, wraps
from typing import Any, Callable, Iterator, NamedTuple, Sequence

from databricks import sql
from databricks.sdk.core import Config

from server.settings import get_settings
from server.sql_client import bare_hostname

log = logging.getLogger(__name__)

_settings = get_settings()
WAREHOUSE_ID = os.getenv("V2_WAREHOUSE_ID") or _settings.warehouse_id

# Sized from measured peakInUse under CONCURRENT users, which is the number
# that matters: one dashboard load alone peaks at ~6 checkouts, but two
# simultaneous uncached users peak at 12-16. Sizing off a single user (and so
# dropping this to 8) was measured to leave the pool churning — peak 14 against
# 8 slots, with 10 healthy connections closed on release rather than kept.
# Undersizing is not fatal, just wasteful: the surplus pays a fresh handshake.
#
# MAX_AGE is a backstop, not a cure for a known failure: stopping the warehouse
# under a live pooled connection was measured NOT to kill it (the next query
# transparently resumed the warehouse), so serverless auto-stop is not the
# hazard here. What does eventually invalidate a session is unconfirmed, hence
# a conservative age limit rather than no limit.
# Both knobs are settings, not constants, so the counters below can drive
# retuning without a redeploy — see server/settings.py.
_POOL_SIZE = _settings.pool_size
_POOL_MAX_AGE_S = _settings.pool_max_age_s
_RESULT_TTL_S = _settings.result_cache_ttl_s

_pool: "queue.LifoQueue[tuple[float, Any]]" = queue.LifoQueue(maxsize=_POOL_SIZE)

_result_cache: dict[str, tuple[float, Any]] = {}
_result_lock = threading.Lock()

# Counters behind /api/v2/health. Without them, "is the pool big enough" and
# "is the cache TTL doing anything" are guesses: a pool that is always missing
# and a cache that never hits both look identical from the outside.
_stats_lock = threading.Lock()
_stats: dict[str, int] = {
    "poolHits": 0,          # reused a live pooled connection
    "poolMisses": 0,        # pool was empty, paid a fresh handshake
    "ageEvictions": 0,      # dropped for exceeding _POOL_MAX_AGE_S
    "errorEvictions": 0,    # dropped because the borrower's query raised
    "poolFullCloses": 0,    # returned healthy but the pool was already full
    "staleRetries": 0,      # read retried on a fresh connection after a failure
    "peakInUse": 0,         # high-water mark of simultaneous checkouts
    "cacheHits": 0,
    "cacheMisses": 0,
}
_in_use = 0


def _bump(name: str) -> None:
    with _stats_lock:
        _stats[name] += 1


# ── Connections ───────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def _config() -> Config:
    # Config() shells out to `databricks auth token --force-refresh` on
    # construction. Building a fresh one per connection meant concurrent
    # requests raced on the local CLI token cache and some lost (exit status
    # 45 -> 503s under load). One process-wide instance avoids both the
    # redundant subprocess calls and the race.
    return Config()


def _open_connection() -> Any:
    cfg = _config()
    return sql.connect(
        server_hostname=bare_hostname(cfg.host),
        http_path=f"/sql/1.0/warehouses/{WAREHOUSE_ID}",
        credentials_provider=lambda: cfg.authenticate,
    )


def _take() -> tuple[float, Any]:
    while True:
        try:
            born, conn = _pool.get_nowait()
        except queue.Empty:
            _bump("poolMisses")
            return time.monotonic(), _open_connection()
        if time.monotonic() - born < _POOL_MAX_AGE_S:
            _bump("poolHits")
            return born, conn
        _bump("ageEvictions")
        _close_quietly(conn)


def _release(born: float, conn: Any, reusable: bool) -> None:
    if reusable:
        try:
            _pool.put_nowait((born, conn))
            return
        except queue.Full:
            _bump("poolFullCloses")
    else:
        _bump("errorEvictions")
    _close_quietly(conn)


def _close_quietly(conn: Any) -> None:
    try:
        conn.close()
    except Exception:
        pass


@contextmanager
def connection() -> Iterator[Any]:
    """Borrow a pooled connection for the duration of the block.

    No retry: a context manager cannot re-run its own body, so a connection
    that died while pooled surfaces as an error to the caller. Reads that
    should survive that go through run_read/query_many instead.
    """
    global _in_use
    born, conn = _take()
    # Counted here rather than in _take/_release so warm_pool's direct
    # _release (which has no matching checkout) can't drive the gauge negative.
    with _stats_lock:
        _in_use += 1
        if _in_use > _stats["peakInUse"]:
            _stats["peakInUse"] = _in_use
    reusable = True
    try:
        yield conn
    except Exception:
        reusable = False
        raise
    finally:
        with _stats_lock:
            _in_use -= 1
        _release(born, conn, reusable)


def run_read(fn: Callable[[Any], Any]) -> Any:
    """Run a read on a pooled cursor, retrying once on a fresh connection.

    The age check alone cannot catch a session killed inside its window: that
    connection still looks valid, gets handed out, and fails in the user's
    face. A dead connection fails fast, so paying one handshake to retry turns
    a visible error into a slightly slower response.

    Reads only — `fn` may run more than once, so it must not mutate anything.
    """
    try:
        with connection() as conn:
            with conn.cursor() as cur:
                return fn(cur)
    except Exception:
        _bump("staleRetries")
        log.warning("Pooled read failed; retrying on a fresh connection", exc_info=True)

    conn = _open_connection()
    try:
        with conn.cursor() as cur:
            result = fn(cur)
    except Exception:
        _close_quietly(conn)
        raise
    # Only bank a connection that just proved it works.
    _release(time.monotonic(), conn, True)
    return result


# ── Statements ────────────────────────────────────────────────────────────

_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _coerce(v: Any) -> Any:
    """Send YYYY-MM-DD as a DATE, not a string.

    Comparing a DATE column against a string parameter makes Spark cast the
    column, which defeats file skipping — measured ~0.65s vs ~0.40s for the
    same filter.
    """
    if isinstance(v, str) and _ISO_DATE.match(v):
        try:
            return date.fromisoformat(v)
        except ValueError:
            return v
    return v


def query(cur: Any, statement: str, params: Sequence[Any] | None = None) -> list[dict[str, Any]]:
    """Run a query on an already-open cursor and map rows to dicts."""
    cur.execute(statement, tuple(_coerce(p) for p in params) if params else None)
    cols = [d[0] for d in (cur.description or [])]
    rows = cur.fetchall() or []
    return [dict(zip(cols, row)) for row in rows]


class FanOut(NamedTuple):
    """Per-statement outcomes from query_many.

    `results` is positional and always full length, so callers can unpack it
    as before; a statement that failed contributes an empty list and a message
    in `errors` at the same index.
    """
    results: list[list[dict[str, Any]]]
    errors: list[str | None]

    @property
    def ok(self) -> bool:
        return not any(self.errors)


def query_many(items: Sequence[tuple[str, Sequence[Any] | None]]) -> FanOut:
    """Run independent statements concurrently, one pooled connection each.

    A cursor is single-threaded, so queries issued on one connection queue up.
    For a handful of unrelated aggregates that turns N round trips into N waits
    instead of one.

    One statement failing must not blank the whole page, so failures are
    reported per statement rather than raised: a six-aggregate dashboard can
    render the five that worked and mark the one that didn't.
    """
    def run(item: tuple[str, Sequence[Any] | None]) -> tuple[list[dict[str, Any]], str | None]:
        statement, params = item
        try:
            return run_read(lambda cur: query(cur, statement, params)), None
        except Exception as e:
            # run_read already logged the traceback on its retry, so this is
            # the one-line "and it stayed broken" rather than a second copy.
            log.warning("Fan-out statement failed: %s: %s", type(e).__name__, e)
            return [], f"{type(e).__name__}: {e}"

    if len(items) == 1:
        outcomes = [run(items[0])]
    else:
        with ThreadPoolExecutor(max_workers=min(len(items), _POOL_SIZE)) as pool:
            outcomes = list(pool.map(run, items))
    return FanOut([rows for rows, _ in outcomes], [err for _, err in outcomes])


def execute_write(statement: str, params: Sequence[Any] | None = None) -> None:
    """Run a write, then invalidate the read cache.

    Writes go through here rather than borrowing a connection directly so that
    invalidation is structural: previously every write had to *remember* to
    call clear_result_cache(), and one that forgot would serve stale reads for
    the whole TTL with nothing to catch it.

    Deliberately no retry — a write that failed mid-flight may have partially
    applied, and re-running it is not safe.
    """
    try:
        with connection() as conn:
            with conn.cursor() as cur:
                cur.execute(statement, tuple(_coerce(p) for p in params) if params else None)
    finally:
        # Invalidate even on failure: a write that errored after applying is
        # exactly the case where a stale cache would hide the real state.
        clear_result_cache()


# ── Read cache ────────────────────────────────────────────────────────────

def cached(fn: Callable[..., Any]) -> Callable[..., Any]:
    """Memoise a read for a few seconds, keyed on the arguments.

    The underlying facts change once a day, so re-querying the warehouse for
    every page view costs seconds and buys nothing. Only applied to reads —
    fleet and route parameters are written by Route Config and must not be
    served stale.
    """
    @wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        key = f"{fn.__name__}:{args!r}:{sorted(kwargs.items())!r}"
        now = time.monotonic()
        with _result_lock:
            hit = _result_cache.get(key)
            if hit and now - hit[0] < _RESULT_TTL_S:
                _bump("cacheHits")
                return hit[1]
        _bump("cacheMisses")
        value = fn(*args, **kwargs)
        with _result_lock:
            _result_cache[key] = (now, value)
        return value

    return wrapper


def clear_result_cache() -> None:
    """Drop memoised reads (called for you by execute_write)."""
    with _result_lock:
        _result_cache.clear()


# ── Lifecycle & introspection ─────────────────────────────────────────────

def pool_stats() -> dict[str, Any]:
    """Counter snapshot plus the tuning knobs those counters should drive.

    Read together: sustained poolMisses with idle at 0 means the pool is too
    small for the concurrent fan-out; ageEvictions climbing while poolHits
    stays flat means connections are expiring before anyone reuses them.
    """
    with _stats_lock:
        snapshot: dict[str, Any] = dict(_stats)
        snapshot["inUse"] = _in_use
    with _result_lock:
        snapshot["cacheEntries"] = len(_result_cache)
    snapshot["idle"] = _pool.qsize()
    snapshot["poolSize"] = _POOL_SIZE
    snapshot["poolMaxAgeS"] = _POOL_MAX_AGE_S
    snapshot["cacheTtlS"] = _RESULT_TTL_S
    return snapshot


def warm_pool(n: int = 6) -> None:
    """Open connections up front so the first page load doesn't pay handshakes.

    Safe to fail: a warehouse that is asleep or unreachable just leaves the pool
    empty and requests open connections on demand as before.
    """
    def one() -> None:
        try:
            _release(time.monotonic(), _open_connection(), True)
        except Exception:
            log.warning("Pool warm-up connection failed", exc_info=True)

    with ThreadPoolExecutor(max_workers=n) as pool:
        for _ in range(min(n, _POOL_SIZE)):
            pool.submit(one)


def close_pool() -> None:
    """Drop every pooled connection (called on app shutdown)."""
    while True:
        try:
            _, conn = _pool.get_nowait()
        except queue.Empty:
            return
        _close_quietly(conn)
