"""The repo's write functions must invalidate cached reads via execute_write.

This is the end-to-end half of Fix 3: test_cache.py proves the primitive
invalidates, this proves the real write paths actually go through it.
"""
from __future__ import annotations

import pytest

from server.repositories import common, fleet, health
from server import warehouse


@pytest.fixture(autouse=True)
def fake_warehouse(monkeypatch):
    from tests.fakes import FakeConn

    opened: list[FakeConn] = []

    def factory() -> FakeConn:
        # Column "d" is what the latest-business-date resolver reads.
        conn = FakeConn(rows=[("2026-09-05",)], cols=["d"])
        opened.append(conn)
        return conn

    monkeypatch.setattr(warehouse, "_open_connection", factory)
    common.clear_date_cache()
    return opened


def _prime_cache() -> None:
    health.health()
    assert warehouse.pool_stats()["cacheEntries"] == 1, "health() should be cached"


def test_truck_availability_write_invalidates_cached_reads(fake_warehouse):
    _prime_cache()
    fleet.update_truck_availability("T-01", False)
    assert warehouse.pool_stats()["cacheEntries"] == 0


def test_route_param_write_invalidates_cached_reads(fake_warehouse):
    _prime_cache()
    fleet.update_route_param("cost_per_km", 12.5)
    assert warehouse.pool_stats()["cacheEntries"] == 0


def test_truck_write_sends_the_flag_and_id(fake_warehouse):
    fleet.update_truck_availability("T-07", True)
    statement, params = fake_warehouse[-1].executed[-1]
    assert "UPDATE" in statement and "dim_truck" in statement
    assert params == (True, "T-07")


def test_route_param_write_sends_value_and_name(fake_warehouse):
    fleet.update_route_param("max_duration_h", 8.0)
    statement, params = fake_warehouse[-1].executed[-1]
    assert "dim_route_parameter" in statement
    assert params == (8.0, "max_duration_h")
