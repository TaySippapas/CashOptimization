"""Tuning knobs resolve env -> config.yaml -> default, and reject bad values."""
from __future__ import annotations

import pytest

from server.settings import _positive_int


@pytest.mark.parametrize("raw, expected", [
    ("20", 20),
    (20, 20),          # yaml gives a real int
    ("  20  ", 20),
    (None, 14),
    ("", 14),
    ("abc", 14),
    ("-5", 14),
    ("1.5", 14),
])
def test_positive_int_parsing(raw, expected):
    assert _positive_int(raw, 14) == expected


def test_zero_falls_back_to_the_default():
    """queue.LifoQueue(maxsize=0) is *unbounded*, so 0 must never reach it."""
    assert _positive_int(0, 14) == 14
    assert _positive_int("0", 14) == 14


def test_pool_uses_a_bounded_queue():
    from server import warehouse

    assert warehouse._pool.maxsize == warehouse._POOL_SIZE
    assert warehouse._pool.maxsize > 0, "an unbounded pool would defeat the ceiling"
