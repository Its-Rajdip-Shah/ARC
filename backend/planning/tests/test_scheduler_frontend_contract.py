"""Frontend-ready API contract for the production scheduler."""

from datetime import date, timedelta
from unittest.mock import patch

import pytest

from planning.models import (
    DurationCategory,
    SchedulerAllocation,
    SchedulingState,
)
from planning.services import scheduling, scheduler_v1


pytestmark = pytest.mark.django_db


TODAY = date(2026, 9, 28)


@pytest.fixture(autouse=True)
def fixed_local_date(monkeypatch):
    """Keep API-triggered scheduling on the same date as this fixture."""

    monkeypatch.setattr(
        "django.utils.timezone.localdate",
        lambda *args, **kwargs: TODAY,
    )


def _timeline_item(payload, item_id):
    for group in payload["groups"]:
        for item in group["items"]:
            if item["id"] == item_id:
                return item

    raise AssertionError(
        f"Timeline item {item_id} not found"
    )


def test_unconfigured_timeline_exposes_scheduler_state(
    api_for,
    user,
    make_item,
):
    make_item(
        user,
        "Legacy timeline task",
        duration_category=DurationCategory.UNDER_1_HOUR,
    )

    response = api_for(user).get(
        "/api/planning/timeline/",
        {
            "from": TODAY.isoformat(),
            "to": (TODAY + timedelta(days=7)).isoformat(),
        },
    )

    assert response.status_code == 200

    payload = response.json()

    assert payload["scheduler"] == {
        "configured": False,
        "flavour": None,
    }


def test_configured_timeline_exposes_complete_v1_runtime(
    api_for,
    user,
    make_item,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="lock-in",
    )

    item = make_item(
        user,
        "Large split task",
        duration_category=DurationCategory.OVER_16_HOURS,
        priority_position=1,
        due_date=TODAY + timedelta(days=30),
    )

    scheduling.reschedule(
        user,
        today=TODAY,
    )

    allocations = list(
        SchedulerAllocation.objects.filter(
            item=item,
        ).order_by(
            "scheduled_date",
            "execution_rank",
        )
    )

    assert allocations

    response = api_for(user).get(
        "/api/planning/timeline/",
        {
            "from": TODAY.isoformat(),
            "to": (TODAY + timedelta(days=30)).isoformat(),
        },
    )

    assert response.status_code == 200

    payload = response.json()
    runtime = payload["scheduler"]

    assert runtime["configured"] is True
    assert runtime["flavour"] == "lock-in"
    assert runtime["engine_version"] == "c11.15.9"
    assert runtime["input_contract_version"] == "1"
    assert runtime["output_contract_version"] == "1"

    assert "iterations" in runtime
    assert "evaluations" in runtime
    assert "termination_reason" in runtime

    assert isinstance(runtime["allocations"], list)
    assert isinstance(runtime["estimates"], list)
    assert isinstance(runtime["daily_load"], list)
    assert isinstance(runtime["weekly_load"], list)
    assert isinstance(runtime["monthly_load"], list)
    assert isinstance(runtime["objective"], dict)
    assert isinstance(runtime["diagnostics"], list)

    engine_rows = [
        row
        for row in runtime["allocations"]
        if row["item_id"] == item.pk
    ]

    assert engine_rows

    for row in engine_rows:
        assert {
            "item_id",
            "scheduled_date",
            "hours",
            "percentage",
            "execution_rank",
        } <= set(row)

    timeline_item = _timeline_item(
        payload,
        item.pk,
    )

    assert timeline_item["allocations"]


def test_split_item_remains_visible_when_later_session_hits_window(
    api_for,
    user,
    make_item,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="monk",
    )

    item = make_item(
        user,
        "Multi-session task",
        duration_category=DurationCategory.OVER_16_HOURS,
        priority_position=1,
        due_date=TODAY + timedelta(days=40),
    )

    scheduling.reschedule(
        user,
        today=TODAY,
    )

    allocations = list(
        SchedulerAllocation.objects.filter(
            item=item,
        ).order_by(
            "scheduled_date",
            "execution_rank",
        )
    )

    assert len(allocations) >= 2

    first_day = allocations[0].scheduled_date
    later_day = allocations[1].scheduled_date

    assert later_day > first_day

    item.refresh_from_db()

    assert item.scheduled_date == first_day

    response = api_for(user).get(
        "/api/planning/timeline/",
        {
            "from": later_day.isoformat(),
            "to": later_day.isoformat(),
        },
    )

    assert response.status_code == 200

    payload = response.json()

    timeline_item = _timeline_item(
        payload,
        item.pk,
    )

    # The item's summary date is outside this one-day window, but the
    # visible later split session keeps the task in the Timeline result.
    assert timeline_item["scheduled_date"] == first_day.isoformat()

    assert timeline_item["allocations"]

    assert {
        row["scheduled_date"]
        for row in timeline_item["allocations"]
    } == {
        later_day.isoformat()
    }


def test_reschedule_endpoint_exposes_v1_runtime_contract(
    api_for,
    user,
    make_item,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="lock-in",
    )

    make_item(
        user,
        "API reschedule task",
        duration_category=DurationCategory.UNDER_8_HOURS,
        priority_position=1,
        due_date=TODAY + timedelta(days=10),
    )

    response = api_for(user).post(
        "/api/planning/timeline/reschedule/",
        {},
        format="json",
    )

    assert response.status_code == 200

    payload = response.json()
    runtime = payload["scheduler"]

    assert runtime["configured"] is True
    assert runtime["flavour"] == "lock-in"
    assert runtime["engine_version"] == "c11.15.9"

    assert "allocations" in runtime
    assert "estimates" in runtime
    assert "daily_load" in runtime
    assert "objective" in runtime


def test_same_day_timeline_read_reuses_cached_v1_runtime(
    api_for,
    user,
    make_item,
):
    SchedulingState.objects.create(
        user=user,
        scheduler_flavour="lock-in",
    )

    make_item(
        user,
        "Cached runtime task",
        duration_category=DurationCategory.UNDER_8_HOURS,
        priority_position=1,
        due_date=TODAY + timedelta(days=10),
    )

    scheduling.reschedule(
        user,
        today=TODAY,
    )

    state = SchedulingState.objects.get(user=user)

    assert state.scheduler_runtime

    with patch.object(
        scheduler_v1,
        "run_and_apply_scheduler_v1",
        wraps=scheduler_v1.run_and_apply_scheduler_v1,
    ) as run:
        first = api_for(user).get(
            "/api/planning/timeline/",
            {
                "from": TODAY.isoformat(),
                "to": (TODAY + timedelta(days=14)).isoformat(),
            },
        )

        second = api_for(user).get(
            "/api/planning/timeline/",
            {
                "from": TODAY.isoformat(),
                "to": (TODAY + timedelta(days=14)).isoformat(),
            },
        )

    assert first.status_code == 200
    assert second.status_code == 200

    assert run.call_count == 0

    assert first.json()["scheduler"] == second.json()["scheduler"]
