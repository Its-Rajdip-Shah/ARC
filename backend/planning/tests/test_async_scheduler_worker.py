"""Stage 2A certification for the V1 capture/compute/publication boundary."""

from datetime import date, timedelta

import pytest
from django.db import connection
from freezegun import freeze_time

from planning.models import (
    DurationCategory,
    ItemType,
    PlanningItem,
    SchedulerAllocation,
    SchedulingState,
)
from planning.services import async_scheduler, scheduler_worker, scheduling


pytestmark = pytest.mark.django_db

TODAY = date(2026, 10, 27)


def _request(user, *, mode="minimal"):
    SchedulingState.objects.create(user=user, scheduler_flavour="lock-in")
    return scheduling.request_reconcile(user, mode=mode)["requested_revision"]


def _canonical_snapshot(user):
    return list(
        PlanningItem.objects.filter(user=user).order_by("pk").values(
            "pk", "parent_id", "priority_position", "start_date", "due_date",
            "percent_completed", "is_completed", "manual_requested_date",
            "manual_requested_order", "manual_anchor_origin_date",
        )
    )


def test_capture_compute_and_publish_a_current_request(user, make_item):
    item = make_item(user, "Work", duration_category=DurationCategory.UNDER_4_HOURS)
    revision = _request(user)

    captured = async_scheduler.capture_v1_request(user, revision, today=TODAY)
    computed = async_scheduler.compute_v1_request(captured)
    persistence = async_scheduler.publish_v1_result(computed)

    item.refresh_from_db()
    state = SchedulingState.objects.get(user=user)
    assert captured.scheduler_output is None
    assert computed.scheduler_output is not None
    assert persistence["flavour"] == "lock-in"
    assert item.scheduled_date is not None
    assert state.applied_scheduling_revision == revision


@pytest.mark.django_db(transaction=True)
def test_compute_has_no_transaction_or_database_access(user, make_item, monkeypatch):
    make_item(user, "Work", duration_category=DurationCategory.UNDER_4_HOURS)
    captured = async_scheduler.capture_v1_request(user, _request(user), today=TODAY)
    observed = {"in_atomic_block": None, "queries": []}
    real_engine = async_scheduler.SchedulerEngineV1

    class InspectingEngine(real_engine):
        def run(self, request):
            observed["in_atomic_block"] = connection.in_atomic_block
            with connection.execute_wrapper(
                lambda execute, sql, params, many, context: (
                    observed["queries"].append(sql), execute(sql, params, many, context)
                )[1]
            ):
                return super().run(request)

    monkeypatch.setattr(async_scheduler, "SchedulerEngineV1", InspectingEngine)
    async_scheduler.compute_v1_request(captured)

    assert observed == {"in_atomic_block": False, "queries": []}


def test_stale_revision_is_rejected_without_partial_publication(user, make_item):
    item = make_item(user, "Work", duration_category=DurationCategory.UNDER_4_HOURS)
    revision = _request(user)
    computed = async_scheduler.compute_v1_request(
        async_scheduler.capture_v1_request(user, revision, today=TODAY)
    )
    before = (item.scheduled_date, item.execution_rank)
    scheduling.request_reconcile(user)

    with pytest.raises(scheduling.StaleSchedulingRevision):
        async_scheduler.publish_v1_result(computed)

    item.refresh_from_db()
    state = SchedulingState.objects.get(user=user)
    assert (item.scheduled_date, item.execution_rank) == before
    assert state.applied_scheduling_revision == 0


def test_replaying_a_published_result_is_rejected_without_changing_projection(user, make_item):
    make_item(user, "Work", duration_category=DurationCategory.UNDER_4_HOURS)
    revision = _request(user)
    computed = async_scheduler.compute_v1_request(
        async_scheduler.capture_v1_request(user, revision, today=TODAY)
    )

    async_scheduler.publish_v1_result(computed)
    projection_before = (
        list(
            PlanningItem.objects.filter(user=user).order_by("pk").values_list(
                "pk", "scheduled_date", "execution_rank"
            )
        ),
        list(
            SchedulerAllocation.objects.filter(item__user=user)
            .order_by("item_id", "scheduled_date", "execution_rank")
            .values_list("item_id", "scheduled_date", "execution_rank", "percentage")
        ),
    )

    with pytest.raises(async_scheduler.SchedulingRevisionAlreadyApplied):
        async_scheduler.publish_v1_result(computed)

    state = SchedulingState.objects.get(user=user)
    projection_after = (
        list(
            PlanningItem.objects.filter(user=user).order_by("pk").values_list(
                "pk", "scheduled_date", "execution_rank"
            )
        ),
        list(
            SchedulerAllocation.objects.filter(item__user=user)
            .order_by("item_id", "scheduled_date", "execution_rank")
            .values_list("item_id", "scheduled_date", "execution_rank", "percentage")
        ),
    )
    assert projection_after == projection_before
    assert state.applied_scheduling_revision == revision


