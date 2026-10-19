"""Residual parents use their actual estimate throughout scheduling."""

from datetime import date
from decimal import Decimal

import pytest

from arc_scheduler import SchedulerFlavourV1
from planning.models import (
    DurationCategory,
    SchedulerAllocation,
)
from planning.services import scheduler_v1
from planning.services.focus_buckets import focus_bucket_key
from planning.services.hierarchy import reopen

pytestmark = pytest.mark.django_db

TODAY = date(2026, 9, 27)


@pytest.mark.parametrize(
    "duration, expected_bucket, expects_proposals",
    [
        (DurationCategory.UNDER_20_MINUTES, "quick", False),
        (DurationCategory.UNDER_4_HOURS, "boss", False),
        (DurationCategory.UNDER_16_HOURS, "boss", True),
    ],
)
def test_residual_parent_uses_actual_duration(
    user,
    make_item,
    duration,
    expected_bucket,
    expects_proposals,
):
    parent = make_item(
        user,
        f"Residual {duration}",
        duration_category=duration,
    )
    child = make_item(
        user,
        "Completed child",
        parent=parent,
        is_completed=True,
    )

    request = scheduler_v1.build_scheduler_input(
        user,
        flavour=SchedulerFlavourV1.LOCK_IN,
        today=TODAY,
    )

    task = next(
        task for task in request.tasks
        if task.item_id == parent.pk
    )

    # The canonical estimate is preserved; the scheduler must use
    # ordinary duration-based semantics for an actionable parent.
    parent.refresh_from_db()
    assert parent.duration_category == duration
    assert task.is_residual is False
    assert task.duration_category == duration

    assert focus_bucket_key(
        duration,
        is_residual=True,
    ) == expected_bucket

    request, output = scheduler_v1.run_scheduler_v1(
        user,
        flavour=SchedulerFlavourV1.LOCK_IN,
        today=TODAY,
    )

    scheduler_v1.apply_scheduler_output(
        user,
        request,
        output,
    )

    parent.refresh_from_db()

    assert parent.duration_category == duration
    assert parent.scheduled_date is not None

    proposals = list(
        SchedulerAllocation.objects.filter(item=parent)
    )

    if expects_proposals:
        assert proposals, (
            "Splittable residual parent received no allocation proposals"
        )
        assert sum(
            (row.percentage for row in proposals),
            Decimal("0"),
        ) == Decimal("100")
    else:
        assert proposals == []

    reopen(child)

    parent.refresh_from_db()

    assert parent.duration_category == duration

    new_request = scheduler_v1.build_scheduler_input(
        user,
        flavour=SchedulerFlavourV1.LOCK_IN,
        today=TODAY,
    )

    assert parent.pk not in {
        task.item_id for task in new_request.tasks
    }
