"""Four calendar-day commitments, canonical order collisions, and restoration."""

from datetime import date, timedelta

import pytest
from freezegun import freeze_time

from planning.models import DurationCategory, PlanningItem, SchedulingState
from planning.services import deletion, domain_commands, hierarchy, history, scheduling, scheduler_v1, scheduler_worker
from planning.services.focus_buckets import focus_bucket_key

pytestmark = pytest.mark.django_db
ORIGIN = date(2026, 10, 10)


@pytest.fixture(autouse=True)
def fixed_clock():
    with freeze_time('2026-10-10T12:00:00Z'):
        yield


def anchor(make_item, user, title='Sticky', *, day=ORIGIN, origin=ORIGIN, order=1, **fields):
    return make_item(
        user, title, duration_category=fields.pop('duration_category', DurationCategory.UNDER_1_HOUR),
        manual_requested_date=day, manual_anchor_origin_date=origin,
        manual_requested_order=order, **fields,
    )


def commitment(item):
    item.refresh_from_db()
    return (item.manual_requested_date, item.manual_anchor_origin_date,
            item.manual_requested_order, item.expired_manual_requested_date)


def adapter_slots(user, today):
    request = scheduler_v1.build_scheduler_input(user, flavour='lock-in', today=today)
    slots = [(row.anchor_date, focus_bucket_key(row.duration_category, is_residual=row.is_residual), row.anchor_order)
             for row in request.tasks if row.anchor_date is not None and row.anchor_order is not None]
    assert len(slots) == len(set(slots))
    return request


@pytest.mark.parametrize('flavour', [None, 'lock-in'])
def test_four_calendar_days_carry_then_expire_and_reconcile(user, make_item, flavour):
    SchedulingState.objects.create(user=user, scheduler_flavour=flavour)
    item = anchor(make_item, user, start_date=ORIGIN, due_date=ORIGIN + timedelta(days=10))
    scheduling.daily_schedule(user, today=ORIGIN)
    for age in (1, 2, 3):
        today = ORIGIN + timedelta(days=age)
        result = scheduling.daily_schedule(user, today=today)

        # Canonical carry happens immediately. The disposable schedule is
        # published separately by the background worker.
        assert commitment(item) == (today, ORIGIN, 1, None)
        state = SchedulingState.objects.get(user=user)
        assert scheduler_worker.process_request(
            user.pk, state.scheduling_revision
        ) == 'published'
        item.refresh_from_db()
        assert item.scheduled_date == today
        assert item.pk in result['anchor_changed_ids']
        assert item.pk in result['changed_ids']
        assert not result['expired_anchor_ids']
        request = adapter_slots(user, today)
        assert request.tasks[0].anchor_date == today
        assert not hasattr(request.tasks[0], 'manual_anchor_origin_date')
        again = scheduling.daily_schedule(user, today=today)
        assert commitment(item) == (today, ORIGIN, 1, None)
        assert again['anchor_changed_ids'] == []
    expired_day = ORIGIN + timedelta(days=4)
    result = scheduling.daily_schedule(user, today=expired_day)
    assert commitment(item) == (None, None, None, ORIGIN)
    assert item.pk in result['expired_anchor_ids']
    assert item.start_date == ORIGIN
    assert item.due_date == ORIGIN + timedelta(days=10)
    assert scheduling.daily_schedule(user, today=expired_day)['anchor_changed_ids'] == []


@pytest.mark.parametrize('flavour', [None, 'lock-in'])
def test_deadline_crossing_terminates_without_changing_task_facts(user, make_item, flavour):
    SchedulingState.objects.create(user=user, scheduler_flavour=flavour)
    item = anchor(make_item, user, start_date=ORIGIN, due_date=ORIGIN)
    today = ORIGIN + timedelta(days=1)
    result = scheduling.daily_schedule(user, today=today)
    assert commitment(item) == (None, None, None, ORIGIN)
    assert item.start_date == item.due_date == ORIGIN
    assert not item.is_completed and not item.is_deleted
    assert PlanningItem.objects.for_user(user).filter(pk=item.pk).exists()
    assert item.pk in result['expired_anchor_ids']

    # Daily maintenance expires the canonical anchor immediately.
    # Conflict reporting belongs to the worker-published projection.
    state = SchedulingState.objects.get(user=user)
    assert state.applied_scheduling_revision < state.scheduling_revision
    with freeze_time('2026-10-11T12:00:00Z'):
        assert scheduler_worker.process_request(
            user.pk, state.scheduling_revision
        ) == 'published'

    state.refresh_from_db()
    assert state.applied_scheduling_revision == state.scheduling_revision
    assert {'item_id': item.pk, 'code': 'overdue'} in (
        state.scheduler_runtime['compatibility_conflicts']
    )
    request = adapter_slots(user, today)
    assert request.tasks[0].anchor_date is None
    # Automatic recovery releases only the adapter's expired constraint.
    assert request.tasks[0].due_date is None
    assert item.due_date == ORIGIN
    assert scheduling._reconcile_manual_anchors(user, today) == []


