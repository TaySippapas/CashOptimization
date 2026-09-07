"""Compatibility imports for existing V2 repository callers.

New code imports the owning domain from server.repositories. Connection
management lives in server.warehouse; row conversions live in server.mappers.
"""
from server.repositories.common import clear_date_cache as clear_date_cache
from server.repositories.common import latest_business_date as latest_business_date
from server.repositories.health import health as health
from server.repositories.health import fetch_date_range as fetch_date_range
from server.repositories.branches import fetch_branches as fetch_branches
from server.repositories.branches import fetch_branch_tracks as fetch_branch_tracks
from server.repositories.branches import fetch_branch_inputs as fetch_branch_inputs
from server.repositories.machines import fetch_machines as fetch_machines
from server.repositories.machines import fetch_machine_tracks as fetch_machine_tracks
from server.repositories.cash_flow import fetch_cash_flow as fetch_cash_flow
from server.repositories.cash_flow import fetch_denomination_gap as fetch_denomination_gap
from server.repositories.routes import fetch_routes as fetch_routes
from server.repositories.routes import fetch_route_executions as fetch_route_executions
from server.repositories.fleet import fetch_fleet as fetch_fleet
from server.repositories.fleet import update_truck_availability as update_truck_availability
from server.repositories.fleet import fetch_route_params as fetch_route_params
from server.repositories.fleet import update_route_param as update_route_param
from server.repositories.overview import fetch_overview_summary as fetch_overview_summary

__all__ = [
    "clear_date_cache",
    "latest_business_date",
    "health",
    "fetch_date_range",
    "fetch_branches",
    "fetch_branch_tracks",
    "fetch_branch_inputs",
    "fetch_machines",
    "fetch_machine_tracks",
    "fetch_cash_flow",
    "fetch_denomination_gap",
    "fetch_routes",
    "fetch_route_executions",
    "fetch_fleet",
    "update_truck_availability",
    "fetch_route_params",
    "update_route_param",
    "fetch_overview_summary",
]
