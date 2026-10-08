"""Study-plan API: suggestion, fallback, edit, and tenant isolation."""

from datetime import date

import pytest

from planning.models import AssignmentDetail, ItemType, PlanningItem, SchedulingState
from planning.services.llm import LLMError

pytestmark = pytest.mark.django_db

URL = '/api/planning/study-plans/'
WINDOWS = [{'weekday': 0, 'start': '09:00', 'end': '17:00'}]


class _Client:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = 0
        self.messages = None

    def complete(self, messages):
        self.calls += 1
        self.messages = messages
        if self.error:
            raise self.error
        return self.result


def _install(monkeypatch, client):
    monkeypatch.setattr(
        'planning.services.llm.client_from_settings',
        lambda: client,
    )


def _item(user, title='Essay', **fields):
    return PlanningItem.objects.create(
        user=user,
        title=title,
        item_type=ItemType.ASSIGNMENT,
        due_date=date(2026, 10, 12),
        **fields,
    )


def test_authenticated_post_returns_order_time_and_duration(api_for, user, monkeypatch):
    item = _item(user)
    AssignmentDetail.objects.create(planning_item=item, weight_percent='25.00')
    client = _Client(result={'sessions': [{
        'item_id': item.id,
        'date': '2026-10-05',
        'start_time': '10:00',
        'duration_minutes': 90,
        'order': 1,
    }]})
    _install(monkeypatch, client)

    response = api_for(user).post(URL, {'availability': WINDOWS}, format='json')

    assert response.status_code == 200
    body = response.json()
    assert body['source'] == 'llm'
    assert body['error'] is None
    session = body['plan']['sessions'][0]
    assert session['order'] == 1
    assert session['start_time'] == '10:00'
    assert session['duration_minutes'] == 90
    assert session['title'] == 'Essay'
    assert session['conflicts'] == []
    sent = client.messages[1]['content']
    assert 'Essay' in sent
    assert '2026-10-12' in sent
    assert '25.00' in sent


def test_conflicts_are_flagged_on_the_suggestion(api_for, user, monkeypatch):
    item = _item(user)
    client = _Client(result={'sessions': [{
        'item_id': item.id,
        'date': '2026-10-13',
        'start_time': '18:00',
        'duration_minutes': 30,
        'order': 1,
    }]})
    _install(monkeypatch, client)

    response = api_for(user).post(URL, {'availability': WINDOWS}, format='json')

    assert response.status_code == 200
    assert response.json()['plan']['sessions'][0]['conflicts'] == [
        'outside_availability',
        'after_deadline',
    ]


def test_anonymous_post_is_rejected(api):
    assert api.post(URL, {'availability': WINDOWS}, format='json').status_code == 401


def test_timeout_returns_the_cached_plan_and_leaves_workload_alone(
    api_for, user, monkeypatch
):
    item = _item(user)
    AssignmentDetail.objects.create(
        planning_item=item,
        weight_percent='20.00',
        mark_achieved='15.00',
    )
    SchedulingState.objects.create(
        user=user,
        study_plan={'generated_at': 'earlier', 'sessions': [{
            'item_id': item.id,
            'title': 'Essay',
            'date': '2026-10-05',
            'start_time': '10:00',
            'duration_minutes': 45,
            'order': 1,
            'conflicts': [],
        }]},
    )
    _install(monkeypatch, _Client(error=LLMError('The study plan service did not respond.')))

    response = api_for(user).post(URL, {'availability': WINDOWS}, format='json')

    assert response.status_code == 200
    body = response.json()
    assert body['source'] == 'cache'
    assert body['error']
    assert body['plan']['sessions'][0]['duration_minutes'] == 45
    item.refresh_from_db()
    assert item.title == 'Essay'
    assert str(item.assignment_detail.mark_achieved) == '15.00'


def test_malformed_plan_without_a_cache_falls_back_to_local_order(
    api_for, user, monkeypatch
):
    item = _item(user, title='Keep me')
    _install(
        monkeypatch,
        _Client(error=LLMError(
            'The study plan service returned a plan that could not be read.'
        )),
    )

    response = api_for(user).post(URL, {'availability': WINDOWS}, format='json')

    assert response.status_code == 200
    body = response.json()
    assert body['source'] == 'local'
    assert body['error']
    assert body['plan']['sessions'][0]['item_id'] == item.id
    item.refresh_from_db()
    assert item.title == 'Keep me'


def test_busy_provider_without_a_cache_falls_back_to_local_order(
    api_for, user, monkeypatch
):
    item = _item(user, title='Busy fallback')
    _install(
        monkeypatch,
        _Client(error=LLMError(
            'The study plan service is busy. Try again in a moment.',
            code='unavailable',
        )),
    )

    response = api_for(user).post(URL, {'availability': WINDOWS}, format='json')

    assert response.status_code == 200
    body = response.json()
    assert body['source'] == 'local'
    assert 'busy' in body['error'].lower()
    assert body['plan']['sessions'][0]['title'] == 'Busy fallback'


def test_edit_saves_sessions_without_calling_the_model(api_for, user, monkeypatch):
    item = _item(user)
    SchedulingState.objects.create(
        user=user,
        study_preferences={'availability': WINDOWS, 'notes': ''},
    )
    called = _Client(error=LLMError('should not be called'))
    _install(monkeypatch, called)

    response = api_for(user).patch(URL, {'sessions': [{
        'item_id': item.id,
        'date': '2026-10-05',
        'start_time': '11:00',
        'duration_minutes': 30,
        'order': 2,
    }]}, format='json')

    assert response.status_code == 200
    assert called.calls == 0
    session = response.json()['plan']['sessions'][0]
    assert session['start_time'] == '11:00'
    assert session['duration_minutes'] == 30
    assert session['conflicts'] == []
    assert SchedulingState.objects.get(user=user).study_plan['sessions'][0]['start_time'] == '11:00'