def test_existing_release_validation_terminates_invalid_legacy_carry(user, make_item):
    item = anchor(make_item, user, origin=None, start_date=ORIGIN + timedelta(days=2), due_date=ORIGIN + timedelta(days=8))
    scheduling.daily_schedule(user, today=ORIGIN + timedelta(days=1))
    assert commitment(item) == (None, None, None, ORIGIN)
    assert item.start_date == ORIGIN + timedelta(days=2)
    assert item.due_date == ORIGIN + timedelta(days=8)

    state = SchedulingState.objects.get(user=user)
    assert scheduler_worker.process_request(
        user.pk, state.scheduling_revision
    ) == 'published'
    item.refresh_from_db()
    assert item.scheduled_date >= item.start_date


@pytest.mark.parametrize('offset', [0, 1, 3, 4])
def test_legacy_null_origin_is_derived_only_from_effective_date(user, make_item, offset):
    item = anchor(make_item, user, origin=None)
    today = ORIGIN + timedelta(days=offset)
    assert scheduling._reconcile_manual_anchors(user, today) == [item.pk]
    assert commitment(item) == ((today, ORIGIN, 1, None) if offset < 4 else (None, None, None, ORIGIN))
    assert scheduling._reconcile_manual_anchors(user, today) == []


def test_future_anchor_keeps_its_date_and_order(user, make_item):
    future = ORIGIN + timedelta(days=5)
    item = anchor(make_item, user, day=future, origin=None, order=7)
    scheduling._reconcile_manual_anchors(user, ORIGIN)
    assert commitment(item) == (future, future, 7, None)


def test_destination_orders_are_preserved_and_carried_anchor_takes_gap(user, make_item):
    today = ORIGIN + timedelta(days=1)
    existing = anchor(make_item, user, 'Today', day=today, origin=today)
    carried = anchor(make_item, user)
    scheduling._reconcile_manual_anchors(user, today)
    assert commitment(existing) == (today, today, 1, None)
    assert commitment(carried) == (today, ORIGIN, 2, None)
    adapter_slots(user, today)


def test_multiple_carries_sort_by_origin_prior_order_then_id_and_fill_gaps(user, make_item):
    today = ORIGIN + timedelta(days=3)
    one = anchor(make_item, user, 'Reserved one', day=today, origin=today, order=1)
    three = anchor(make_item, user, 'Reserved three', day=today, origin=today, order=3)
    newest = anchor(make_item, user, 'Newest', day=ORIGIN + timedelta(days=1), origin=ORIGIN + timedelta(days=1))
    old_second = anchor(make_item, user, 'Old second', order=2)
    null_first = anchor(make_item, user, 'Null first', order=None)
    old_first = anchor(make_item, user, 'Old first', order=1)
    null_second = anchor(make_item, user, 'Null second', order=None)
    scheduling._reconcile_manual_anchors(user, today)
    expected = [(one, 1), (old_first, 2), (three, 3), (old_second, 4), (null_first, 5), (null_second, 6), (newest, 7)]
    before = [commitment(item) for item, _ in expected]
    for item, order in expected:
        assert item.manual_requested_date == today
        assert item.manual_requested_order == order
    assert newest.manual_anchor_origin_date == ORIGIN + timedelta(days=1)
    assert all(item.manual_anchor_origin_date == ORIGIN for item in [old_first, old_second, null_first, null_second])
    adapter_slots(user, today)
    assert scheduling._reconcile_manual_anchors(user, today) == []
    assert [commitment(item) for item, _ in expected] == before


def test_focus_bucket_classification_includes_residual_work(user, make_item):
    today = ORIGIN + timedelta(days=1)
    quick = anchor(make_item, user, 'Quick today', day=today, origin=today, duration_category=DurationCategory.UNDER_20_MINUTES)
    residual = anchor(make_item, user, 'Residual', duration_category=DurationCategory.UNDER_4_HOURS)
    make_item(user, 'Completed child', parent=residual, is_completed=True)
    side = anchor(make_item, user, 'Side')
    boss_today = anchor(make_item, user, 'Boss today', day=today, origin=today, duration_category=DurationCategory.UNDER_4_HOURS)
    boss_carry = anchor(make_item, user, 'Boss carry', duration_category=DurationCategory.UNDER_8_HOURS)
    scheduling._reconcile_manual_anchors(user, today)
    assert commitment(quick)[2] == commitment(side)[2] == commitment(boss_today)[2] == 1
    assert commitment(residual)[2] == 2
    assert commitment(boss_carry)[2] == 3
    adapter_slots(user, today)


