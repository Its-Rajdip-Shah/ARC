"""Certification of the ARC <-> frozen scheduler V1 authority boundary."""

from datetime import date, timedelta
from decimal import Decimal

import pytest

from arc_scheduler import SchedulerFlavourV1

from planning.models import (
    DurationCategory,
    ItemType,
    PlanningDependency,
    PlanningItem,
    ProgressSegment,
    SchedulerAllocation,
    SchedulingOverload,
)
from planning.services import scheduler_v1


pytestmark = pytest.mark.django_db


TODAY = date(2026, 9, 27)


def _canonical(item):
    item.refresh_from_db()

    return {
        "parent_id": item.parent_id,
        "priority_position": item.priority_position,
        "sibling_order": item.sibling_order,
        "start_date": item.start_date,
        "due_date": item.due_date,
        "manual_requested_date": item.manual_requested_date,
        "expired_manual_requested_date": item.expired_manual_requested_date,
        "duration_category": item.duration_category,
        "percent_completed": item.percent_completed,
        "is_completed": item.is_completed,
        "is_deleted": item.is_deleted,
        "deletion_restore_context": item.deletion_restore_context,
    }


def test_v1_input_maps_arc_canonical_state_without_mutation(user, make_item):
    prerequisite = make_item(
        user,
        "Long prerequisite",
        duration_category=DurationCategory.UNDER_16_HOURS,
        percent_completed=Decimal("25"),
        priority_position=1,
        start_date=TODAY + timedelta(days=1),
        due_date=TODAY + timedelta(days=10),
        manual_requested_date=TODAY + timedelta(days=2),
        scheduled_date=TODAY + timedelta(days=3),
    )

    dependent = make_item(
        user,
        "Dependent",
        duration_category=DurationCategory.UNDER_4_HOURS,
        priority_position=2,
        due_date=TODAY + timedelta(days=14),
    )

    PlanningDependency.objects.create(
        prerequisite=prerequisite,
        dependent=dependent,
    )

    SchedulingOverload.objects.create(
        user=user,
        date=TODAY + timedelta(days=4),
        allowed=True,
    )

    before_prerequisite = _canonical(prerequisite)
    before_dependent = _canonical(dependent)

    request = scheduler_v1.build_scheduler_input(
        user,
        flavour=SchedulerFlavourV1.LOCK_IN,
        today=TODAY,
    )

    tasks = {
        task.item_id: task
        for task in request.tasks
    }

    assert set(tasks) == {
        prerequisite.pk,
        dependent.pk,
    }

    mapped = tasks[prerequisite.pk]

    assert mapped.duration_category == DurationCategory.UNDER_16_HOURS
    assert mapped.priority_position == 1
    assert mapped.release_date == TODAY + timedelta(days=1)
    assert mapped.due_date == TODAY + timedelta(days=10)
    assert mapped.anchor_date == TODAY + timedelta(days=2)
    assert mapped.percent_completed == Decimal("25")
    assert mapped.remaining_fraction == Decimal("0.75")
    assert mapped.existing_scheduled_date == TODAY + timedelta(days=3)

    assert {
        (
            edge.prerequisite_id,
            edge.dependent_id,
        )
        for edge in request.dependencies
    } == {
        (
            prerequisite.pk,
            dependent.pk,
        )
    }

    assert TODAY + timedelta(days=4) in request.overload_dates
    assert request.explicit_total_hours == {}
    assert request.flavour is SchedulerFlavourV1.LOCK_IN

    assert _canonical(prerequisite) == before_prerequisite
    assert _canonical(dependent) == before_dependent


def test_v1_input_keeps_unschedulable_dependency_blocked(user, make_item):
    structural_prerequisite = make_item(
        user,
        "Goal prerequisite",
        item_type=ItemType.GOAL,
    )

    dependent = make_item(
        user,
        "Blocked task",
        duration_category=DurationCategory.UNDER_1_HOUR,
    )

    PlanningDependency.objects.create(
        prerequisite=structural_prerequisite,
        dependent=dependent,
    )

    request = scheduler_v1.build_scheduler_input(
        user,
        flavour=SchedulerFlavourV1.MONK,
        today=TODAY,
    )

    assert dependent.pk not in {
        task.item_id
        for task in request.tasks
    }


