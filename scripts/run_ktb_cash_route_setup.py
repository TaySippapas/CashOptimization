#!/usr/bin/env python3
"""Run a scripts/sql/*.sql file against the ktb_cash_route catalog.

Usage (from repo root):
  python3 scripts/run_ktb_cash_route_setup.py [path/to/file.sql]
  # defaults to scripts/sql/ktb_cash_route_setup.sql

Requires the CSVs already uploaded to the volume first:
  databricks fs cp mock_data/ dbfs:/Volumes/ktb_cash_route/ops/landing/ --recursive -p <profile>

If you hit `SSLCertVerificationError: self-signed certificate in certificate
chain`, your machine has a locally-trusted root CA (e.g. from a dev proxy)
that confuses this connector's system-trust SSL context. Force it to use the
clean certifi bundle instead:
  SSL_CERT_FILE=$(python3 -c "import certifi; print(certifi.where())") python3 scripts/run_ktb_cash_route_setup.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from server.uc_repo_v2 import _connection  # noqa: E402

DEFAULT_SQL_PATH = ROOT / "scripts" / "sql" / "ktb_cash_route_setup.sql"


def main() -> None:
    sql_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SQL_PATH
    raw = sql_path.read_text()
    # Strip full-line comments before splitting, so a statement preceded by a
    # comment block isn't mistaken for a comment-only (skippable) chunk.
    code_only = "\n".join(l for l in raw.splitlines() if not l.strip().startswith("--"))
    statements = [s.strip() for s in code_only.split(";") if s.strip()]
    with _connection() as conn:
        with conn.cursor() as cur:
            for i, stmt in enumerate(statements):
                cur.execute(stmt)
                print(f"[{i + 1}/{len(statements)}] OK: {stmt.splitlines()[0][:70]}")
    print(f"Setup complete ({sql_path}).")


if __name__ == "__main__":
    main()
