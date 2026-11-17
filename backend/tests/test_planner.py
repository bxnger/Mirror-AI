import pytest

from app.services.planner import split_minutes
from app.services.reality import round_half


@pytest.mark.parametrize("total,session,expected", [
    (240, 90, [80, 80, 80]),
    (360, 90, [90, 90, 90, 90]),
    (120, 90, [60, 60]),
    (105, 45, [35, 35, 35]),
    (75, 45, [40, 35]),
    (30, 90, [30]),
    (0, 90, []),
])
def test_split_minutes(total, session, expected):
    parts = split_minutes(total, session)
    assert parts == expected
    assert sum(parts) == total
    assert all(p <= session for p in parts)


def test_round_half():
    assert round_half(2.33) == 2.5
    assert round_half(2.2) == 2.0