def test_flavour_change_is_rejected_without_partial_publication(user, make_item):
    item = make_item(user, "Work", duration_category=DurationCategory.UNDER_4_HOURS)
    revision = _request(user)
    computed = async_scheduler.compute_v1_request(
        async_scheduler.capture_v1_request(user, revision, today=TODAY)
    )
    state = SchedulingState.objects.get(user=user)
    state.scheduler_flavour = "monk"
    state.save(update_fields=["scheduler_flavour"])

    with pytest.raises(async_scheduler.SchedulerFlavourChanged):
        async_scheduler.publish_v1_result(computed)

    item.refresh_from_db()
    state.refresh_from_db()
    assert item.scheduled_date is None
    assert state.applied_scheduling_revision == 0


def test_publication_changes_only_disposable_projection_and_preserves_global_intent(user, make_item):
    item = make_item(
        user, "Work", duration_category=DurationCategory.UNDER_4_HOURS,
        start_date=TODAY, due_date=TODAY + timedelta(days=7),
        manual_requested_date=TODAY + timedelta(days=1), manual_requested_order=1,
    )
    revision = _request(user, mode="global")
    scheduling.request_reconcile(user, mode="minimal")
    # The coalesced minimal request supersedes the first computation, so use
    # the newest revision and verify its durable mode remains global.
    revision = SchedulingState.objects.get(user=user).scheduling_revision
    before = _canonical_snapshot(user)
    computed = async_scheduler.compute_v1_request(
        async_scheduler.capture_v1_request(user, revision, today=TODAY)
    )

    async_scheduler.publish_v1_result(computed)

    state = SchedulingState.objects.get(user=user)
    assert _canonical_snapshot(user) == before
    assert state.pending_scheduling_mode == "global"
    assert state.applied_scheduling_revision == revision
    item.refresh_from_db()
    assert item.scheduled_date is not None
    assert item.execution_rank is not None
    assert not SchedulerAllocation.objects.filter(item=item).exists()


def test_existing_synchronous_reconcile_is_unchanged(user):
    result = scheduling.reconcile(user, today=TODAY)

    state = SchedulingState.objects.get(user=user)
    assert result["scheduler"] == {"configured": False, "flavour": None}
    assert state.scheduling_revision == state.applied_scheduling_revision == 1


def test_legacy_capture_evaluates_model_actionability_and_frontier(user, make_item):
    """Legacy capture must use the model property, never a guessed SQL rule."""
    parent = make_item(user, "Container", item_type=ItemType.GOAL)
    child = make_item(
        user,
        "Leaf work",
        parent=parent,
        duration_category=DurationCategory.UNDER_1_HOUR,
    )
    revision = scheduling.request_reconcile(user)["requested_revision"]

    captured = async_scheduler.capture_legacy_request(user, revision, today=TODAY)
    tasks = {task.item_id: task for task in captured.tasks}

    assert tasks[parent.pk].is_eligible is False
    assert tasks[child.pk].is_eligible is True


def test_legacy_request_remains_pending_until_the_worker_publishes(user, make_item):
    item = make_item(user, "Pending legacy", duration_category=DurationCategory.UNDER_1_HOUR)
    revision = scheduling.request_reconcile(user, mode="global")["requested_revision"]

    item.refresh_from_db()
    state = SchedulingState.objects.get(user=user)
    assert item.scheduled_date is None
    assert state.scheduling_revision == revision
    assert state.applied_scheduling_revision < revision

    assert scheduler_worker.process_request(user.pk, revision) == "published"

    item.refresh_from_db()
    state.refresh_from_db()
    assert item.scheduled_date is not None
    assert state.applied_scheduling_revision == revision


@freeze_time("2026-10-27")
def test_legacy_worker_publication_matches_synchronous_policy(user, other_user, make_item):
    """Certify output parity, not merely that both legacy entry points exist."""
    for owner in (user, other_user):
        make_item(
            owner, "Anchored", duration_category=DurationCategory.UNDER_1_HOUR,
            start_date=TODAY, due_date=TODAY + timedelta(days=2),
            manual_requested_date=TODAY + timedelta(days=1), priority_position=1,
        )
        make_item(
            owner, "Automatic", duration_category=DurationCategory.UNDER_1_HOUR,
            due_date=TODAY + timedelta(days=2), priority_position=2,
        )
        # Deleted rows are absent from legacy eligibility but retain their
        # historical date; only their disposable rank is cleared.
        make_item(
            owner, "Deleted history", is_deleted=True,
            scheduled_date=TODAY + timedelta(days=5), execution_rank=7,
        )

    expected = scheduling._legacy_schedule(user, today=TODAY, mode="global")
    revision = scheduling.request_reconcile(other_user, mode="global")["requested_revision"]

    assert scheduler_worker.process_request(other_user.pk, revision) == "published"

    expected_projection = list(
        PlanningItem.objects.filter(user=user).order_by("priority_position", "pk").values_list(
            "scheduled_date", "execution_rank"
        )
    )
    actual_projection = list(
        PlanningItem.objects.filter(user=other_user).order_by("priority_position", "pk").values_list(
            "scheduled_date", "execution_rank"
        )
    )
    actual_runtime = SchedulingState.objects.get(user=other_user).scheduler_runtime

    assert actual_projection == expected_projection
    assert actual_runtime["compatibility_conflicts"] == expected["conflicts"]
