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


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    raw: dict = {}
    if CONFIG_PATH.is_file():
        with CONFIG_PATH.open() as f:
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
    )
