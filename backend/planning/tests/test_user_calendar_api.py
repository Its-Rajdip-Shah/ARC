"""Real scheduling/API boundaries consume the authenticated account calendar."""

from datetime import date

import pytest
from freezegun import freeze_time

from planning.models import SchedulingState
from planning.services import scheduling, scheduler_v1, scheduler_worker

pytestmark = pytest.mark.django_db


def publish(user):
    state = SchedulingState.objects.get(user=user)
    assert state.scheduling_revision > state.applied_scheduling_revision
    assert scheduler_worker.process_request(user.pk, state.scheduling_revision) == 'published'
    state.refresh_from_db()
    assert state.applied_scheduling_revision == state.scheduling_revision


@freeze_time('2026-10-11T00:30:00Z')
@pytest.mark.parametrize('zone,today', [
    ('America/Los_Angeles', date(2026, 10, 10)),
    ('Asia/Tokyo', date(2026, 10, 11)),
    (None, date(2026, 10, 11)),
])
def test_schedule_focus_and_daily_maintenance_share_user_date(user, make_item, api_for, zone, today):
    user.time_zone = zone
    user.save(update_fields=['time_zone'])
    item = make_item(user, 'Local task', duration_category='UNDER_1_HOUR')
    scheduling.daily_schedule(user)
    publish(user)
    item.refresh_from_db()
    assert item.scheduled_date == today
    assert SchedulingState.objects.get(user=user).last_global_date == today
    client = api_for(user)
    response = client.get('/api/planning/focus/')
    assert response.status_code == 200
    assert response.data['today'] == today.isoformat()
    request = scheduler_v1.build_scheduler_input(user, flavour='lock-in')
    assert request.today == today
    explicit = date(2026, 9, 20)
    assert scheduler_v1.build_scheduler_input(user, flavour='lock-in', today=explicit).today == explicit
    scheduling.schedule(user, today=explicit, mode='global')
    item.refresh_from_db()
    assert item.scheduled_date == explicit


@freeze_time('2026-10-11T00:30:00Z')
@pytest.mark.parametrize('zone,today', [
    ('America/Los_Angeles', date(2026, 10, 10)),
    ('Asia/Tokyo', date(2026, 10, 11)),
])
def test_anchor_validation_and_do_today_use_user_calendar(user, make_item, api_for, zone, today):
    user.time_zone = zone
    user.save(update_fields=['time_zone'])
    item = make_item(user, 'Anchor task', duration_category='UNDER_1_HOUR')
    client = api_for(user)
    # UTC's previous day is still actionable in Los Angeles, but past in Tokyo.
    response = client.post('/api/planning/timeline/anchor/', {
        'item_id': item.pk, 'date': '2026-10-10',
    }, format='json')
    assert response.status_code == (200 if today.day == 10 else 409)
    if today.day == 11:
        assert response.data['conflicts'][0]['code'] == 'past_date'
    response = client.post('/api/planning/focus/do-today/', {'item_id': item.pk}, format='json')
    assert response.status_code == 200
    publish(user)
    item.refresh_from_db()
    assert item.manual_requested_date == today
    assert item.scheduled_date == today


@freeze_time('2026-10-11T00:30:00Z')
def test_timeline_get_retains_historical_queries_and_uses_user_day(user, make_item, api_for):
    user.time_zone = 'America/Los_Angeles'
    user.save(update_fields=['time_zone'])
    make_item(user, 'Task', duration_category='UNDER_1_HOUR')
    response = api_for(user).get('/api/planning/timeline/', {'from': '2026-09-01', 'to': '2026-09-10'})
    assert response.status_code == 200

    # A historical GET is read-only: it must not initiate daily maintenance.
    assert SchedulingState.objects.get(user=user).last_global_date is None

    # The explicit daily-maintenance boundary uses the user's local date,
    # independently of the historical Timeline query window.
    scheduling.daily_schedule(user)
    assert SchedulingState.objects.get(user=user).last_global_date == date(2026, 10, 10)
