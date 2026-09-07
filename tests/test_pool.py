"""Connection pool: reuse, eviction and the counters that describe them."""
from __future__ import annotations

import time

import pytest

from server import warehouse
from tests.fakes import FakeConn


def test_cold_checkout_opens_a_fresh_connection(opened, stats):
    with warehouse.connection():
        pass
    assert len(opened) == 1
    assert stats()["poolMisses"] == 1
    assert stats()["poolHits"] == 0
    assert stats()["idle"] == 1, "a healthy connection must go back to the pool"


def test_second_checkout_reuses_the_same_connection(opened, stats):
    with warehouse.connection() as first:
        pass
    with warehouse.connection() as second:
        pass
    assert second is first, "LIFO must hand back the most recently released connection"
    assert len(opened) == 1, "reuse must not open a second connection"
    assert stats()["poolHits"] == 1


def test_lifo_returns_the_most_recently_released_connection(opened):
    with warehouse.connection() as outer:
        with warehouse.connection() as inner:
            pass
        # inner is back in the pool; outer is still checked out.
    # Nesting means outer is released LAST, so it ends up on top of the stack.
    with warehouse.connection() as next_out:
        pass
    assert next_out is outer
    assert next_out is not inner
    assert warehouse._pool.qsize() == 2, "both connections stay pooled"


def test_failed_body_evicts_instead_of_recycling(opened, stats):
    with pytest.raises(RuntimeError):
        with warehouse.connection() as conn:
            raise RuntimeError("query blew up")
    assert conn.closed, "a connection whose borrower failed must be closed"
    assert stats()["errorEvictions"] == 1
    assert stats()["idle"] == 0, "a suspect connection must not be reused"


def test_connection_older_than_max_age_is_dropped(opened, stats, monkeypatch):
    with warehouse.connection() as stale:
        pass
    monkeypatch.setattr(warehouse, "_POOL_MAX_AGE_S", -1)
    with warehouse.connection() as fresh:
        pass
    assert fresh is not stale
    assert stale.closed
    assert stats()["ageEvictions"] == 1


def test_release_into_a_full_pool_closes_the_surplus(stats):
    for _ in range(warehouse._POOL_SIZE):
        warehouse._release(time.monotonic(), FakeConn(), True)
    surplus = FakeConn()
    warehouse._release(time.monotonic(), surplus, True)
    assert surplus.closed, "the pool must not grow past its ceiling"
    assert stats()["poolFullCloses"] == 1
    assert stats()["idle"] == warehouse._POOL_SIZE


def test_peak_in_use_tracks_concurrent_checkouts(opened, stats):
    with warehouse.connection():
        with warehouse.connection():
            with warehouse.connection():
                assert stats()["inUse"] == 3
    assert stats()["peakInUse"] == 3
    assert stats()["inUse"] == 0, "the gauge must return to zero"


def test_warm_pool_does_not_skew_the_in_use_gauge(opened, stats):
    warehouse.warm_pool(n=3)
    assert stats()["inUse"] == 0, "warm-up releases without a matching checkout"
    assert stats()["idle"] == 3


def test_close_pool_drains_every_connection(opened):
    warehouse.warm_pool(n=3)
    warehouse.close_pool()
    assert warehouse._pool.qsize() == 0
    assert all(c.closed for c in opened)


def test_pool_stats_reports_the_active_knobs(stats):
    snapshot = stats()
    assert snapshot["poolSize"] == warehouse._POOL_SIZE
    assert snapshot["poolMaxAgeS"] == warehouse._POOL_MAX_AGE_S
    assert snapshot["cacheTtlS"] == warehouse._RESULT_TTL_S