def test_expired_manual_intent_is_not_reintroduced_as_v1_anchor(
    user,
    make_item,
):
    item = make_item(
        user,
        "Expired intent",
        manual_requested_date=TODAY - timedelta(days=1),
        expired_manual_requested_date=TODAY - timedelta(days=4),
        scheduled_date=TODAY - timedelta(days=1),
    )

    request = scheduler_v1.build_scheduler_input(
        user,
        flavour=SchedulerFlavourV1.LOCK_IN,
        today=TODAY,
    )

    mapped = next(
        task
        for task in request.tasks
        if task.item_id == item.pk
    )

    assert mapped.anchor_date is None

    item.refresh_from_db()
    assert item.manual_requested_date == TODAY - timedelta(days=1)
    assert item.expired_manual_requested_date == TODAY - timedelta(days=4)


def test_v1_engine_and_persistence_preserve_canonical_authority(
    user,
    make_item,
):
    prerequisite = make_item(
        user,
        "Splittable prerequisite",
        duration_category=DurationCategory.UNDER_8_HOURS,
        priority_position=1,
        due_date=TODAY + timedelta(days=10),
    )

    dependent = make_item(
        user,
        "Atomic dependent",
        duration_category=DurationCategory.UNDER_4_HOURS,
        priority_position=2,
        due_date=TODAY + timedelta(days=14),
    )

    PlanningDependency.objects.create(
        prerequisite=prerequisite,
        dependent=dependent,
    )

    before_prerequisite = _canonical(prerequisite)
    before_dependent = _canonical(dependent)

    request, output = scheduler_v1.run_scheduler_v1(
        user,
        flavour=SchedulerFlavourV1.LOCK_IN,
        today=TODAY,
    )

    # Pure engine execution cannot mutate ORM state.
    assert _canonical(prerequisite) == before_prerequisite
    assert _canonical(dependent) == before_dependent
    assert not SchedulerAllocation.objects.filter(
        item__user=user,
    ).exists()
    assert not ProgressSegment.objects.filter(
        item__user=user,
    ).exists()

    persistence = scheduler_v1.apply_scheduler_output(
        user,
        request,
        output,
    )

    prerequisite.refresh_from_db()
    dependent.refresh_from_db()

    proposals = list(
        SchedulerAllocation.objects.filter(
            item=prerequisite,
        ).order_by(
            "scheduled_date",
            "execution_rank",
        )
    )

    assert proposals
    assert (
        sum(
            (
                row.percentage
                for row in proposals
            ),
            Decimal("0"),
        )
        == Decimal("100")
    )

    prerequisite_completion = max(
        row.scheduled_date
        for row in proposals
    )

    assert dependent.scheduled_date > prerequisite_completion

    # Atomic work uses the PlanningItem summary projection, not a confirmable
    # partial-progress SchedulerAllocation.
    assert not SchedulerAllocation.objects.filter(
        item=dependent,
    ).exists()

    assert prerequisite.scheduled_date == proposals[0].scheduled_date
    assert prerequisite.execution_rank is not None
    assert dependent.execution_rank is not None

    assert _canonical(prerequisite) == before_prerequisite
    assert _canonical(dependent) == before_dependent
    assert not ProgressSegment.objects.filter(
        item__user=user,
    ).exists()

    assert persistence["engine_version"] == "c11.15.9"
    assert persistence["input_contract_version"] == "1"
    assert persistence["output_contract_version"] == "1"
    assert persistence["flavour"] == "lock-in"


def test_v1_persistence_replaces_stale_disposable_projection(
    user,
    make_item,
):
    live = make_item(
        user,
        "Live",
        duration_category=DurationCategory.UNDER_1_HOUR,
        scheduled_date=TODAY + timedelta(days=20),
        execution_rank=7,
    )

    completed = make_item(
        user,
        "Completed stale projection",
        duration_category=DurationCategory.UNDER_1_HOUR,
        is_completed=True,
        scheduled_date=TODAY + timedelta(days=30),
        execution_rank=8,
    )

    request, output = scheduler_v1.run_scheduler_v1(
        user,
        flavour=SchedulerFlavourV1.MONK,
        today=TODAY,
    )

    scheduler_v1.apply_scheduler_output(
        user,
        request,
        output,
    )

    live.refresh_from_db()
    completed.refresh_from_db()

    assert live.scheduled_date is not None
    assert live.execution_rank is not None

    assert completed.scheduled_date is None
    assert completed.execution_rank is None


def test_v1_builder_requires_explicit_valid_flavour(user):
    with pytest.raises(ValueError):
        scheduler_v1.build_scheduler_input(
            user,
            flavour="not-a-flavour",
            today=TODAY,
        )
