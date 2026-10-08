"""Conflict flags for a suggested study plan."""

from datetime import date

from planning.services.study_plan import (
    AFTER_DEADLINE,
    OUTSIDE_AVAILABILITY,
    flag_conflicts,
)

WINDOW = {'weekday': 0, 'start': '09:00', 'end': '17:00'}


def _session(**overrides):
    session = {
        'item_id': 1,
        'date': '2026-10-05',  # Monday
        'start_time': '10:00',
        'duration_minutes': 60,
    }
    session.update(overrides)
    return session


def test_session_inside_the_window_and_before_the_deadline_is_clear():
    flagged = flag_conflicts(
        [_session()],
        [WINDOW],
        {1: date(2026, 10, 5)},
    )

    assert flagged[0]['conflicts'] == []


def test_session_outside_every_window_for_its_weekday_is_flagged():
    flagged = flag_conflicts(
        [_session(start_time='18:00')],
        [WINDOW],
        {1: date(2026, 10, 12)},
    )

    assert flagged[0]['conflicts'] == [OUTSIDE_AVAILABILITY]


def test_session_after_the_due_date_is_flagged():
    flagged = flag_conflicts(
        [_session(date='2026-10-06')],
        [{'weekday': 1, 'start': '09:00', 'end': '17:00'}],
        {1: date(2026, 10, 5)},
    )

    assert AFTER_DEADLINE in flagged[0]['conflicts']


def test_missing_due_date_does_not_flag_after_deadline():
    flagged = flag_conflicts([_session()], [WINDOW], {1: None})

    assert AFTER_DEADLINE not in flagged[0]['conflicts']


def test_session_that_crosses_midnight_is_outside_a_same_day_window():
    flagged = flag_conflicts(
        [_session(start_time='23:00', duration_minutes=90)],
        [{'weekday': 0, 'start': '22:00', 'end': '23:59'}],
        {1: date(2026, 10, 5)},
    )

    assert flagged[0]['conflicts'] == [OUTSIDE_AVAILABILITY]
