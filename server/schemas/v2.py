"""Request and response contracts for /api/v2."""
from __future__ import annotations

from datetime import date
from pydantic import BaseModel


class Branch(BaseModel):
    branch_code: str
    branch_name: str | None = None
    district_name: str | None = None
    region_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    is_depot: bool | None = None
    cash_capacity_thb: float | None = None
    min_threshold_thb: float | None = None
    opening_cash_thb: float | None = None
    predicted_cash_thb: float | None = None
    predicted_inflow_thb: float | None = None
    predicted_outflow_thb: float | None = None
    action_type: str | None = None
    health_status: str | None = None
    emergency_flag: bool | None = None


class Machine(BaseModel):
    machine_id: str
    machine_type: str | None = None
    location_name: str | None = None
    region_code: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    alltime_max_cash_thb: float | None = None
    opening_cash_thb: float | None = None
    predicted_cash_thb: float | None = None
    predicted_inflow_thb: float | None = None
    predicted_outflow_thb: float | None = None
    action_type: str | None = None
    health_status: str | None = None


class CashFlowPoint(BaseModel):
    series_date: date
    value_type: str
    deposit_amount_thb: float | None = None
    withdrawal_amount_thb: float | None = None
    net_amount_thb: float | None = None
    remaining_amount_thb: float | None = None


class DenominationGap(BaseModel):
    denomination_thb: int
    predicted_note_count: int | None = None
    predicted_amount_thb: float | None = None
    predicted_mix_pct: float | None = None
    actual_note_count: int | None = None
    actual_mix_pct: float | None = None
    gap_note_count: int | None = None
    gap_amount_thb: float | None = None


class RouteStop(BaseModel):
    stop_sequence: int
    stop_code: str | None = None
    stop_name: str | None = None
    stop_type: str | None = None
    stop_status: str | None = None
    eta: str | None = None
    amount_thb: float | None = None
    latitude: float | None = None
    longitude: float | None = None
    leg_km: float | None = None
    cumulative_km: float | None = None


class Route(BaseModel):
    route_id: str
    business_date: date
    plan_type: str
    route_label: str | None = None
    truck_id: str | None = None
    driver_name: str | None = None
    depot_code: str | None = None
    route_status: str | None = None
    total_stops: int | None = None
    total_distance_km: float | None = None
    cost_of_transport_thb: float | None = None
    total_cash_delivered_thb: float | None = None
    total_cash_collected_thb: float | None = None
    stops: list[RouteStop] = []


class TruckAvailabilityUpdate(BaseModel):
    truckId: str
    isAvailable: bool


class RouteParamUpdate(BaseModel):
    parameter: str
    value: float
