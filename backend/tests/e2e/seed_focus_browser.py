#!/usr/bin/env python3

import json
import os
import sys
from datetime import timedelta
from pathlib import Path


BACKEND_ROOT = (
    Path(__file__)
    .resolve()
    .parents[2]
)

sys.path.insert(
    0,
    str(BACKEND_ROOT),
)

os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE",
    "arc_backend.settings",
)

import django

django.setup()


from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework_simplejwt.tokens import RefreshToken

from accounts.tokens import FULL_ACCESS_SCOPE
from planning.models import (
    DurationCategory,
    ItemType,
    PlanningItem,
    SchedulingState,
    SchedulingOverload,
)


EMAIL = "focus-e2e@arc.test"
PASSWORD = "focus-e2e-password"


def session_file():
    repo_root = (
        Path(__file__)
        .resolve()
        .parents[3]
    )

    return (
        repo_root
        / "frontend"
        / "e2e"
        / ".focus-e2e-session.json"
    )


def create_user():
    User = get_user_model()

    User.objects.filter(
        email=EMAIL,
    ).delete()

    user = User.objects.create_user(
        EMAIL,
        PASSWORD,
    )

    SchedulingState.objects.create(
        user=user,
        scheduler_flavour=
            SchedulingState
            .SchedulerFlavour
            .LOCK_IN,
    )

    # Disposable acceptance fixture explicitly permits the anchored workload.
    for offset in range(7):
        SchedulingOverload.objects.create(
            user=user, date=timezone.localdate() + timedelta(days=offset), allowed=True,
        )

    refresh = RefreshToken.for_user(
        user,
    )

    refresh["scope"] = (
        FULL_ACCESS_SCOPE
    )

    refresh["is_admin"] = False

    session_file().write_text(
        json.dumps(
            {
                "access":
                    str(refresh.access_token),

                "refresh":
                    str(refresh),
            },
        ),
    )

    return user


def create_item(
    user,
    *,
    title,
    priority_position,
    sibling_order,
    scheduled_date,
    execution_rank,
    manual_requested_date=None,
    manual_requested_order=None,
    start_date=None,
):
    return PlanningItem.objects.create(
        user=user,

        item_type=
            ItemType.TASK,

        title=title,
        start_date=start_date,

        duration_category=
            DurationCategory.UNDER_4_HOURS,

        priority_position=
            priority_position,

        sibling_order=
            sibling_order,

        scheduled_date=
            scheduled_date,

        execution_rank=
            execution_rank,

        manual_requested_date=
            manual_requested_date,

        manual_requested_order=
            manual_requested_order,
    )


def seed_anchored_four_clean_before_failure(
    user,
):
    """
    Faithful PRE-ACTION state for the real manual regression.

    Real metadata:
      duration: UNDER_4_HOURS
      flavour: lock-in
      priority: 32,33,34,35
      sibling:  1,2,3,4

    User-visible starting order:
      1,2,3,4

    All four are Focus anchors.
    """

    today = timezone.localdate()

    create_item(
        user,
        title="1",
        priority_position=32,
        sibling_order=1,
        scheduled_date=today,
        execution_rank=1,
        manual_requested_date=today,
        manual_requested_order=1,
    )

    create_item(
        user,
        title="2",
        priority_position=33,
        sibling_order=2,
        scheduled_date=today,
        execution_rank=2,
        manual_requested_date=today,
        manual_requested_order=2,
    )

    create_item(
        user,
        title="3",
        priority_position=34,
        sibling_order=3,
        scheduled_date=today,
        execution_rank=3,
        manual_requested_date=today,
        manual_requested_order=3,
    )

    create_item(
        user,
        title="4",
        priority_position=35,
        sibling_order=4,
        scheduled_date=today,
        execution_rank=4,
        manual_requested_date=today,
        manual_requested_order=4,
    )


