"""Build, flag, and store a study plan for one user.

The model is not trusted to notice conflicts or to name another student's
work. Callers pass the sessions it returned, the windows the student
supplied, and due dates loaded from that student's own items.
"""

import json
from datetime import date, datetime, timedelta

from django.utils import timezone

from planning.models import AssignmentDetail, PlanningItem, SchedulingState
from planning.services.llm import LLMError

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


def load_plan(user):
    state = SchedulingState.objects.filter(user=user).first()
    plan = state.study_plan if state else None
    if not plan or not plan.get('sessions'):
        plan = None
    return {'plan': plan, 'source': 'cache' if plan else None, 'error': None}


def request_plan(user, availability, notes=''):
    """Call the model. On failure, return the last saved plan and an error."""
    state, _ = SchedulingState.objects.get_or_create(user=user)
    state.study_preferences = {'availability': availability, 'notes': notes}
    state.save(update_fields=['study_preferences'])

    items = _open_items(user)
    try:
        from planning.services.llm import client_from_settings

        raw = client_from_settings().complete(_messages(items, availability, notes))
        sessions = raw.get('sessions')
        if not isinstance(sessions, list):
            raise LLMError(
                'The study plan service returned a plan that could not be read.'
            )
        cleaned = _clean_sessions(sessions, items)
        if items and not cleaned:
            raise LLMError(
                'The study plan service returned a plan that could not be read.'
            )
    except LLMError as exc:
        cached = _fallback(state, str(exc))
        if cached['plan'] is not None:
            # A saved suggestion wins over a fresh local order, including
            # when no key is configured. Replacing it would drop the last
            # model plan the student actually kept.
            return cached
        if exc.code == 'not_configured':
            return _local_plan(state, items)
        # No saved plan yet: still return a usable suggestion so a busy
        # provider does not leave the student with a blank 502.
        local = _local_plan(state, items)
        if local['plan'] is not None:
            local['error'] = str(exc)
            return local
        return cached

    return {
        'plan': _store(state, cleaned, items),
        'source': 'llm',
        'error': None,
    }


def save_edited_plan(user, sessions):
    """Replace the saved plan. Does not call the model."""
    state, _ = SchedulingState.objects.get_or_create(user=user)
    items = _open_items(user)
    cleaned = _clean_sessions(sessions, items)
    if not cleaned:
        raise ValueError('None of those sessions belong to your open work.')
    return {
        'plan': _store(state, cleaned, items),
        'source': 'cache',
        'error': None,
    }


def _local_plan(state, items):
    """Order open work from deadlines when no model key is configured."""
    if not items:
        return {
            'plan': None,
            'source': None,
            'error': 'You have no open tasks to schedule.',
        }
    windows = (state.study_preferences or {}).get('availability') or []
    sessions = _place_locally(items, windows, timezone.localdate())
    return {
        'plan': _store(state, sessions, items),
        'source': 'local',
        'error': None,
    }


def _place_locally(items, availability, today):
    ordered = sorted(
        items,
        key=lambda item: (item.due_date or date.max, item.id),
    )
    sessions = []
    for index, item in enumerate(ordered, start=1):
        day, start_time = _local_slot(item, availability, today)
        sessions.append({
            'item_id': item.id,
            'title': item.title,
            'date': day.isoformat(),
            'start_time': start_time,
            'duration_minutes': _local_minutes(item),
            'order': index,
        })
    return sessions


def _local_slot(item, availability, today):
    if availability:
        for offset in range(21):
            day = today + timedelta(days=offset)
            if item.due_date and day > item.due_date:
                break
            matches = [
                window for window in availability
                if window['weekday'] == day.weekday()
            ]
            if matches:
                return day, matches[0]['start']
    day = item.due_date or today
    start_time = availability[0]['start'] if availability else '09:00'
    return day, start_time


def _local_minutes(item):
    return {
        'UNDER_20_MINUTES': 20,
        'UNDER_1_HOUR': 60,
        'UNDER_4_HOURS': 90,
        'UNDER_8_HOURS': 120,
        'UNDER_16_HOURS': 180,
        'OVER_16_HOURS': 180,
    }.get(item.duration_category, 60)


def _open_items(user):
    return list(
        PlanningItem.objects.for_user(user)
        .actionable()
        .active()
        .select_related('assignment_detail')
    )


def _messages(items, availability, notes):
    payload = {
        'availability': availability,
        'notes': notes,
        'items': [_item_payload(item) for item in items],
    }
    return [
        {
            'role': 'system',
            'content': (
                'Return a JSON object with a sessions array. Each session has '
                'item_id, date (YYYY-MM-DD), start_time (HH:MM), '
                'duration_minutes, and order. Use only the given item ids. '
                'Schedule inside availability and on or before each due date.'
            ),
        },
        {'role': 'user', 'content': json.dumps(payload, default=str)},
    ]


def _item_payload(item):
    try:
        weight = item.assignment_detail.weight_percent
    except AssignmentDetail.DoesNotExist:
        weight = None
    return {
        'item_id': item.id,
        'title': item.title,
        'due_date': item.due_date.isoformat() if item.due_date else None,
        'percent_completed': str(item.percent_completed),
        'duration_category': item.duration_category,
        'weight_percent': None if weight is None else str(weight),
    }


def _clean_sessions(raw_sessions, items):
    by_id = {item.id: item for item in items}
    cleaned = []
    for index, raw in enumerate(raw_sessions or [], start=1):
        if not isinstance(raw, dict):
            continue
        try:
            item = by_id.get(int(raw['item_id']))
        except (KeyError, TypeError, ValueError):
            continue
        if item is None:
            continue
        try:
            date = raw['date'] if isinstance(raw['date'], str) else raw['date'].isoformat()
            datetime.fromisoformat(date)
            start = (
                raw['start_time']
                if isinstance(raw['start_time'], str)
                else raw['start_time'].strftime('%H:%M')
            )
            _clock(start)
            duration = int(raw['duration_minutes'])
            if duration < 1:
                continue
            order = int(raw['order']) if raw.get('order') is not None else index
        except (KeyError, TypeError, ValueError):
            continue
        cleaned.append({
            'item_id': item.id,
            'title': item.title,
            'date': date,
            'start_time': start,
            'duration_minutes': duration,
            'order': order,
        })
    cleaned.sort(key=lambda row: (row['order'], row['item_id']))
    return cleaned


def _store(state, sessions, items):
    due = {item.id: item.due_date for item in items}
    windows = (state.study_preferences or {}).get('availability') or []
    plan = {
        'generated_at': timezone.now().isoformat(),
        'sessions': flag_conflicts(sessions, windows, due),
    }
    state.study_plan = plan
    state.save(update_fields=['study_plan'])
    return plan


def _fallback(state, message):
    plan = state.study_plan if state.study_plan and state.study_plan.get('sessions') else None
    return {
        'plan': plan,
        'source': 'cache' if plan else None,
        'error': message,
    }
