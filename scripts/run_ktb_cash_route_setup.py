#!/usr/bin/env python3
"""Run reviewed SQL using the V2 warehouse connection.

Defaults to the current schema. See scripts/README.md for migrations and seeds.
Use --dry-run to inspect statements without connecting.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
DEFAULT_SQL_PATH = ROOT / "scripts" / "sql" / "schema" / "v2_schema_setup.sql"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sql_path", nargs="?", type=Path, default=DEFAULT_SQL_PATH)
    parser.add_argument("--dry-run", action="store_true", help="Print SQL without connecting or executing")
    args = parser.parse_args()
    raw = args.sql_path.read_text(encoding="utf-8")
    # Repository scripts use semicolon-delimited statements, without embedded
    # semicolons in string literals or procedural blocks.
    code = "\n".join(line for line in raw.splitlines() if not line.lstrip().startswith("--"))
    statements = [statement.strip() for statement in code.split(";") if statement.strip()]
    if args.dry_run:
        print(f"{len(statements)} statements from {args.sql_path} (no connection opened)")
        for i, statement in enumerate(statements, 1):
            print(f"\n-- [{i}/{len(statements)}]\n{statement};")
        return

    from server.warehouse import connection

    with connection() as conn:
        with conn.cursor() as cur:
            for i, statement in enumerate(statements, 1):
                cur.execute(statement)
                print(f"[{i}/{len(statements)}] OK: {statement.splitlines()[0][:70]}")
    print(f"Setup complete ({args.sql_path}).")


if __name__ == "__main__":
    # Redirected Windows stdout can default to cp1252; SQL includes Thai text.
    sys.stdout.reconfigure(encoding="utf-8")
    main()