def seed_anchored_four_already_corrupted(
    user,
):
    """
    Exact POST-FAILURE state captured from the real database:

      rendered execution:
        1,4,3,2

      stored Focus order:
        1,3,2,4
    """

    today = timezone.localdate()

    create_item(
        user,
        title="1",
        priority_position=32,
        sibling_order=1,
        scheduled_date=today,
        execution_rank=1,
        manual_requested_date=today,
        manual_requested_order=1,
    )

    create_item(
        user,
        title="4",
        priority_position=35,
        sibling_order=4,
        scheduled_date=today,
        execution_rank=2,
        manual_requested_date=today,
        manual_requested_order=4,
    )

    create_item(
        user,
        title="3",
        priority_position=34,
        sibling_order=3,
        scheduled_date=today,
        execution_rank=3,
        manual_requested_date=today,
        manual_requested_order=2,
    )

    create_item(
        user,
        title="2",
        priority_position=33,
        sibling_order=2,
        scheduled_date=today,
        execution_rank=4,
        manual_requested_date=today,
        manual_requested_order=3,
    )


def seed_unanchored_real_shape(
    user,
):
    today = timezone.localdate()

    target = (
        today
        + timedelta(days=4)
    )

    create_item(
        user,
        title="Timeline View",
        priority_position=15,
        sibling_order=3,
        scheduled_date=target,
        execution_rank=2,
        manual_requested_date=None,
        manual_requested_order=None,
    )

    create_item(
        user,
        title="google authentication set up",
        priority_position=19,
        sibling_order=3,
        scheduled_date=target,
        execution_rank=3,
        manual_requested_date=None,
        manual_requested_order=None,
    )

    add_untouched_rows(user, target)


def add_untouched_rows(user, target):
    create_item(user, title="Untouched Timeline anchor", priority_position=50,
                sibling_order=50, scheduled_date=target, execution_rank=50,
                manual_requested_date=target)
    create_item(user, title="Untouched automatic", priority_position=51,
                sibling_order=51, scheduled_date=target, execution_rank=51,
                start_date=target)


def seed_cross_date_real_shape(
    user,
):
    today = timezone.localdate()

    target = (
        today
        + timedelta(days=4)
    )

    next_day = (
        today
        + timedelta(days=5)
    )

    for index in range(1, 11):
        date = today + timedelta(days=(index - 1) // 3)
        create_item(user, title=f"Preceding {index}", priority_position=index,
                    sibling_order=index, scheduled_date=date, execution_rank=index,
                    manual_requested_date=date, manual_requested_order=(index - 1) % 3 + 1)

    create_item(
        user,
        title="Timeline View",
        priority_position=15,
        sibling_order=3,
        scheduled_date=target,
        execution_rank=2,
        manual_requested_date=target,
        manual_requested_order=None,
    )

    create_item(
        user,
        title="google authentication set up",
        priority_position=19,
        sibling_order=3,
        scheduled_date=target,
        execution_rank=3,
        manual_requested_date=target,
        manual_requested_order=None,
    )

    create_item(
        user,
        title="Admin View",
        priority_position=21,
        sibling_order=7,
        scheduled_date=next_day,
        execution_rank=1,
        manual_requested_date=None,
        manual_requested_order=None,
    )


def seed_drag(user):
    today = timezone.localdate()
    for rank, title in enumerate(["A", "B", "C"], 1):
        create_item(user, title=title, priority_position=rank, sibling_order=rank,
                    scheduled_date=today, execution_rank=rank,
                    manual_requested_date=today, manual_requested_order=rank)


SCENARIOS = {
    "active-drag": seed_drag,
    "anchored-four-clean":
        seed_anchored_four_clean_before_failure,

    "anchored-four-corrupted":
        seed_anchored_four_already_corrupted,

    "unanchored-real":
        seed_unanchored_real_shape,

    "cross-date-real":
        seed_cross_date_real_shape,
}


def main():
    if len(sys.argv) != 2:
        raise SystemExit(
            "usage: seed_focus_browser.py <scenario>"
        )

    scenario = sys.argv[1]

    seed = SCENARIOS.get(
        scenario,
    )

    if seed is None:
        raise SystemExit(
            f"unknown scenario: {scenario}"
        )

    user = create_user()

    seed(user)

    print(
        json.dumps(
            {
                "scenario":
                    scenario,

                "today":
                    timezone
                    .localdate()
                    .isoformat(),

                "user_id":
                    user.pk,
            },
        ),
    )


if __name__ == "__main__":
    main()
