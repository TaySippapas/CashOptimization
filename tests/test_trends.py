from datetime import date, timedelta
import sqlite3

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from server.api.v2 import router
from server.repositories import trends


def summary(result, key):
    return next(m for m in result['metrics'] if m['key'] == key)


def test_percentages_weight_raw_amounts_instead_of_averaging_daily_percentages():
    definition = next(m for m in trends.metrics_for('branches') if m['key'] == 'utilization')
    value, days = trends.rollup([{'openingCash': 90, '_capacity': 100}, {'openingCash': 10, '_capacity': 900}], definition)
    assert value == pytest.approx(10)  # 100 / 1000, not mean(90%, 1.11%)
    assert days == 2


def test_rates_change_in_percentage_points_and_balances_use_daily_average():
    rows = [{'date': date(2026, 9, i), 'entities': 10, 'openingCash': 60 if i < 4 else 65, '_capacity': 100} for i in range(1, 7)]
    result = trends.assemble('branches', '3days', date(2026, 9, 6), rows, {})
    rate = summary(result, 'utilization')
    assert rate['value'] == 65
    assert rate['change'] == 5
    assert rate['changeUnit'] == 'pp'
    cash = summary(result, 'openingCash')
    assert cash['value'] == 65  # balances must not be added across dates
    assert cash['change'] == pytest.approx(100 * 5 / 60)
    assert cash['changeUnit'] == '%'


def test_partial_actuals_preserve_missing_date_and_suppress_comparison():
    rows = [{'date': date(2026, 9, i), 'actualDeposit': 100, 'entities': 14} for i in range(1, 6)]
    result = trends.assemble('branches', '3days', date(2026, 9, 6), rows, {})
    actual = summary(result, 'actualDeposit')
    assert actual['value'] == 200
    assert actual['coveredDays'] == 2
    assert actual['previousValue'] == 300
    assert actual['change'] is None
    assert result['points'][-1]['actualDeposit'] is None


@pytest.mark.parametrize('baseline', [0, -100])
def test_zero_and_negative_baselines_do_not_produce_misleading_growth(baseline):
    rows = [{'date': date(2026, 9, i), 'actualNet': baseline if i < 4 else 100} for i in range(1, 7)]
    result = trends.assemble('branches', '3days', date(2026, 9, 6), rows, {})
    assert summary(result, 'actualNet')['change'] is None


def test_zero_rate_is_real_data_but_zero_denominator_is_unknown():
    definition = next(m for m in trends.metrics_for('routes') if m['key'] == 'completion')
    assert trends.rollup([{'completed': 0, 'stops': 5}], definition) == (0, 1)
    assert trends.rollup([{'completed': 0, 'stops': 0}], definition) == (None, 0)
    assert trends.rollup([{'completed': None, 'stops': 5}], definition) == (None, 0)


@pytest.mark.parametrize('period,days', trends.PERIOD_DAYS.items())
def test_rolling_windows_are_inclusive_and_previous_window_never_overlaps(period, days):
    end = date(2024, 3, 1)  # includes leap day
    result = trends.assemble('routes', period, end, [], {})
    assert len(result['points']) == days
    assert result['end'] == end.isoformat()
    assert result['start'] == (end - timedelta(days=days - 1)).isoformat()
    assert result['previousEnd'] == (end - timedelta(days=days)).isoformat()
    assert result['previousStart'] == (end - timedelta(days=2 * days - 1)).isoformat()
    assert result['coveredDays'] == 0
    assert all(m['value'] is None and m['change'] is None for m in result['metrics'])


def test_endpoint_passes_dataset_period_and_end_without_replacing_date(monkeypatch):
    calls = []
    monkeypatch.setattr(trends, 'fetch_trends', lambda *args: calls.append(args) or {'metrics': []})
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        assert client.get('/api/v2/trends/machines?period=year&end=2026-09-05').status_code == 200
        assert calls == [('machines', 'year', '2026-09-05')]
        for path in ['/api/v2/trends/unknown', '/api/v2/trends/routes?period=all', '/api/v2/trends/routes?end=2026-02-30']:
            assert client.get(path).status_code == 422
        assert len(calls) == 1


def test_endpoint_failure_is_not_returned_as_empty_success(monkeypatch):
    def fail(*args):
        raise RuntimeError('internal connection details')
    monkeypatch.setattr(trends, 'fetch_trends', fail)
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        response = client.get('/api/v2/trends/routes')
        assert response.status_code == 503
        assert 'internal connection' not in response.text


@pytest.mark.parametrize('dataset,entity', [('branches', 'branch_code'), ('machines', 'machine_id')])
def test_flow_query_counts_latest_actual_once_and_excludes_future_snapshots(monkeypatch, dataset, entity):
    # This query uses portable SQL: execute it against a tiny overlapping history.
    monkeypatch.setattr(trends, '_t', lambda name: 'flows')
    with sqlite3.connect(':memory:') as db:
        db.execute(f'CREATE TABLE flows ({entity} TEXT, business_date TEXT, series_date TEXT, updated_at TEXT, value_type TEXT, deposit_amount_thb REAL, withdrawal_amount_thb REAL, net_amount_thb REAL)')
        db.executemany('INSERT INTO flows VALUES (?,?,?,?,?,?,?,?)', [
            ('A', '2026-09-04', '2026-09-03', '2026-09-04', 'ACTUAL', 10, 2, 8),
            ('A', '2026-09-05', '2026-09-03', '2026-09-05T01', 'ACTUAL', 12, 2, 10),
            ('A', '2026-09-05', '2026-09-03', '2026-09-05T02', 'ACTUAL', 15, 2, 13),
            ('A', '2026-09-06', '2026-09-03', '2026-09-06', 'ACTUAL', 999, 2, 997),
            ('A', '2026-09-03', '2026-09-03', '2026-09-03', 'FORECAST', 888, 2, 886),
            ('B', '2026-09-04', '2026-09-03', '2026-09-04', 'ACTUAL', 20, 3, 17),
        ])
        rows = db.execute(trends._flow_sql(dataset), ['2026-09-05', '2026-09-01', '2026-09-05']).fetchall()
    assert rows == [('2026-09-03', 2, 35, 5, 30)]
