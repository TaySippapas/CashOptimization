"""Date-window maths behind the Overview period selector.

_shift_days is on the unconditional path of every fetch_overview_summary call,
so a NameError in it takes the whole endpoint down — which is exactly what a
missing `date` import did after the warehouse extraction, unnoticed because no
test exercised it.
"""
from __future__ import annotations

import pytest

from server.repositories.overview import PERIOD_DAYS, _shift_days


def test_day_period_is_a_single_date():
    """days-1 == 0, so the window start equals the selected date."""
    assert _shift_days("2026-09-05", PERIOD_DAYS["day"] - 1) == "2026-09-05"


@pytest.mark.parametrize("period, expected", [
    ("week", "2026-08-30"),      # 7 days inclusive
    ("month", "2026-08-07"),     # 30 days inclusive
])
def test_multi_day_windows_count_back_inclusively(period, expected):
    assert _shift_days("2026-09-05", PERIOD_DAYS[period] - 1) == expected


def test_crosses_a_month_boundary():
    assert _shift_days("2026-03-02", 5) == "2026-02-25"


def test_handles_a_leap_day():
    assert _shift_days("2024-03-01", 1) == "2024-02-29"


def test_accepts_a_timestamp_shaped_value():
    """The warehouse can hand back 'YYYY-MM-DD HH:MM:SS'; only the date matters."""
    assert _shift_days("2026-09-05 13:45:00", 1) == "2026-09-04"


def test_none_passes_through():
    assert _shift_days(None, 3) is None


def test_every_period_the_router_accepts_is_mapped():
    """The router's regex and this table must not drift apart."""
    assert set(PERIOD_DAYS) == {"day", "week", "month", "quarter", "year"}
    for period in PERIOD_DAYS:
        assert _shift_days("2026-09-05", PERIOD_DAYS[period] - 1)
