"""Flag study-plan sessions that fall outside availability or after a deadline.

The model is not trusted to notice these. Callers pass the sessions it
returned, the windows the student supplied, and due dates loaded from that
student's own items.
"""

from datetime import datetime, timedelta

OUTSIDE_AVAILABILITY = 'outside_availability'
AFTER_DEADLINE = 'after_deadline'


def _clock(value):
    hour, minute = value.split(':')
    return int(hour), int(minute)


def _on_date(day, clock):
    hour, minute = _clock(clock)
    return datetime(day.year, day.month, day.day, hour, minute)


def _covers(start, end, windows):
    """True when the whole session sits inside one same-day window.

    A session that runs past midnight cannot fit a same-day window.
    """
    if end.date() != start.date():
        return False
    for window in windows:
        if window['weekday'] != start.weekday():
            continue
        open_at = _on_date(start.date(), window['start'])
        close_at = _on_date(start.date(), window['end'])
        if start >= open_at and end <= close_at:
            return True
    return False


def flag_conflicts(sessions, availability, due_by_item):
    """Return copies of sessions with a ``conflicts`` list attached."""
    windows = availability or []
    flagged = []
    for session in sessions:
        start = _on_date(
            datetime.fromisoformat(session['date']).date(),
            session['start_time'],
        )
        end = start + timedelta(minutes=session['duration_minutes'])
        conflicts = []
        if not _covers(start, end, windows):
            conflicts.append(OUTSIDE_AVAILABILITY)
        due = due_by_item.get(session.get('item_id'))
        if due is not None and start.date() > due:
            conflicts.append(AFTER_DEADLINE)
        flagged.append({**session, 'conflicts': conflicts})
    return flagged
