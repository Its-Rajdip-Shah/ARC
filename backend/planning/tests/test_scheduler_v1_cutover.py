"""Certification of the configured V1 production cutover."""

from datetime import date, timedelta

import pytest

from planning.models import (
    DurationCategory,
    SchedulerAllocation,
    SchedulingState,
)
from planning.services import history, scheduling


pytestmark = pytest.mark.django_db


TODAY = date(2026, 9, 28)


def test_unconfigured_user_remains_on_legacy_scheduler(
    user,
    make_item,
):
    item = make_item(
        user,
        "Legacy task",
        duration_category=DurationCategory.UNDER_1_HOUR,
    )

    result = scheduling.schedule(
        user,
        today=TODAY,
    )

    item.refresh_from_db()

    assert item.scheduled_date is not None
    assert result["scheduler"] == {
        "configured": False,
        "flavour": None,
    }

    assert not SchedulerAllocation.objects.filter(
        item__user=user,
    ).exists()


def test_lock_in_selection_activates_v1(
    user,
    make_item,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="lock-in",
    )

    item = make_item(
        user,
        "Lock-in work",
        duration_category=DurationCategory.UNDER_8_HOURS,
        due_date=TODAY + timedelta(days=10),
    )

    result = scheduling.schedule(
        user,
        today=TODAY,
    )

    item.refresh_from_db()

    assert item.scheduled_date is not None
    assert item.execution_rank is not None

    assert SchedulerAllocation.objects.filter(
        item=item,
    ).exists()

    scheduler = result["scheduler"]

    assert scheduler["configured"] is True
    assert scheduler["flavour"] == "lock-in"
    assert scheduler["engine_version"] == "c11.15.9"
    assert scheduler["input_contract_version"] == "1"
    assert scheduler["output_contract_version"] == "1"


def test_monk_selection_activates_v1(
    user,
    make_item,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="monk",
    )

    item = make_item(
        user,
        "Monk work",
        duration_category=DurationCategory.UNDER_8_HOURS,
        due_date=TODAY + timedelta(days=12),
    )

    result = scheduling.schedule(
        user,
        today=TODAY,
    )

    item.refresh_from_db()

    assert item.scheduled_date is not None

    assert result["scheduler"]["configured"] is True
    assert result["scheduler"]["flavour"] == "monk"


def test_configured_v1_preserves_legacy_conflict_shape(
    user,
    make_item,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="lock-in",
    )

    overdue = make_item(
        user,
        "Overdue",
        duration_category=DurationCategory.UNDER_1_HOUR,
        due_date=TODAY - timedelta(days=1),
    )

    result = scheduling.schedule(
        user,
        today=TODAY,
    )

    assert {
        "item_id": overdue.pk,
        "code": "overdue",
    } in result["conflicts"]


def test_explicit_anchor_remains_canonical_under_v1(
    user,
    make_item,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="lock-in",
    )

    item = make_item(
        user,
        "Anchored",
        duration_category=DurationCategory.UNDER_1_HOUR,
        due_date=TODAY + timedelta(days=10),
    )

    target = TODAY + timedelta(days=3)

    scheduling.move_to_date(
        user,
        item.pk,
        target,
        today=TODAY,
    )

    item.refresh_from_db()

    assert item.manual_requested_date == target
    assert item.scheduled_date == target


def test_clearing_flavour_returns_to_legacy_path(
    user,
    make_item,
):
    state = SchedulingState.objects.create(
        user=user,
        scheduler_flavour="monk",
    )

    make_item(
        user,
        "Task",
        duration_category=DurationCategory.UNDER_1_HOUR,
    )

    first = scheduling.schedule(
        user,
        today=TODAY,
    )

    assert first["scheduler"]["configured"] is True

    state.scheduler_flavour = None
    state.save(update_fields=["scheduler_flavour"])

    second = scheduling.schedule(
        user,
        today=TODAY,
    )

    assert second["scheduler"] == {
        "configured": False,
        "flavour": None,
    }


def test_daily_schedule_uses_saved_v1_flavour(
    user,
    make_item,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="monk",
    )

    make_item(
        user,
        "Daily task",
        duration_category=DurationCategory.UNDER_4_HOURS,
        due_date=TODAY + timedelta(days=8),
    )

    result = scheduling.daily_schedule(
        user,
        today=TODAY,
    )

    state = SchedulingState.objects.get(user=user)

    assert result["scheduler"]["configured"] is True
    assert result["scheduler"]["flavour"] == "monk"
    assert state.last_global_date == TODAY


def test_explicit_reschedule_uses_saved_v1_flavour(
    user,
    make_item,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="lock-in",
    )

    make_item(
        user,
        "Reschedule task",
        duration_category=DurationCategory.UNDER_4_HOURS,
        due_date=TODAY + timedelta(days=8),
    )

    result = scheduling.reschedule(
        user,
        today=TODAY,
    )

    assert result["scheduler"]["configured"] is True
    assert result["scheduler"]["flavour"] == "lock-in"


def _allocation_snapshot(user):
    return list(
        SchedulerAllocation.objects
        .filter(item__user=user)
        .order_by(
            "scheduled_date",
            "execution_rank",
            "id",
        )
        .values_list(
            "item_id",
            "percentage",
            "scheduled_date",
            "execution_rank",
        )
    )


def test_v1_reschedule_undo_redo_restores_complete_disposable_state(
    user,
    make_item,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="lock-in",
    )

    first = make_item(
        user,
        "Existing split work",
        duration_category=DurationCategory.UNDER_8_HOURS,
        priority_position=1,
        due_date=TODAY + timedelta(days=12),
    )

    scheduling.schedule(
        user,
        today=TODAY,
        mode="global",
    )

    first.refresh_from_db()

    before_first = (
        first.scheduled_date,
        first.execution_rank,
    )
    before_allocations = _allocation_snapshot(user)
    before_runtime = dict(
        SchedulingState.objects.get(
            user=user,
        ).scheduler_runtime
    )

    second = make_item(
        user,
        "New split work",
        duration_category=DurationCategory.UNDER_8_HOURS,
        priority_position=2,
        due_date=TODAY + timedelta(days=14),
    )

    scheduling.reschedule(
        user,
        today=TODAY,
    )

    first.refresh_from_db()
    second.refresh_from_db()

    after_first = (
        first.scheduled_date,
        first.execution_rank,
    )
    after_second = (
        second.scheduled_date,
        second.execution_rank,
    )
    after_allocations = _allocation_snapshot(user)
    after_runtime = dict(
        SchedulingState.objects.get(
            user=user,
        ).scheduler_runtime
    )

    assert history.undo(user) is not None

    first.refresh_from_db()
    second.refresh_from_db()

    assert (
        first.scheduled_date,
        first.execution_rank,
    ) == before_first

    assert second.scheduled_date is None
    assert second.execution_rank is None

    assert _allocation_snapshot(user) == before_allocations

    assert (
        SchedulingState.objects.get(
            user=user,
        ).scheduler_runtime
        == before_runtime
    )

    assert history.redo(user) is not None

    first.refresh_from_db()
    second.refresh_from_db()

    assert (
        first.scheduled_date,
        first.execution_rank,
    ) == after_first

    assert (
        second.scheduled_date,
        second.execution_rank,
    ) == after_second

    assert _allocation_snapshot(user) == after_allocations

    assert (
        SchedulingState.objects.get(
            user=user,
        ).scheduler_runtime
        == after_runtime
    )

