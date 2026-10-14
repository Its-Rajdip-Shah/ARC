"""Automatic recovery releases scheduling bounds, never canonical deadlines."""
from datetime import date, timedelta

import pytest
from django.core.exceptions import ValidationError
from freezegun import freeze_time

from planning.models import DurationCategory, ItemType, PlanningDependency, SchedulerAllocation, SchedulingState
from planning.services import hierarchy, overdue, scheduler_v1, scheduling
from planning.services.history import serialize_item

pytestmark = pytest.mark.django_db
DUE = date(2026, 10, 10)
TODAY = date(2026, 10, 11)


@pytest.fixture(autouse=True)
def clock():
    with freeze_time('2026-10-11T12:00:00Z'):
        yield


@pytest.mark.parametrize('flavour', [None, 'lock-in', 'monk'])
@pytest.mark.parametrize('category', [DurationCategory.UNDER_1_HOUR, DurationCategory.UNDER_8_HOURS])
def test_recovery_preserves_facts_history_and_overdue_without_false_conflicts(user, make_item, flavour, category):
    SchedulingState.objects.create(user=user, scheduler_flavour=flavour)
    item = make_item(user, 'Missed deadline', due_date=DUE, start_date=DUE - timedelta(days=1),
                     duration_category=category, expired_manual_requested_date=DUE - timedelta(days=4))
    before = serialize_item(item)
    result = scheduling.daily_schedule(user, today=TODAY)
    item.refresh_from_db()
    for key in ('due_date', 'start_date', 'is_completed', 'expired_manual_requested_date'):
        assert serialize_item(item)[key] == before[key]
    assert item.scheduled_date >= TODAY
    assert overdue.is_overdue(item, TODAY)
    assert [entry['item'].pk for entry in overdue.classify(user, TODAY)['recent']] == [item.pk]
    assert {'item_id': item.pk, 'code': 'overdue'} in result['conflicts']
    assert not {'after_deadline', 'allocation_after_deadline', 'no_capacity_before_deadline'} & {
        row['code'] for row in result['conflicts'] if row['item_id'] == item.pk
    }
    request = scheduler_v1.build_scheduler_input(user, flavour='lock-in', today=TODAY)
    assert request.tasks[0].due_date is None
    allocations = list(SchedulerAllocation.objects.filter(item=item).values_list('scheduled_date', 'percentage', 'execution_rank'))
    if category == DurationCategory.UNDER_8_HOURS:
        assert allocations and all(day >= TODAY for day, _, _ in allocations)
    again = scheduling.reconcile(user, today=TODAY)
    item.refresh_from_db()
    assert again['changed_ids'] == []
    assert list(SchedulerAllocation.objects.filter(item=item).values_list('scheduled_date', 'percentage', 'execution_rank')) == allocations


@pytest.mark.parametrize('flavour', [None, 'lock-in', 'monk'])
def test_future_recovery_remains_visibly_overdue(user, make_item, flavour, api_for):
    SchedulingState.objects.create(user=user, scheduler_flavour=flavour)
    item = make_item(user, 'Recover tomorrow', due_date=DUE, start_date=TODAY + timedelta(days=1),
                     duration_category=DurationCategory.UNDER_1_HOUR)
    scheduling.daily_schedule(user, today=TODAY)
    item.refresh_from_db()
    assert item.scheduled_date > TODAY
    assert item.due_date == DUE
    response = api_for(user).get('/api/planning/timeline/', {'from': TODAY.isoformat(), 'to': (TODAY + timedelta(days=10)).isoformat()})
    assert response.status_code == 200
    rows = [row for group in response.data['groups'] for row in group['items']]
    row = next(row for row in rows if row['id'] == item.pk)
    assert row['overdue'] is True
    assert row['scheduled_date'] > TODAY.isoformat()


def test_minimal_recovery_uses_available_capacity(user, make_item, monkeypatch):
    monkeypatch.setitem(scheduling.BASELINE_SCHEDULER_CAPACITY, DurationCategory.UNDER_1_HOUR, 1)
    make_item(user, 'Today committed', manual_requested_date=TODAY, manual_anchor_origin_date=TODAY)
    item = make_item(user, 'Recover tomorrow', due_date=DUE)
    scheduling.daily_schedule(user, today=TODAY)
    item.refresh_from_db()
    assert item.scheduled_date == TODAY + timedelta(days=1)
    assert item.due_date == DUE


