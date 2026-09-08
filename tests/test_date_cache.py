"""The latest-business-date cache, which the fan-out hits from several threads.

query_many resolves dates on worker threads, so this dict is shared mutable
state like the pool counters and the read cache. The lock keeps reads and
writes consistent; it is deliberately not held across the warehouse round trip,
so a concurrent miss costs a duplicate query rather than serialising the fan-out.
"""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import pytest

from server.repositories import common
from tests.fakes import FakeConn


@pytest.fixture(autouse=True)
def clean_date_cache():
    common.clear_date_cache()
    yield
    common.clear_date_cache()


def cursor(rows=None):
    conn = FakeConn(rows=rows if rows is not None else [("2026-09-04",)], cols=["d"])
    return conn.cursor()


def test_first_call_queries_and_caches():
    cur = cursor()
    assert common._max_business_date(cur, "fact_cash_position") == "2026-09-04"
    assert len(cur.conn.executed) == 1


def test_second_call_is_served_from_cache():
    cur = cursor()
    common._max_business_date(cur, "fact_cash_position")
    common._max_business_date(cur, "fact_cash_position")
    assert len(cur.conn.executed) == 1, "the cached date must not re-query"


def test_each_table_is_cached_separately():
    """Route and machine facts land on different dates than branch facts."""
    cur = cursor()
    common._max_business_date(cur, "fact_cash_position")
    common._max_business_date(cur, "fact_route_summary")
    assert len(cur.conn.executed) == 2


def test_clear_forces_a_requery():
    cur = cursor()
    common._max_business_date(cur, "fact_cash_position")
    common.clear_date_cache()
    common._max_business_date(cur, "fact_cash_position")
    assert len(cur.conn.executed) == 2


def test_entry_expires_after_the_ttl(monkeypatch):
    cur = cursor()
    common._max_business_date(cur, "fact_cash_position")
    monkeypatch.setattr(common, "_MAX_DATE_TTL_S", 0)
    common._max_business_date(cur, "fact_cash_position")
    assert len(cur.conn.executed) == 2


def test_a_null_result_is_cached_as_none():
    """An empty fact table must not re-query on every single request."""
    cur = cursor(rows=[(None,)])
    assert common._max_business_date(cur, "fact_cash_position") is None
    assert common._max_business_date(cur, "fact_cash_position") is None
    assert len(cur.conn.executed) == 1


def test_concurrent_readers_all_agree():
    """The shape query_many produces: many threads resolving the same date."""
    cur = cursor()
    lock = threading.Lock()
    seen: list[str | None] = []

    def resolve(_):
        value = common._max_business_date(cur, "fact_cash_position")
        with lock:
            seen.append(value)

    with ThreadPoolExecutor(max_workers=12) as pool:
        list(pool.map(resolve, range(48)))

    assert len(seen) == 48
    assert set(seen) == {"2026-09-04"}, "every thread must see the same date"


def test_clearing_while_readers_run_never_corrupts():
    """clear_date_cache can land mid-flight when a write invalidates reads."""
    cur = cursor()
    stop = threading.Event()
    errors: list[BaseException] = []

    def reader():
        try:
            while not stop.is_set():
                assert common._max_business_date(cur, "fact_cash_position") == "2026-09-04"
        except BaseException as e:  # noqa: BLE001 - surfaced below
            errors.append(e)

    def clearer():
        try:
            while not stop.is_set():
                common.clear_date_cache()
        except BaseException as e:  # noqa: BLE001
            errors.append(e)

    threads = [threading.Thread(target=reader) for _ in range(4)]
    threads.append(threading.Thread(target=clearer))
    for t in threads:
        t.start()
    time.sleep(0.2)
    stop.set()
    for t in threads:
        t.join(timeout=5)

    assert not errors, f"concurrent access raised: {errors[:1]}"