def test_carry_invalidates_same_day_cached_v1_result(user, make_item):
    today = ORIGIN + timedelta(days=1)
    item = make_item(user, 'Automatic', duration_category=DurationCategory.UNDER_1_HOUR)
    SchedulingState.objects.create(user=user, scheduler_flavour='lock-in')
    scheduling.daily_schedule(user, today=today)
    state = SchedulingState.objects.get(user=user)
    revision = state.scheduling_revision
    PlanningItem.objects.filter(pk=item.pk).update(manual_requested_date=ORIGIN, manual_anchor_origin_date=ORIGIN, manual_requested_order=1)
    result = scheduling.daily_schedule(user, today=today)
    assert item.pk in result['anchor_changed_ids']
    assert commitment(item) == (today, ORIGIN, 1, None)
    state.refresh_from_db()
    assert state.scheduling_revision > revision
    assert state.applied_scheduling_revision < state.scheduling_revision

    assert scheduler_worker.process_request(
        user.pk, state.scheduling_revision
    ) == 'published'
    state.refresh_from_db()
    assert state.applied_scheduling_revision == state.scheduling_revision


@pytest.mark.parametrize('zone,expected', [('America/Los_Angeles', ORIGIN), ('Asia/Tokyo', ORIGIN + timedelta(days=1))])
def test_user_calendar_is_used_unless_today_is_explicit(user, make_item, zone, expected):
    user.time_zone = zone
    user.save(update_fields=['time_zone'])
    item = anchor(make_item, user)
    with freeze_time('2026-10-11T00:30:00Z'):
        scheduling.daily_schedule(user)
        assert commitment(item)[:2] == (expected, ORIGIN)
        scheduling.daily_schedule(user, today=ORIGIN + timedelta(days=4))
        assert commitment(item) == (None, None, None, ORIGIN)


def test_explicit_reanchor_restarts_window_and_unanchor_clears_it(user, make_item):
    item = anchor(make_item, user)
    with freeze_time('2026-10-12T12:00:00Z'):
        scheduling.daily_schedule(user)
        scheduling.set_anchor(item, date(2026, 10, 12), order=3)
        assert commitment(item)[:3] == (date(2026, 10, 12), date(2026, 10, 12), 3)
    scheduling.daily_schedule(user, today=date(2026, 10, 14))
    assert commitment(item)[:2] == (date(2026, 10, 14), date(2026, 10, 12))
    with freeze_time('2026-10-14T12:00:00Z'):
        scheduling.remove_anchor(item)
    assert commitment(item)[:3] == (None, None, None)
    assert scheduling._reconcile_manual_anchors(user, date(2026, 10, 15)) == []


@pytest.mark.parametrize('transition', ['complete', 'delete'])
def test_completion_and_deletion_terminate_active_window(user, make_item, transition):
    item = anchor(make_item, user)
    if transition == 'complete':
        hierarchy.complete_subtree(item)
    else:
        deletion.delete_subtree(item)
    assert commitment(item) == (None, None, None, ORIGIN)
    assert item.is_completed if transition == 'complete' else item.is_deleted
    scheduling.daily_schedule(user, today=ORIGIN + timedelta(days=1))
    assert commitment(item) == (None, None, None, ORIGIN)
    if transition == 'complete':
        hierarchy.reopen(item)
        assert commitment(item)[:3] == (None, None, None)


def test_inherited_anchor_keeps_original_commitment(user, make_item):
    parent = anchor(make_item, user, day=ORIGIN + timedelta(days=1))
    with freeze_time('2026-10-11T12:00:00Z'):
        child = domain_commands.create_item(user, title='Child', item_type='TASK', parent=parent, duration_category=DurationCategory.UNDER_1_HOUR)
    assert commitment(child)[:2] == (ORIGIN + timedelta(days=1), ORIGIN)


def test_anchor_lifecycle_is_user_isolated(user, other_user, make_item):
    item = anchor(make_item, other_user)
    assert scheduling._reconcile_manual_anchors(user, ORIGIN + timedelta(days=2)) == []
    assert commitment(item) == (ORIGIN, ORIGIN, 1, None)


