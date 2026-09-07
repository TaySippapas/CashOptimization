"""Read cache: TTL behaviour, keying, and invalidation on write."""
from __future__ import annotations

import pytest

from server import warehouse
from tests.fakes import FakeConn


def test_second_call_is_served_from_cache(stats):
    calls = []

    @warehouse.cached
    def read(x):
        calls.append(x)
        return x * 2

    assert read(1) == 2
    assert read(1) == 2
    assert calls == [1], "the second call must not reach the underlying function"
    assert stats()["cacheHits"] == 1
    assert stats()["cacheMisses"] == 1


def test_cache_is_keyed_on_arguments():
    calls = []

    @warehouse.cached
    def read(x):
        calls.append(x)
        return x

    read(1)
    read(2)
    read(1)
    assert calls == [1, 2], "different arguments are different entries"


def test_entry_expires_after_the_ttl(monkeypatch):
    calls = []

    @warehouse.cached
    def read():
        calls.append(1)
        return "v"

    read()
    monkeypatch.setattr(warehouse, "_RESULT_TTL_S", 0)
    read()
    assert len(calls) == 2, "an expired entry must be refetched"


def test_clear_forces_a_refetch():
    calls = []

    @warehouse.cached
    def read():
        calls.append(1)
        return "v"

    read()
    warehouse.clear_result_cache()
    read()
    assert len(calls) == 2
    assert warehouse.pool_stats()["cacheEntries"] == 1


def test_execute_write_invalidates_the_cache(opened):
    """Fix 3: invalidation is structural, so a write cannot forget it."""
    calls = []

    @warehouse.cached
    def read():
        calls.append(1)
        return "stale"

    read()
    assert warehouse.pool_stats()["cacheEntries"] == 1

    warehouse.execute_write("UPDATE t SET a = ?", [1])

    assert warehouse.pool_stats()["cacheEntries"] == 0, "the write must drop cached reads"
    read()
    assert len(calls) == 2, "the next read must go back to the warehouse"


def test_execute_write_invalidates_even_when_the_write_fails(monkeypatch):
    """A write that errored after applying is exactly when stale reads hurt."""
    @warehouse.cached
    def read():
        return "stale"

    read()
    monkeypatch.setattr(
        warehouse, "_open_connection", lambda: FakeConn(fail_with=RuntimeError("nope"))
    )
    with pytest.raises(RuntimeError):
        warehouse.execute_write("UPDATE t SET a = ?", [1])
    assert warehouse.pool_stats()["cacheEntries"] == 0


def test_execute_write_is_never_retried(monkeypatch, stats):
    """A partially-applied write must not be re-run."""
    monkeypatch.setattr(
        warehouse, "_open_connection", lambda: FakeConn(fail_with=RuntimeError("nope"))
    )
    with pytest.raises(RuntimeError):
        warehouse.execute_write("UPDATE t SET a = ?", [1])
    assert stats()["staleRetries"] == 0


def test_execute_write_sends_its_parameters(opened):
    warehouse.execute_write("UPDATE t SET a = ? WHERE id = ?", [True, "T-01"])
    statement, params = opened[0].executed[0]
    assert "UPDATE t" in statement
    assert params == (True, "T-01")
