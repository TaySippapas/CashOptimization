"""Load warehouse / Unity Catalog settings from config.yaml + env overrides."""
from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.yaml"


@dataclass(frozen=True)
class AppSettings:
    warehouse_id: str
    catalog: str
    schema: str
    business_date: str
    region_code: str
    region_name: str
    use_unity_catalog: bool
    pool_size: int
    pool_max_age_s: int
    result_cache_ttl_s: int

    @property
    def fq(self) -> str:
        """Fully-qualified schema: catalog.schema"""
        return f"{self.catalog}.{self.schema}"

    def table(self, name: str) -> str:
        return f"{self.fq}.{name}"


def _truthy(v: str | bool | None, default: bool = False) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in {"1", "true", "yes", "y", "on"}


def _positive_int(v: str | int | None, default: int) -> int:
    """Parse a tuning knob, falling back to the default on junk or non-positive.

    Zero is rejected rather than passed through: queue.LifoQueue treats
    maxsize=0 as *unbounded*, so a misconfigured pool_size of 0 would silently
    remove the pool's ceiling instead of disabling it.
    """
    if v is None or v == "":
        return default
    try:
        parsed = int(v)
    except (TypeError, ValueError):
        return default
    return parsed if parsed > 0 else default


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    raw: dict = {}
    if CONFIG_PATH.is_file():
        # Explicit UTF-8: the file has Thai comments and Windows defaults to cp1252.
        with CONFIG_PATH.open(encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}

    return AppSettings(
        warehouse_id=os.getenv("DATABRICKS_WAREHOUSE_ID")
        or str(raw.get("warehouse_id") or ""),
        catalog=os.getenv("APP_CATALOG") or str(raw.get("catalog") or ""),
        schema=os.getenv("APP_SCHEMA") or str(raw.get("schema") or ""),
        # Use "auto" to pick MAX(business_date) from UC app_settings at query time.
        business_date=os.getenv("APP_BUSINESS_DATE")
        or str(raw.get("business_date") or "auto"),
        region_code=os.getenv("APP_REGION_CODE")
        or str(raw.get("region_code") or "KK"),
        region_name=os.getenv("APP_REGION_NAME")
        or str(raw.get("region_name") or "Khon Kaen"),
        use_unity_catalog=_truthy(
            os.getenv("USE_UNITY_CATALOG"),
            default=_truthy(raw.get("use_unity_catalog"), True),
        ),
        # Warehouse connection pool / read cache tuning. pool_size 14 holds a
        # measured peak of 12-16 concurrent checkouts from two simultaneous
        # dashboard users (one user alone only reaches ~6, which is why it is
        # the wrong number to size from); these are settings rather than
        # constants so they can be retuned from the /api/v2/health counters
        # without a code change.
        pool_size=_positive_int(
            os.getenv("APP_POOL_SIZE"), _positive_int(raw.get("pool_size"), 14)
        ),
        pool_max_age_s=_positive_int(
            os.getenv("APP_POOL_MAX_AGE_S"), _positive_int(raw.get("pool_max_age_s"), 300)
        ),
        result_cache_ttl_s=_positive_int(
            os.getenv("APP_RESULT_CACHE_TTL_S"),
            _positive_int(raw.get("result_cache_ttl_s"), 180),
        ),
    )
