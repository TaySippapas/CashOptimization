"""Report availability uses route facts, not the branch date range."""
from datetime import date

import pytest
from fastapi import HTTPException

from server import warehouse
from server.api.v2 import get_report_dates
from server.repositories import routes
from tests.fakes import FakeConn


def test_report_dates_preserve_gaps_and_filter_plan_type(monkeypatch):
    conn = FakeConn(rows=[(date(2026, 9, 1),), (date(2026, 9, 4),)], cols=["business_date"])
    monkeypatch.setattr(warehouse, "_open_connection", lambda: conn)
    assert get_report_dates() == {"dates": ["2026-09-01", "2026-09-04"]}
    statement, params = conn.executed[0]
    assert "fact_route_summary" in statement
    assert "SELECT DISTINCT business_date" in statement
    assert "business_date IS NOT NULL" in statement
    assert "route_plan_type = ?" in statement
    assert params == ("OPTIMIZED",)


def test_report_dates_empty_database(monkeypatch):
    monkeypatch.setattr(warehouse, "_open_connection", lambda: FakeConn(rows=[], cols=["business_date"]))
    assert get_report_dates() == {"dates": []}


def test_report_dates_failure_is_not_misrepresented_as_empty(monkeypatch):
    def fail():
        raise RuntimeError("warehouse unavailable")

    monkeypatch.setattr(routes, "fetch_report_dates", fail)
    with pytest.raises(HTTPException) as error:
        get_report_dates()
    assert error.value.status_code == 503
