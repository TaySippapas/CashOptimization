"""query_many: concurrency, per-statement failure, and the stale-read retry.

These cover the two behaviours the fan-out exists to provide — one slow
statement not blocking the others, and one broken statement not blanking the
whole page.
"""
from __future__ import annotations

import time

import pytest

from server import warehouse
from tests.fakes import FakeConn

SQL = "SELECT 1"


def test_runs_every_statement(opened):
    fan = warehouse.query_many([(SQL, None), (SQL, None), (SQL, None)])
    assert len(fan.results) == 3
    assert fan.ok
    assert fan.errors == [None, None, None]


def test_single_statement_skips_the_thread_pool(opened):
    fan = warehouse.query_many([(SQL, ["x"])])
    assert len(fan.results) == 1
    assert opened[0].executed[0][0] == SQL


def test_results_stay_positional(monkeypatch):
    """Results must line up with the statements that produced them.

    Callers unpack this tuple by position, so a mismatch would silently swap
    two aggregates rather than fail loudly.
    """
    monkeypatch.setattr(warehouse, "_open_connection", lambda: FakeConn(echo=True))
    fan = warehouse.query_many([("SELECT a", None), ("SELECT b", None), ("SELECT c", None)])
    assert [r[0]["value"] for r in fan.results] == ["SELECT a", "SELECT b", "SELECT c"]


def test_one_failing_statement_does_not_lose_the_others(monkeypatch):
    """The whole point of Fix 2: good aggregates must survive a bad one.

    The failure is bound to the *statement*, not the connection, so the
    stale-connection retry cannot mask it — this is a genuinely broken query.
    """
    monkeypatch.setattr(
        warehouse, "_open_connection", lambda: FakeConn(echo=True, fail_on="BROKEN")
    )
    fan = warehouse.query_many(
        [("SELECT a", None), ("SELECT BROKEN", None), ("SELECT c", None)]
    )

    assert len(fan.results) == 3, "a failure must not shorten the result list"
    assert not fan.ok
    assert fan.errors[0] is None and fan.errors[2] is None
    assert fan.errors[1] is not None, "the broken statement is reported at its index"
    assert fan.results[0][0]["value"] == "SELECT a", "healthy statements still return rows"
    assert fan.results[2][0]["value"] == "SELECT c"
    assert fan.results[1] == [], "the failed statement contributes no rows"


def test_failure_is_reported_as_a_message_not_raised(monkeypatch):
    monkeypatch.setattr(
        warehouse, "_open_connection", lambda: FakeConn(fail_with=ValueError("boom"))
    )
    fan = warehouse.query_many([(SQL, None)])
    assert fan.results == [[]]
    assert fan.errors[0] is not None
    assert "ValueError" in fan.errors[0]
    assert "boom" in fan.errors[0]


def test_stale_pooled_connection_is_retried_on_a_fresh_one(monkeypatch, stats):
    """Fix 1: a connection that died inside its age window must not surface."""
    dead = FakeConn(fail_with=ConnectionError("session closed"))
    warehouse._release(time.monotonic(), dead, True)
    healthy = FakeConn(rows=[("recovered",)])
    monkeypatch.setattr(warehouse, "_open_connection", lambda: healthy)

    rows = warehouse.run_read(lambda cur: warehouse.query(cur, SQL))

    assert rows == [{"value": "recovered"}], "the retry result must reach the caller"
    assert stats()["staleRetries"] == 1
    assert dead.closed, "the dead connection must be evicted, not recycled"


def test_retry_banks_the_connection_that_worked(monkeypatch, stats):
    warehouse._release(time.monotonic(), FakeConn(fail_with=ConnectionError("dead")), True)
    monkeypatch.setattr(warehouse, "_open_connection", lambda: FakeConn())
    warehouse.run_read(lambda cur: warehouse.query(cur, SQL))
    assert stats()["idle"] == 1, "a connection that just proved itself should be pooled"


def test_retry_gives_up_after_the_second_failure(monkeypatch, stats):
    monkeypatch.setattr(
        warehouse, "_open_connection", lambda: FakeConn(fail_with=ConnectionError("dead"))
    )
    with pytest.raises(ConnectionError):
        warehouse.run_read(lambda cur: warehouse.query(cur, SQL))
    assert stats()["staleRetries"] == 1, "exactly one retry, not a loop"
    assert stats()["idle"] == 0, "a connection that failed twice must not be pooled"


def test_date_shaped_params_are_sent_as_dates(opened):
    warehouse.query_many([(SQL, ["2026-09-05", "KT001"])])
    _, params = opened[0].executed[0]
    assert not isinstance(params[0], str), "YYYY-MM-DD must be coerced to a DATE"
    assert params[1] == "KT001", "non-date params pass through untouched"
