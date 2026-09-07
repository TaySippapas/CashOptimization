"""SQL runner behavior without a live warehouse."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from scripts import run_ktb_cash_route_setup as runner
from server import warehouse


def test_default_dry_run_uses_current_schema_without_connecting(monkeypatch, capsys):
    def unexpected_connection():
        raise AssertionError("dry-run must not open a warehouse connection")

    monkeypatch.setattr(warehouse, "connection", unexpected_connection)
    monkeypatch.setattr(sys, "argv", ["runner", "--dry-run"])
    runner.main()
    output = capsys.readouterr().out
    assert "CREATE TABLE IF NOT EXISTS dim_route_parameter" in output
    assert "CREATE TABLE IF NOT EXISTS fact_route_summary" in output
    assert "no connection opened" in output


def test_runner_executes_explicit_file_in_order_on_one_connection(monkeypatch, tmp_path, opened):
    sql_path = tmp_path / "setup.sql"
    sql_path.write_text("-- first statement\nSELECT 1;\n  -- second statement\nSELECT 2;", encoding="utf-8")
    monkeypatch.setattr(sys, "argv", ["runner", str(sql_path)])
    runner.main()
    assert len(opened) == 1
    assert opened[0].executed == [("SELECT 1", None), ("SELECT 2", None)]


def test_redirected_cli_preserves_unicode_sql(tmp_path):
    sql_path = tmp_path / "unicode.sql"
    sql_path.write_text("SELECT 'ขอนแก่น';", encoding="utf-8")
    result = subprocess.run(
        [sys.executable, str(Path(runner.__file__)), str(sql_path), "--dry-run"],
        capture_output=True, text=True, encoding="utf-8", check=True,
    )
    assert "ขอนแก่น" in result.stdout
    assert "no connection opened" in result.stdout
