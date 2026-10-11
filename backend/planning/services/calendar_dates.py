"""Authoritative user calendar dates; unset/invalid preferences fall back to UTC.

Timestamps remain aware instants. Explicit dates are already calendar values
and are returned unchanged. Planning Timezone records are unrelated.
"""

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.utils import timezone


def user_local_date(user, *, at=None, explicit_date=None):
    if explicit_date is not None:
        return explicit_date

    try:
        zone = ZoneInfo(getattr(user, 'time_zone', None) or 'UTC')
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        zone = ZoneInfo('UTC')

    instant = timezone.now() if at is None else at
    # Django rejects naive instants rather than using the host's timezone.
    return timezone.localdate(instant, timezone=zone)
