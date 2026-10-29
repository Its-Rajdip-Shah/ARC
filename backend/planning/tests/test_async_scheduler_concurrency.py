"""PostgreSQL adversarial certification for asynchronous V1 scheduling."""

from __future__ import annotations

import threading
import time
from datetime import date, timedelta

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection, transaction

from planning.models import DurationCategory, ItemType, PlanningItem, SchedulerAllocation, SchedulingState
from planning.services import async_scheduler, priority, scheduling


pytestmark = pytest.mark.django_db(transaction=True)

TODAY = date(2026, 10, 27)
THREAD_TIMEOUT = 8


@pytest.fixture(autouse=True)
def _requires_postgresql():
    if connection.vendor != "postgresql":
        pytest.skip("Concurrency certification requires PostgreSQL row locks.")


def _run_in_thread(target, results, key):
    def runner():
        close_old_connections()
        try:
            results[key] = target()
        except BaseException as exc:  # surfaced by the parent test
            results[key] = exc
        finally:
            close_old_connections()

    thread = threading.Thread(target=runner, name=key, daemon=True)
    thread.start()
    return thread


def _join(thread):
    thread.join(THREAD_TIMEOUT)
    assert not thread.is_alive(), "database concurrency operation timed out (possible deadlock)"


def _user(user_id):
    return get_user_model().objects.get(pk=user_id)


def _request(user, *, mode="minimal"):
    SchedulingState.objects.create(user=user, scheduler_flavour="lock-in")
    return scheduling.request_reconcile(user, mode=mode)["requested_revision"]


def _computed(user, revision):
    return async_scheduler.compute_v1_request(
        async_scheduler.capture_v1_request(user, revision, today=TODAY)
    )


def _canonical_snapshot(user_id):
    return list(
        PlanningItem.objects.filter(user_id=user_id).order_by("pk").values(
            "pk", "parent_id", "priority_position", "percent_completed",
            "manual_requested_date", "manual_requested_order",
            "manual_anchor_origin_date",
        )
    )


def _projection_snapshot(user_id):
    return (
        list(
            PlanningItem.objects.filter(user_id=user_id).order_by("pk").values_list(
                "pk", "scheduled_date", "execution_rank"
            )
        ),
        list(
            SchedulerAllocation.objects.filter(item__user_id=user_id)
            .order_by("item_id", "scheduled_date", "execution_rank")
            .values_list("item_id", "scheduled_date", "execution_rank", "percentage")
        ),
    )


def test_slow_compute_does_not_block_committed_canonical_request_or_publish_stale_result(
    user, make_item
):
    make_item(user, "Work", duration_category=DurationCategory.UNDER_8_HOURS)
    revision = _request(user)
    captured = async_scheduler.capture_v1_request(user, revision, today=TODAY)
    started = threading.Event()
    results = {}

    def slow_compute():
        started.set()
        time.sleep(2)
        return async_scheduler.compute_v1_request(captured)

    worker = _run_in_thread(slow_compute, results, "compute")
    assert started.wait(THREAD_TIMEOUT)

    began = time.monotonic()
    requested = scheduling.request_reconcile(user, mode="minimal")
    elapsed = time.monotonic() - began
    assert elapsed < 1, "canonical mutation waited for optimizer computation"

    _join(worker)
    computed = results["compute"]
    assert not isinstance(computed, BaseException)
    assert requested["requested_revision"] == revision + 1

    before = _projection_snapshot(user.pk)
    with pytest.raises(scheduling.StaleSchedulingRevision):
        async_scheduler.publish_v1_result(computed)
    assert _projection_snapshot(user.pk) == before


