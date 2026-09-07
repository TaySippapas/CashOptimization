"""How fetch_overview_summary turns six aggregate result sets into dashboard tiles.

This is the layer where a bug is silent and expensive: nothing crashes, the
page just shows a confident wrong number that someone routes cash by. The
function's own docstring records one that already shipped — "Total Cash Under
Management grew with each day of history loaded" — so these lock in the
arithmetic with known inputs.

The SQL itself is not under test (that needs Spark); what is tested is the
combining, the fallbacks when an aggregate comes back empty, and the
partial-failure reporting.
"""
from __future__ import annotations

import pytest

from server.repositories import overview as repo
from server import warehouse
from server.warehouse import FanOut

DATE = "2026-09-05"

# One row per action_type, as the demand aggregates return.
BR_DEMAND = [
    {"action_type": "DELIVERY", "cnt": 4, "delivery_amt": 900_000.0,
     "total_actual": 5_000_000.0, "total_cof": 1_200.0, "biz_date": DATE},
    {"action_type": "NO_ACTION", "cnt": 10, "delivery_amt": 0.0,
     "total_actual": 3_000_000.0, "total_cof": 800.0, "biz_date": DATE},
]
MC_DEMAND = [
    {"action_type": "Refill", "cnt": 3, "delivery_amt": 400_000.0,
     "total_actual": 700_000.0, "total_cof": 100.0, "biz_date": DATE},
    {"action_type": "No Action", "cnt": 9, "delivery_amt": 0.0,
     "total_actual": 300_000.0, "total_cof": 50.0, "biz_date": DATE},
]
PLAN = [{
    "trucks": 2, "total_stops": 6, "total_km": 123.456, "total_minutes": 500.0,
    "avg_minutes": 250.0, "max_minutes": 300.0, "ot_trucks": 1,
    "total_cot": 7_500.0, "delivery_branch": 900_000.0, "delivery_machine": 400_000.0,
    "avg_util": 76.55, "avg_sla": 98.44, "biz_date": DATE,
}]
STOP_TYPES = [
    {"stop_type": "Branch", "cnt": 2, "distinct_codes": 2},
    {"stop_type": "ATM", "cnt": 4, "distinct_codes": 3},
]
BR_COVERAGE = [{"demand": 4, "planned": 5, "covered": 3}]
MC_COVERAGE = [{"demand": 3, "planned": 4, "covered": 2}]

ALL_ROWS = [BR_DEMAND, MC_DEMAND, PLAN, STOP_TYPES, BR_COVERAGE, MC_COVERAGE]
AGGREGATE_NAMES = ("branchDemand", "machineDemand", "plan", "stopTypes",
                   "branchCoverage", "machineCoverage")


@pytest.fixture
def summary(monkeypatch, opened):
    """Call fetch_overview_summary with canned aggregate rows.

    `opened` fakes the connection factory so the date-resolution borrow works;
    passing an explicit business_date keeps it from querying for "latest".
    """
    def run(results=None, errors=None, period="day"):
        rows = ALL_ROWS if results is None else results
        errs = errors or [None] * 6
        monkeypatch.setattr(repo, "query_many", lambda items: FanOut(rows, errs))
        warehouse.clear_result_cache()   # the function is @cached
        return repo.fetch_overview_summary(DATE, period)

    return run


# ── Stocks vs flows ───────────────────────────────────────────────────────

def test_cash_under_management_adds_branch_and_machine(summary):
    """A stock: branch + machine, NOT multiplied by anything."""
    out = summary()
    # 5,000,000 + 3,000,000 (branch) + 700,000 + 300,000 (machine)
    assert out["cashUnderManagement"] == 9_000_000.0


def test_a_multi_day_period_does_not_inflate_the_stock(summary):
    """The regression the docstring records: cash must not scale with the window.

    The per-day averaging happens in SQL, so for identical rows a 7-day period
    must report exactly what a 1-day period reports.
    """
    one_day = summary(period="day")["cashUnderManagement"]
    one_week = summary(period="week")["cashUnderManagement"]
    assert one_week == one_day == 9_000_000.0
    assert summary(period="week")["periodDays"] == 7


def test_cost_of_fund_sums_branch_and_machine(summary):
    out = summary()
    # 1200 + 800 + 100 + 50
    assert out["cost"]["cof"] == 2_150.0
    assert out["cost"]["cot"] == 7_500.0
    assert out["cost"]["citTotal"] == 9_650.0


