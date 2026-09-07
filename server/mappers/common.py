"""Row coercion and UI enum mappings shared by both database pipelines."""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any


def _num(v: Any, default: float = 0.0) -> float:
    if v is None:
        return default
    if isinstance(v, Decimal):
        return float(v)
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _int(v: Any, default: int = 0) -> int:
    return int(_num(v, default))


def _bool(v: Any) -> bool:
    if isinstance(v, bool):
        return v
    if v is None:
        return False
    return str(v).lower() in {"1", "true", "t", "y", "yes"}


def _date_str(v: Any) -> str:
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    return str(v)[:10] if v is not None else ""


def _day_label(v: Any) -> str:
    """Format series_date as 'DD MMM' for trend charts."""
    s = _date_str(v)
    try:
        d = date.fromisoformat(s)
        return d.strftime("%d %b")
    except ValueError:
        return s


_ACTION_UI = {
    "DELIVERY": "Deliver",
    "DELIVER": "Deliver",
    "PICKUP": "Pickup",
    "BOTH": "Both",
    "NO_ACTION": "No Action",
    "NO ACTION": "No Action",
    "OK": "No Action",
}

_HEALTH_UI = {
    "HEALTHY": "Healthy",
    "WATCH": "Watch",
    "ACTION_NEEDED": "Action Needed",
    "ACTION NEEDED": "Action Needed",
    "CRITICAL": "Critical",
    "NO_DATA": "No Data",
}

_RISK_UI = {
    "VERY_HIGH": "Very High",
    "HIGH": "High",
    "MEDIUM": "Medium",
    "LOW": "Low",
}

_ROUTE_STATUS_UI = {
    "ON_TRACK": "On Track",
    "DELAYED": "Delayed",
    "AT_RISK": "At Risk",
}

_STOP_TYPE_UI = {
    "START": "Start",
    "DELIVERY": "Deliver",
    "DELIVER": "Deliver",
    "PICKUP": "Pickup",
    "MIXED": "Mixed",
    "BOTH": "Mixed",
    "RETURN": "Return",
    "EMERGENCY": "Deliver",
}

_STOP_STATUS_UI = {
    "COMPLETED": "Completed",
    "IN_PROGRESS": "In Progress",
    "PENDING": "Pending",
}


def _map_action(v: Any) -> str:
    return _ACTION_UI.get(str(v or "").upper().replace("-", "_"), str(v or "No Action"))


def _map_health(v: Any) -> str:
    key = str(v or "").upper().replace(" ", "_")
    return _HEALTH_UI.get(key, str(v or "Healthy"))


def _map_risk(v: Any) -> str:
    key = str(v or "").upper().replace(" ", "_")
    return _RISK_UI.get(key, str(v or "Low"))
