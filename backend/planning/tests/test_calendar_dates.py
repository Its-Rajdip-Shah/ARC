"""Calendar resolution at midnight/DST, independent of server timezone."""

from datetime import date, datetime
from types import SimpleNamespace

import pytest
from django.test import override_settings
from django.utils import timezone
from freezegun import freeze_time

from planning.services.calendar_dates import user_local_date


def instant(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00'))


@pytest.mark.parametrize('at,zone,expected', [
    ('2026-10-11T00:30:00Z', 'America/Los_Angeles', date(2026, 10, 10)),
    ('2026-10-11T00:30:00Z', 'Asia/Tokyo', date(2026, 10, 11)),
    ('2026-10-11T23:30:00Z', 'Asia/Tokyo', date(2026, 10, 12)),
    ('2026-10-03T15:59:59Z', 'Australia/Sydney', date(2026, 10, 4)),
    ('2026-10-03T16:00:00Z', 'Australia/Sydney', date(2026, 10, 4)),
    ('2026-11-01T08:59:59Z', 'America/Los_Angeles', date(2026, 11, 1)),
    ('2026-11-01T09:00:00Z', 'America/Los_Angeles', date(2026, 11, 1)),
    ('2026-10-04T12:59:59Z', 'Australia/Sydney', date(2026, 10, 4)),
    ('2026-10-04T13:00:00Z', 'Australia/Sydney', date(2026, 10, 5)),
])
def test_user_calendar_at_midnight_and_dst(at, zone, expected):
    with override_settings(TIME_ZONE='Pacific/Honolulu'), timezone.override('Europe/London'):
        result = user_local_date(SimpleNamespace(time_zone=zone), at=instant(at))
    assert result == expected
    assert type(result) is date


@pytest.mark.parametrize('zone', [None, '', 'Not/AZone', '../UTC', 'UTC'])
def test_missing_or_invalid_zone_uses_utc(zone):
    with timezone.override('Asia/Tokyo'):
        assert user_local_date(SimpleNamespace(time_zone=zone), at=instant('2026-10-11T23:30:00Z')) == date(2026, 10, 11)


def test_explicit_date_is_returned_unchanged():
    explicit = date(2020, 1, 1)
    assert user_local_date(None, at='unused', explicit_date=explicit) is explicit


@freeze_time('2026-10-11T00:30:00Z')
def test_default_instant_and_missing_attribute():
    assert user_local_date(SimpleNamespace(time_zone='America/Los_Angeles')) == date(2026, 10, 10)
    assert user_local_date(SimpleNamespace()) == date(2026, 10, 11)


def test_naive_instant_is_rejected_without_host_timezone_assumptions():
    with pytest.raises(ValueError):
        user_local_date(None, at=datetime(2026, 10, 11))
