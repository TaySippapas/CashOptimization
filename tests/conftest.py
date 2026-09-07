"""Fakes and isolation for the warehouse tests.

The pool, counters and read cache are module-level state, so every test gets a
clean slate. Nothing here talks to Databricks: only the connection *factory*
is replaced, so the real pool, cache and fan-out logic is what gets exercised.
"""
from __future__ import annotations

import pytest

from server import warehouse


from tests.fakes import FakeConn


@pytest.fixture(autouse=True)
def clean_warehouse():
    """Reset pool, counters and cache around every test."""
    def reset() -> None:
        warehouse._pool.queue.clear()
        with warehouse._stats_lock:
            for key in warehouse._stats:
                warehouse._stats[key] = 0
        warehouse._in_use = 0
        warehouse.clear_result_cache()

    reset()
    yield
    reset()


@pytest.fixture
def opened(monkeypatch) -> list[FakeConn]:
    """Replace the connection factory; returns the list of connections opened."""
    created: list[FakeConn] = []

    def factory() -> FakeConn:
        conn = FakeConn()
        created.append(conn)
        return conn

    monkeypatch.setattr(warehouse, "_open_connection", factory)
    return created


@pytest.fixture
def stats():
    return warehouse.pool_stats
