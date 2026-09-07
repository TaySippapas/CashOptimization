"""Fleet availability and route parameters."""
from __future__ import annotations

from typing import Any

from server.mappers.common import _date_str, _num
from server.repositories.common import _t
from server.warehouse import connection, execute_write, query


def fetch_fleet() -> list[dict[str, Any]]:
    """Return all trucks from dim_truck for the config page."""
    with connection() as conn:
        with conn.cursor() as cur:
            rows = query(
                cur,
                f"""SELECT truck_id, center_id, plate_number,
                       cash_capacity_thb, is_available, updated_at
                FROM {_t('dim_truck')}
                ORDER BY truck_id""",
            )
    return [
        {
            "truckId": r["truck_id"],
            "centerId": r.get("center_id") or "",
            "plateNumber": r.get("plate_number") or "",
            "cashCapacity": _num(r.get("cash_capacity_thb")),
            "isAvailable": bool(r.get("is_available", True)),
            "updatedAt": _date_str(r.get("updated_at")),
        }
        for r in rows
    ]


def update_truck_availability(truck_id: str, is_available: bool) -> bool:
    """Toggle is_available flag for a single truck. Returns True on success."""
    # execute_write invalidates the read cache for us — dim_truck feeds cached
    # route reads, which would otherwise serve the old flag for the whole TTL.
    execute_write(
        f"UPDATE {_t('dim_truck')} SET is_available = ?, updated_at = current_timestamp() WHERE truck_id = ?",
        [is_available, truck_id],
    )
    return True


def fetch_route_params() -> list[dict[str, Any]]:
    """Return all 24 route parameters grouped by type."""
    with connection() as conn:
        with conn.cursor() as cur:
            rows = query(
                cur,
                f"""SELECT parameter_type, parameter, description, value, remark, updated_at
                FROM {_t('dim_route_parameter')}
                ORDER BY parameter_type, parameter""",
            )
    return [
        {
            "parameterType": r["parameter_type"],
            "parameter": r["parameter"],
            "description": r.get("description") or "",
            "value": _num(r.get("value")),
            "remark": r.get("remark") or "",
            "updatedAt": _date_str(r.get("updated_at")),
        }
        for r in rows
    ]


def update_route_param(parameter: str, value: float) -> bool:
    """Update a single route parameter value. Returns True on success."""
    execute_write(
        f"UPDATE {_t('dim_route_parameter')} SET value = ?, updated_at = current_timestamp() WHERE parameter = ?",
        [value, parameter],
    )
    return True
