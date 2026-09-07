"""In-memory SQL connection and cursor doubles; never contact Databricks."""
from __future__ import annotations


class FakeCursor:
    def __init__(self, conn: "FakeConn") -> None:
        self.conn = conn
        self.description = [(c,) for c in conn.cols]

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def execute(self, statement: str, params: object = None) -> None:
        self.conn.executed.append((statement, params))
        self.last = statement
        if self.conn.fail_with is not None:
            raise self.conn.fail_with
        if self.conn.fail_on and self.conn.fail_on in statement:
            raise ValueError(f"statement rejected: {self.conn.fail_on}")

    def fetchall(self) -> list[tuple]:
        # Echoing the statement lets a test assert that result[i] really came
        # from items[i], which connection identity cannot show once the pool
        # hands the same connection to different statements.
        return [(self.last,)] if self.conn.echo else self.conn.rows


class FakeConn:
    """Stand-in for a databricks-sql connection.

    `fail_with` makes every statement on it raise — how a connection that died
    while sitting in the pool behaves. `fail_on` fails only statements
    containing a marker, which models a genuinely broken *query* that no
    amount of reconnecting will fix.
    """

    def __init__(
        self,
        rows: list[tuple] | None = None,
        fail_with: Exception | None = None,
        fail_on: str | None = None,
        echo: bool = False,
        cols: list[str] | None = None,
    ) -> None:
        self.rows = rows if rows is not None else [("ok",)]
        self.fail_with = fail_with
        self.fail_on = fail_on
        self.echo = echo
        self.cols = cols or ["value"]
        self.executed: list[tuple] = []
        self.closed = False

    def cursor(self) -> FakeCursor:
        return FakeCursor(self)

    def close(self) -> None:
        self.closed = True