def test_schedule_undo_redo_preserves_carried_origin_order_and_expired_history(user, make_item):
    item = anchor(make_item, user, expired_manual_requested_date=date(2026, 9, 1))
    with freeze_time('2026-10-11T12:00:00Z'):
        scheduling.daily_schedule(user)
        before = commitment(item)
        scheduling.set_anchor(item, date(2026, 10, 12), order=4)
        after = commitment(item)
        assert after[:3] == (date(2026, 10, 12), date(2026, 10, 12), 4)
        history.undo(user)
        assert commitment(item) == before
        history.redo(user)
        assert commitment(item) == after
        scheduling.remove_anchor(item)
        assert commitment(item) == (None, None, None, None)
        history.undo(user)
        assert commitment(item) == after
        history.redo(user)
        assert commitment(item) == (None, None, None, None)


def test_completion_undo_redo_preserves_commitment_and_display_history(user, make_item, api_for):
    item = anchor(make_item, user)
    scheduling.daily_schedule(user, today=ORIGIN)
    response = api_for(user).patch(f'/api/planning/items/{item.pk}/', {'is_completed': True}, format='json')
    assert response.status_code == 200
    assert commitment(item) == (None, None, None, ORIGIN)
    assert item.completed_display_date == ORIGIN
    history.undo(user)
    assert commitment(item) == (ORIGIN, ORIGIN, 1, None)
    assert not item.is_completed
    history.redo(user)
    assert commitment(item) == (None, None, None, ORIGIN)
    assert item.is_completed and item.completed_display_date == ORIGIN


def test_delete_restore_preserves_origin_in_historical_context(user, make_item):
    future = ORIGIN + timedelta(days=2)
    item = anchor(make_item, user, day=future, origin=future, order=4)
    deletion.delete_subtree(item)
    assert commitment(item) == (None, None, None, future)
    assert item.deletion_restore_context['manual_anchor_origin_dates'][str(item.pk)] == future.isoformat()
    deletion.restore_subtree(item, today=ORIGIN)
    assert commitment(item) == (future, future, 4, None)


def test_timeline_move_restarts_origin(user, make_item):
    item = anchor(make_item, user)
    today = ORIGIN + timedelta(days=1)
    scheduling.move_to_date(user, item.pk, today, today=today)
    assert commitment(item)[:3] == (today, today, 1)


@pytest.mark.parametrize('overload', [False, True])
def test_replacement_resets_or_clears_origin(user, make_item, overload):
    today = ORIGIN + timedelta(days=1)
    displaced = anchor(make_item, user)
    replacement = make_item(user, 'Replacement')
    scheduling.daily_schedule(user, today=today)
    scheduling.replace(user, replacement.pk, displaced.pk, allow_overload=overload, today=today)
    assert commitment(replacement)[:2] == (today, today)
    displaced_commitment = commitment(displaced)
    if overload:
        assert displaced_commitment[:3] == (today, today, 1)
    else:
        assert displaced_commitment[0] == today + timedelta(days=1)
        assert displaced_commitment[1] == today + timedelta(days=1)
        assert displaced_commitment[2] is None


@pytest.mark.parametrize('expired', [None, date(2026, 9, 1)])
def test_delete_undo_redo_restores_canonical_commitment(user, make_item, api_for, expired):
    item = anchor(make_item, user, order=3, expired_manual_requested_date=expired)
    scheduling.daily_schedule(user, today=ORIGIN)
    response = api_for(user).delete(f'/api/planning/items/{item.pk}/')
    assert response.status_code == 204
    assert commitment(item) == (None, None, None, ORIGIN)
    assert item.is_deleted
    history.undo(user)
    assert commitment(item) == (ORIGIN, ORIGIN, 3, expired)
    assert not item.is_deleted
    history.redo(user)
    assert commitment(item) == (None, None, None, ORIGIN)
    assert item.is_deleted


def test_schedule_history_reconciles_restored_anchor_for_current_day(user, make_item):
    item = anchor(make_item, user)
    scheduling.daily_schedule(user, today=ORIGIN)
    scheduling.set_anchor(item, ORIGIN + timedelta(days=2), order=3)
    with freeze_time('2026-10-13T12:00:00Z'):
        history.undo(user)
        assert commitment(item) == (date(2026, 10, 13), ORIGIN, 1, None)

        # Undo restores canonical state immediately. The worker publishes
        # its disposable schedule separately.
        state = SchedulingState.objects.get(user=user)
        assert scheduler_worker.process_request(
            user.pk, state.scheduling_revision
        ) == 'published'
        item.refresh_from_db()
        assert item.scheduled_date == date(2026, 10, 13)
        history.redo(user)
        assert commitment(item) == (date(2026, 10, 13), date(2026, 10, 12), 1, None)
    with freeze_time('2026-10-14T12:00:00Z'):
        history.undo(user)
        assert commitment(item) == (None, None, None, ORIGIN)
