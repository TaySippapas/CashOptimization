"""Tracking dates remain independent when warehouse datasets land on different days."""
from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server import warehouse
from server.api.v2 import router
from server.repositories import common, health
from tests.fakes import FakeConn


@pytest.fixture(autouse=True)
def reset_dates():
    common.clear_date_cache()
    yield
    common.clear_date_cache()


@pytest.mark.parametrize("dataset,table,days", [
    ("branches", "fact_cash_position", [1, 5]),
    ("machines", "fact_machine_position", [2, 7]),
    ("routes", "fact_route_summary", [3, 9]),
])
def test_availability_uses_its_own_table_and_preserves_gaps(monkeypatch, dataset, table, days):
    conn = FakeConn(rows=[(date(2026, 9, day),) for day in days], cols=["business_date"])
    monkeypatch.setattr(warehouse, "_open_connection", lambda: conn)
    result = health.fetch_date_range(dataset)
    assert result == {
        "dates": [f"2026-09-{day:02d}" for day in days],
        "minDate": f"2026-09-{days[0]:02d}",
        "maxDate": f"2026-09-{days[-1]:02d}",
    }
    statement, params = conn.executed[0]
    assert common._t(table) in statement
    assert "SELECT DISTINCT business_date" in statement
    if dataset == "routes":
        assert "route_plan_type = ?" in statement
        assert params == ("OPTIMIZED",)
    else:
        assert params is None


def test_latest_dates_are_separate_including_the_selected_route_plan(monkeypatch):
    calls = []

    def query(cur, statement, params=None):
        calls.append((statement, params))
        if "fact_cash_position" in statement:
            return [{"d": "2026-09-05"}]
        if "fact_machine_position" in statement:
            return [{"d": "2026-09-07"}]
        return [{"d": "2026-09-09" if params == ["OPTIMIZED"] else "2026-09-10"}]

    monkeypatch.setattr(common, "query", query)
    assert common._resolve_date(object(), None) == "2026-09-05"
    assert common._resolve_route_date(object(), None, "OPTIMIZED") == "2026-09-09"
    assert common._latest_machine_date(object()) == "2026-09-07"
    assert common._resolve_route_date(object(), None) == "2026-09-10"
    assert common._resolve_route_date(object(), None, "OPTIMIZED") == "2026-09-09"
    assert len(calls) == 4, "the optimized latest date must have a separate cache entry"
    assert common._resolve_route_date(object(), "2026-09-03", "OPTIMIZED") == "2026-09-03"
    assert len(calls) == 4, "an explicit date must not be replaced with latest"


def test_empty_routes_do_not_borrow_a_branch_date(monkeypatch):
    monkeypatch.setattr(common, "query", lambda *args: [{"d": None}])
    assert common._resolve_route_date(object(), None, "OPTIMIZED") == ""


def test_date_range_rejects_unknown_dataset_before_querying(monkeypatch):
    def unexpected_connection():
        pytest.fail("Invalid datasets must not reach Databricks")

    monkeypatch.setattr(warehouse, "_open_connection", unexpected_connection)
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        assert client.get("/api/v2/date-range", params={"dataset": "unknown"}).status_code == 422


def test_empty_availability_has_no_invented_bounds(monkeypatch):
    monkeypatch.setattr(warehouse, "_open_connection", lambda: FakeConn(rows=[], cols=["business_date"]))
    assert health.fetch_date_range("routes") == {"dates": [], "minDate": None, "maxDate": None}
