"""Cash-flow history and denomination gaps."""
from __future__ import annotations

from typing import Any

from server.repositories.common import _resolve_date, _t
from server.warehouse import connection, query


def fetch_cash_flow(entity_type: str, entity_code: str, business_date: str | None = None) -> list[dict[str, Any]]:
    if entity_type not in {"BRANCH", "MACHINE"}:
        raise ValueError("entity_type must be BRANCH or MACHINE")
    if entity_type == "MACHINE":
        # Machine flow table not yet migrated — return empty
        return []
    with connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_date(cur, business_date)
            return query(
                cur,
                f"""
                SELECT series_date, value_type, deposit_amount_thb, withdrawal_amount_thb,
                       net_amount_thb, remaining_amount_thb
                FROM {_t('fact_cash_flow_daily')}
                WHERE business_date = ? AND branch_code = ?
                ORDER BY series_date
                """,
                [d, entity_code],
            )


def fetch_denomination_gap(entity_type: str, entity_code: str, business_date: str | None = None) -> list[dict[str, Any]]:
    if entity_type not in {"BRANCH", "MACHINE"}:
        raise ValueError("entity_type must be BRANCH or MACHINE")
    if entity_type == "MACHINE":
        # Machine denomination table not yet migrated — return empty
        return []
    with connection() as conn:
        with conn.cursor() as cur:
            d = _resolve_date(cur, business_date)
            return query(
                cur,
                f"""
                SELECT denomination_thb, target_note_count, target_amount_thb, target_mix_pct,
                       actual_note_count_d_minus_1, actual_mix_pct, delivery_note_count, delivery_amount_thb
                FROM {_t('fact_branch_denomination')}
                WHERE business_date = ? AND branch_code = ?
                ORDER BY denomination_thb DESC
                """,
                [d, entity_code],
            )