def test_another_user_cannot_read_the_saved_plan(api_for, user, other_user, monkeypatch):
    mine = _item(user, title='Alice only')
    theirs = _item(other_user, title='Bob only')
    client = _Client(result={'sessions': [
        {
            'item_id': mine.id,
            'date': '2026-10-05',
            'start_time': '10:00',
            'duration_minutes': 30,
            'order': 1,
        },
        {
            'item_id': theirs.id,
            'title': 'Bob only',
            'date': '2026-10-05',
            'start_time': '11:00',
            'duration_minutes': 30,
            'order': 2,
        },
    ]})
    _install(monkeypatch, client)

    created = api_for(user).post(URL, {'availability': WINDOWS}, format='json')
    assert created.status_code == 200
    body = created.json()
    assert [row['item_id'] for row in body['plan']['sessions']] == [mine.id]
    assert 'Bob only' not in created.content.decode()
    assert 'Bob only' not in client.messages[1]['content']
    assert 'Alice only' in client.messages[1]['content']

    leaked = api_for(other_user).get(URL)
    assert leaked.status_code == 200
    assert leaked.json()['plan'] is None
    assert 'Alice only' not in leaked.content.decode()


def test_blank_days_and_equal_times_still_return_a_plan(api_for, user, monkeypatch):
    """An empty day is skipped. A day that starts and ends together is kept."""
    item = _item(user)
    client = _Client(result={'sessions': [{
        'item_id': item.id,
        'date': '2026-10-05',
        'start_time': '09:00',
        'duration_minutes': 30,
        'order': 1,
    }]})
    _install(monkeypatch, client)

    response = api_for(user).post(URL, {'availability': [
        {'weekday': 0, 'start': '09:00', 'end': '09:00'},
    ]}, format='json')

    assert response.status_code == 200, response.content
    body = response.json()
    assert body['error'] is None
    assert body['plan']['sessions'][0]['item_id'] == item.id
    assert SchedulingState.objects.get(user=user).study_preferences['availability'] == [
        {'weekday': 0, 'start': '09:00', 'end': '09:00'},
    ]

    cleared = api_for(user).post(URL, {'availability': []}, format='json')
    assert cleared.status_code == 200, cleared.content
    assert cleared.json()['plan']['sessions'][0]['item_id'] == item.id


def test_missing_key_keeps_the_saved_plan(api_for, user, monkeypatch):
    item = _item(user, title='Keep the model plan')
    SchedulingState.objects.create(
        user=user,
        study_plan={'generated_at': 'earlier', 'sessions': [{
            'item_id': item.id,
            'title': 'Keep the model plan',
            'date': '2026-10-05',
            'start_time': '10:00',
            'duration_minutes': 45,
            'order': 1,
            'conflicts': [],
        }]},
    )
    _install(monkeypatch, _Client(error=LLMError(
        'The study plan service is not configured.',
        code='not_configured',
    )))

    response = api_for(user).post(URL, {'availability': WINDOWS}, format='json')

    assert response.status_code == 200
    body = response.json()
    assert body['source'] == 'cache'
    assert 'not configured' in body['error'].lower()
    assert body['plan']['sessions'][0]['duration_minutes'] == 45


def test_missing_key_without_a_cache_uses_local_order(api_for, user, monkeypatch):
    item = _item(user, title='Local only')
    _install(monkeypatch, _Client(error=LLMError(
        'The study plan service is not configured.',
        code='not_configured',
    )))

    response = api_for(user).post(URL, {'availability': WINDOWS}, format='json')

    assert response.status_code == 200
    body = response.json()
    assert body['source'] == 'local'
    assert body['error'] is None
    assert body['plan']['sessions'][0]['item_id'] == item.id


def test_patch_drops_another_users_item(api_for, user, other_user):
    mine = _item(user, title='Mine')
    theirs = _item(other_user, title='Theirs')

    mixed = api_for(user).patch(URL, {'sessions': [
        {
            'item_id': mine.id,
            'date': '2026-10-05',
            'start_time': '10:00',
            'duration_minutes': 30,
            'order': 1,
        },
        {
            'item_id': theirs.id,
            'date': '2026-10-05',
            'start_time': '11:00',
            'duration_minutes': 30,
            'order': 2,
        },
    ]}, format='json')

    assert mixed.status_code == 200
    body = mixed.json()
    assert [row['item_id'] for row in body['plan']['sessions']] == [mine.id]
    assert 'Theirs' not in mixed.content.decode()

    foreign_only = api_for(user).patch(URL, {'sessions': [{
        'item_id': theirs.id,
        'date': '2026-10-05',
        'start_time': '11:00',
        'duration_minutes': 30,
        'order': 1,
    }]}, format='json')

    assert foreign_only.status_code == 400
    assert 'Theirs' not in foreign_only.content.decode()
    saved = SchedulingState.objects.get(user=user).study_plan['sessions']
    assert [row['item_id'] for row in saved] == [mine.id]


def test_invalid_availability_does_not_clear_the_saved_plan(api_for, user):
    SchedulingState.objects.create(
        user=user,
        study_plan={'sessions': [{'item_id': 1, 'title': 'Stay'}]},
    )

    response = api_for(user).post(
        URL,
        {'availability': [{'weekday': 0, 'start': '17:00', 'end': '09:00'}]},
        format='json',
    )

    assert response.status_code == 400
    assert SchedulingState.objects.get(user=user).study_plan['sessions'][0]['title'] == 'Stay'
