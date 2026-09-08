-- Align existing same-day branch forecasts with their position snapshot.
-- ACTUAL history and forecasts for other target dates are left untouched.
-- Safe to re-run: already aligned rows are not rewritten.
MERGE INTO ${catalog}.${schema}.fact_cash_flow_daily AS f
USING ${catalog}.${schema}.fact_cash_position AS p
ON f.branch_code = p.branch_code
  AND f.business_date = p.business_date
  AND f.series_date = p.business_date
  AND f.value_type = 'FORECAST'
WHEN MATCHED AND (
  NOT (f.deposit_amount_thb <=> p.predicted_deposit_d)
  OR NOT (f.withdrawal_amount_thb <=> p.predicted_withdrawal_d)
  OR NOT (f.net_amount_thb <=> p.predicted_deposit_d - p.predicted_withdrawal_d)
  OR NOT (f.remaining_amount_thb <=> p.predicted_cash_d)
) THEN UPDATE SET
  f.deposit_amount_thb = p.predicted_deposit_d,
  f.withdrawal_amount_thb = p.predicted_withdrawal_d,
  f.net_amount_thb = p.predicted_deposit_d - p.predicted_withdrawal_d,
  f.remaining_amount_thb = p.predicted_cash_d,
  f.updated_at = current_timestamp();