def test_publication_waits_behind_canonical_mutation_and_cannot_apply_superseded_revision(
    user, make_item
):
    make_item(user, "Work", duration_category=DurationCategory.UNDER_8_HOURS)
    revision = _request(user)
    computed = _computed(user, revision)
    canonical_before = _canonical_snapshot(user.pk)
    projection_before = _projection_snapshot(user.pk)
    lock_held = threading.Event()
    release_mutation = threading.Event()
    results = {}

    def canonical_mutation():
        with transaction.atomic():
            local_user = _user(user.pk)
            priority._lock(local_user)
            lock_held.set()
            assert release_mutation.wait(THREAD_TIMEOUT)
            return scheduling.request_reconcile(local_user, mode="global")

    mutator = _run_in_thread(canonical_mutation, results, "mutation")
    assert lock_held.wait(THREAD_TIMEOUT)
    publisher = _run_in_thread(
        lambda: async_scheduler.publish_v1_result(computed), results, "publish"
    )
    time.sleep(0.2)
    assert publisher.is_alive(), "publication bypassed the canonical per-user lock"
    release_mutation.set()
    _join(mutator)
    _join(publisher)

    assert not isinstance(results["mutation"], BaseException)
    assert isinstance(results["publish"], scheduling.StaleSchedulingRevision)
    state = SchedulingState.objects.get(user=user)
    assert state.scheduling_revision == revision + 1
    assert state.applied_scheduling_revision == 0
    assert state.pending_scheduling_mode == "global"
    assert _canonical_snapshot(user.pk) == canonical_before
    assert _projection_snapshot(user.pk) == projection_before


def test_simultaneous_publications_are_serialized_without_partial_projection(user, make_item):
    parent = make_item(user, "Parent", item_type=ItemType.GOAL)
    make_item(
        user,
        "Work",
        parent=parent,
        duration_category=DurationCategory.UNDER_8_HOURS,
        priority_position=3,
        percent_completed=25,
        manual_requested_date=TODAY + timedelta(days=1),
        manual_requested_order=2,
        manual_anchor_origin_date=TODAY + timedelta(days=1),
    )
    revision = _request(user)
    computed = _computed(user, revision)
    canonical_before = _canonical_snapshot(user.pk)
    barrier = threading.Barrier(2, timeout=THREAD_TIMEOUT)
    results = {}

    def publish():
        barrier.wait()
        return async_scheduler.publish_v1_result(computed)

    first = _run_in_thread(publish, results, "first")
    second = _run_in_thread(publish, results, "second")
    _join(first)
    _join(second)

    successes = [
        result for result in results.values()
        if not isinstance(result, BaseException)
    ]
    rejections = [
        result for result in results.values()
        if isinstance(result, async_scheduler.SchedulingRevisionAlreadyApplied)
    ]
    assert len(successes) == 1
    assert len(rejections) == 1
    state = SchedulingState.objects.get(user=user)
    assert state.scheduling_revision == state.applied_scheduling_revision == revision
    projection = _projection_snapshot(user.pk)
    assert any(scheduled_date is not None for _, scheduled_date, _ in projection[0])
    assert projection[1], "a successful publication must leave a complete projection"
    assert _canonical_snapshot(user.pk) == canonical_before


def test_stale_concurrent_publications_leave_the_existing_projection_untouched(user, make_item):
    make_item(user, "Work", duration_category=DurationCategory.UNDER_8_HOURS)
    revision = _request(user)
    computed = _computed(user, revision)
    scheduling.request_reconcile(user)
    before = _projection_snapshot(user.pk)
    barrier = threading.Barrier(2, timeout=THREAD_TIMEOUT)
    results = {}

    def publish():
        barrier.wait()
        return async_scheduler.publish_v1_result(computed)

    first = _run_in_thread(publish, results, "first")
    second = _run_in_thread(publish, results, "second")
    _join(first)
    _join(second)

    assert all(isinstance(results[key], scheduling.StaleSchedulingRevision) for key in results)
    assert _projection_snapshot(user.pk) == before


def test_request_uses_user_then_scheduling_state_lock_order_and_preserves_global_intent(user):
    SchedulingState.objects.create(user=user, scheduler_flavour="lock-in")
    user_locked = threading.Event()
    release = threading.Event()
    results = {}

    def hold_canonical_lock():
        with transaction.atomic():
            priority._lock(_user(user.pk))
            user_locked.set()
            assert release.wait(THREAD_TIMEOUT)

    holder = _run_in_thread(hold_canonical_lock, results, "holder")
    assert user_locked.wait(THREAD_TIMEOUT)
    requester = _run_in_thread(
        lambda: scheduling.request_reconcile(_user(user.pk), mode="global"), results, "global"
    )
    time.sleep(0.2)
    assert requester.is_alive(), "request locked SchedulingState before the per-user lock"
    release.set()
    _join(holder)
    _join(requester)
    assert not isinstance(results["global"], BaseException)

    minimal = scheduling.request_reconcile(user, mode="minimal")
    state = SchedulingState.objects.get(user=user)
    assert minimal["mode"] == state.pending_scheduling_mode == "global"
    assert state.scheduling_revision == 2