@pytest.mark.parametrize('flavour', [None, 'lock-in', 'monk'])
def test_dependencies_and_release_dates_remain_enforced(user, make_item, flavour):
    SchedulingState.objects.create(user=user, scheduler_flavour=flavour)
    prerequisite = make_item(user, 'Prerequisite', duration_category=DurationCategory.UNDER_1_HOUR)
    dependent = make_item(user, 'Late dependent', due_date=DUE, duration_category=DurationCategory.UNDER_1_HOUR)
    PlanningDependency.objects.create(prerequisite=prerequisite, dependent=dependent)
    # Legacy data can contain a release after a missed deadline. Recovery must
    # respect that release rather than rewriting either canonical date.
    released = make_item(user, 'Not yet released', due_date=DUE, start_date=TODAY + timedelta(days=2))
    scheduling.daily_schedule(user, today=TODAY)
    prerequisite.refresh_from_db(); dependent.refresh_from_db(); released.refresh_from_db()
    assert released.scheduled_date >= released.start_date
    assert released.due_date == DUE and released.start_date == TODAY + timedelta(days=2)
    if flavour is None:
        assert dependent.scheduled_date is None
    else:
        assert dependent.scheduled_date > prerequisite.scheduled_date
    hierarchy.complete_subtree(prerequisite)
    dependent.refresh_from_db()
    assert dependent.scheduled_date >= TODAY and dependent.due_date == DUE


@pytest.mark.parametrize('fields', [{'is_completed': True}, {'is_deleted': True}, {'item_type': ItemType.GOAL}])
def test_ineligible_work_keeps_deadline_and_is_not_recovered(user, make_item, fields):
    item = make_item(user, 'Ineligible', due_date=DUE, **fields)
    assert overdue.effective_due_date(item, TODAY) == DUE
    scheduling.daily_schedule(user, today=TODAY)
    item.refresh_from_db()
    assert item.scheduled_date is None and item.due_date == DUE
    assert scheduler_v1.build_scheduler_input(user, flavour='lock-in', today=TODAY).tasks == ()
    assert overdue.classify(user, TODAY) == {'recent': [], 'backlog': []}


@pytest.mark.parametrize('day', [None, TODAY, TODAY + timedelta(days=1)])
def test_unexpired_or_missing_deadline_is_unchanged(user, make_item, day):
    item = make_item(user, 'Ordinary', due_date=day)
    assert overdue.effective_due_date(item, TODAY) == day


def test_manual_validation_keeps_canonical_deadline(user, make_item):
    item = make_item(user, 'Late', due_date=DUE)
    with pytest.raises(scheduling.SchedulingConflict) as exc:
        scheduling.move_to_date(user, item.pk, TODAY, today=TODAY)
    assert exc.value.conflicts == [{'item_id': item.pk, 'code': 'after_deadline'}]
    with pytest.raises(ValidationError, match='after deadline'):
        scheduling.set_anchor(item, TODAY)
    item.refresh_from_db()
    assert item.due_date == DUE and item.manual_requested_date is None
    item.manual_requested_date = TODAY
    assert overdue.effective_due_date(item, TODAY) == DUE


@pytest.mark.parametrize('flavour', [None, 'lock-in', 'monk'])
def test_local_calendar_boundary_refreshes_without_mutation_and_is_isolated(user, other_user, make_item, flavour):
    user.time_zone = 'America/Los_Angeles'
    user.save(update_fields=['time_zone'])
    state = SchedulingState.objects.create(user=user, scheduler_flavour=flavour)
    item = make_item(user, 'Due locally today', due_date=DUE)
    other = make_item(other_user, 'Other user', due_date=DUE)
    with freeze_time('2026-10-11T06:59:00Z'):
        scheduling.daily_schedule(user)
        assert overdue.effective_due_date(item, DUE) == DUE
        state.refresh_from_db()
        previous_revision = state.scheduling_revision
        assert state.last_global_date == DUE
    with freeze_time('2026-10-11T07:00:00Z'):
        result = scheduling.daily_schedule(user)
        state.refresh_from_db(); item.refresh_from_db(); other.refresh_from_db()
        assert state.last_global_date == TODAY and state.scheduling_revision > previous_revision
        assert state.applied_scheduling_revision == state.scheduling_revision
        assert item.scheduled_date >= TODAY and item.due_date == DUE
        assert {'item_id': item.pk, 'code': 'overdue'} in result['conflicts']
        assert overdue.effective_due_date(item, TODAY) is None
        assert other.scheduled_date is None and other.due_date == DUE
        assert scheduling.daily_schedule(user)['changed_ids'] == []


def test_recent_backlog_cutoff_and_canonical_order_are_unchanged(user, make_item):
    items = [make_item(user, str(age), due_date=TODAY - timedelta(days=age)) for age in (1, 7, 8)]
    scheduling.daily_schedule(user, today=TODAY)
    result = overdue.classify(user, TODAY)
    assert [row['item'].pk for row in result['recent']] == [items[1].pk, items[0].pk]
    assert [row['item'].pk for row in result['backlog']] == [items[2].pk]
    assert [row.item_id for row in scheduler_v1.build_scheduler_input(user, flavour='lock-in', today=TODAY).tasks] == [items[2].pk, items[1].pk, items[0].pk]