def test_zero_cost_of_fund_reports_none_not_zero(summary):
    """None renders as "no data"; 0.0 would render as a real, wrong figure."""
    br = [{**r, "total_cof": 0.0} for r in BR_DEMAND]
    mc = [{**r, "total_cof": 0.0} for r in MC_DEMAND]
    out = summary([br, mc, PLAN, STOP_TYPES, BR_COVERAGE, MC_COVERAGE])
    assert out["cost"]["cof"] is None
    assert out["cost"]["citTotal"] == 7_500.0


# ── Demand ────────────────────────────────────────────────────────────────

def test_branch_totals_split_all_versus_needing_service(summary):
    out = summary()["demand"]["branch"]
    assert out["total"] == 14           # 4 DELIVERY + 10 NO_ACTION
    assert out["needService"] == 4      # DELIVERY only
    assert out["deliveryAmount"] == 900_000.0


def test_machine_service_count_excludes_no_action(summary):
    out = summary()["demand"]["machine"]
    assert out["total"] == 12           # 3 Refill + 9 No Action
    assert out["needService"] == 3      # Refill only
    assert out["serviceBreakdown"] == [{"action": "Refill", "count": 3}]


def test_missing_delivery_row_reads_as_zero_not_a_crash(summary):
    """An aggregate can legitimately return no DELIVERY row for a quiet day."""
    out = summary([[BR_DEMAND[1]], MC_DEMAND, PLAN, STOP_TYPES,
                   BR_COVERAGE, MC_COVERAGE])
    assert out["demand"]["branch"]["needService"] == 0
    assert out["demand"]["branch"]["deliveryAmount"] == 0
    assert out["demand"]["branch"]["total"] == 10


# ── Plan & coverage ───────────────────────────────────────────────────────

def test_plan_rounds_for_display(summary):
    plan = summary()["plan"]
    assert plan["totalDistanceKm"] == 123.5     # 1dp
    assert plan["avgSlaPct"] == 98.4
    assert plan["trucks"] == 2 and plan["otTrucks"] == 1
    assert plan["stopsByType"] == {
        "Branch": {"count": 2, "distinct": 2},
        "ATM": {"count": 4, "distinct": 3},
    }


def test_a_percentage_ending_in_5_rounds_down_not_up(summary):
    """Recorded so nobody "fixes" it later: 76.55 is stored as 76.5499...,
    so round() gives 76.5. Cosmetic on a utilisation tile, but surprising."""
    assert summary()["plan"]["avgUtilizationPct"] == 76.5


def test_coverage_gaps_are_derived_both_ways(summary):
    cov = summary()["coverage"]
    # demand 4, planned 5, covered 3 -> 1 wanted but unplanned, 2 planned extra
    assert cov["branch"] == {"demand": 4, "planned": 5, "covered": 3,
                             "unserved": 1, "extra": 2}
    assert cov["machine"] == {"demand": 3, "planned": 4, "covered": 2,
                              "unserved": 1, "extra": 2}


def test_empty_plan_aggregate_yields_zeros(summary):
    """An empty result set must not IndexError on rows[0]."""
    out = summary([BR_DEMAND, MC_DEMAND, [], [], [], []])
    assert out["plan"]["trucks"] == 0
    assert out["plan"]["totalDistanceKm"] == 0
    assert out["coverage"]["branch"]["demand"] == 0
    assert out["cost"]["cot"] == 0


# ── Partial failure reporting ─────────────────────────────────────────────

def test_all_healthy_reports_not_partial(summary):
    out = summary()
    assert out["partial"] is False
    assert out["failedAggregates"] == []


@pytest.mark.parametrize("index, expected", list(enumerate(AGGREGATE_NAMES)))
def test_failed_aggregate_is_named_at_its_own_index(summary, index, expected):
    """Guards the names tuple against drifting out of step with the statements.

    If the order in query_many ever changes without this list changing with it,
    the UI would blame the wrong tile - which is worse than saying nothing.
    """
    errors = [None] * 6
    errors[index] = "ValueError: boom"
    out = summary(errors=errors)
    assert out["partial"] is True
    assert out["failedAggregates"] == [expected]


def test_several_failures_are_all_listed(summary):
    out = summary(errors=["err", None, "err", None, None, "err"])
    assert out["failedAggregates"] == ["branchDemand", "plan", "machineCoverage"]


def test_period_window_is_reported_for_labelling(summary):
    out = summary(period="week")
    assert out["period"] == "week"
    assert out["periodDays"] == 7
    assert out["periodEnd"] == DATE
    assert out["periodStart"] == "2026-08-30"   # 7 days inclusive
