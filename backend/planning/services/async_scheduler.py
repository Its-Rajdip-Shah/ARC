"""Stage 2A's nonblocking V1 scheduling computation/publication boundary.

The three functions in this module are deliberately not a worker.  They make
the eventual worker's ownership boundaries testable now: capture uses a short
consistent database transaction, compute is pure in-memory engine work, and
publication uses the established per-user mutation lock before it replaces
only disposable scheduler state.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, replace
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db import transaction

from arc_scheduler import SchedulerEngineV1, SchedulerInputV1, SchedulerOutputV1

from planning.models import PlanningDependency, PlanningItem, SchedulingOverload, SchedulingState
from planning.services import priority, scheduler_v1, scheduling


class SchedulerFlavourChanged(RuntimeError):
    """A result belongs to a scheduler flavour that is no longer selected."""


class SchedulingRevisionAlreadyApplied(RuntimeError):
    """A result was already published for its requested scheduling revision."""


@dataclass(frozen=True)
class SchedulingComputationV1:
    """An immutable V1 request, and later its output, for one exact revision."""

    user_id: int
    requested_revision: int
    requested_scheduling_mode: str
    scheduler_flavour: str
    effective_scheduling_date: date
    scheduler_input: SchedulerInputV1
    scheduler_output: SchedulerOutputV1 | None = None
    # Original canonical deadlines for reporting only. The optimizer must
    # continue receiving the recovery-adjusted scheduling input.
    canonical_due_dates: tuple[tuple[int, date | None], ...] = ()


@dataclass(frozen=True)
class LegacyTask:
    """The complete, immutable subset consumed by ARC's legacy scheduler."""
    item_id: int
    duration_category: str | None
    start_date: date | None
    due_date: date | None
    manual_requested_date: date | None
    scheduled_date: date | None
    priority_position: int | None
    is_eligible: bool
    is_blocked: bool


@dataclass(frozen=True)
class LegacyComputation:
    """Captured legacy input and a pure, uncommitted legacy projection."""
    user_id: int
    requested_revision: int
    requested_scheduling_mode: str
    today: date
    tasks: tuple[LegacyTask, ...]
    capacity_by_duration: dict
    overload_dates: frozenset[date]
    scheduled_dates: dict[int, date | None] | None = None
    execution_ranks: dict[int, int | None] | None = None
    conflicts: tuple[dict, ...] | None = None


@transaction.atomic
def capture_v1_request(user, revision, today=None) -> SchedulingComputationV1:
    """Capture the current requested V1 input under the canonical lock order.

    Canonical command services take the per-user lock before touching planning
    rows and SchedulingState.  Taking that same lock makes the input a single
    committed canonical snapshot, then releases every lock before compute.
    """

    priority._lock(user)

    state = (
        SchedulingState.objects.select_for_update()
        .filter(user=user)
        .first()
    )

    if state is None or state.scheduling_revision != revision:
        current = state.scheduling_revision if state is not None else None
        raise scheduling.StaleSchedulingRevision(
            "Scheduler request is stale: "
            f"requested revision {revision}, current revision {current}."
        )

    if state.scheduler_flavour is None:
        raise scheduler_v1.SchedulerV1IntegrationError(
            "A V1 scheduler flavour must be configured before capture."
        )

    request = scheduler_v1.build_scheduler_input(
        user,
        flavour=state.scheduler_flavour,
        today=state.pending_scheduling_date if today is None else today,
    )
    # Global intent means reconsider every disposable placement.  V1's input
    # otherwise carries an existing suggestion as a minimal-mode hint.
    if state.pending_scheduling_mode == 'global':
        request = replace(
            request,
            tasks=tuple(
                replace(task, existing_scheduled_date=None)
                for task in request.tasks
            ),
        )

    return SchedulingComputationV1(
        user_id=user.pk,
        requested_revision=revision,
        requested_scheduling_mode=state.pending_scheduling_mode,
        scheduler_flavour=state.scheduler_flavour,
        effective_scheduling_date=request.today,
        scheduler_input=request,
        canonical_due_dates=tuple(
            PlanningItem.objects.filter(
                user=user,
                pk__in=[task.item_id for task in request.tasks],
            ).order_by('pk').values_list('pk', 'due_date')
        ),
    )


def compute_v1_request(captured: SchedulingComputationV1) -> SchedulingComputationV1:
    """Run V1 solely against the captured immutable input; never touch Django."""

    if captured.scheduler_output is not None:
        raise ValueError("This V1 request has already been computed.")

    output = SchedulerEngineV1().run(captured.scheduler_input)
    return replace(captured, scheduler_output=output)


@transaction.atomic
def capture_legacy_request(user, revision, today=None) -> LegacyComputation:
    """Take the short, consistent snapshot required by the legacy engine.

    The legacy optimiser predates the V1 contract and reads ORM rows directly.
    Capturing this deliberately small value representation lets its algorithm
    run outside a transaction while retaining its own scoring and placement
    policy.
    """
    priority._lock(user)
    state = SchedulingState.objects.select_for_update().filter(user=user).first()
    if state is None or state.scheduling_revision != revision:
        raise scheduling.StaleSchedulingRevision("Scheduler request is stale.")
    today = scheduler_v1.user_local_date(
        user, explicit_date=state.pending_scheduling_date if today is None else today
    )
    # Match ``_legacy_schedule`` exactly: soft-deleted rows are invisible to
    # both eligibility and blocked-dependency conflict reporting.  Primary-key
    # ordering also fixes the established conflict ordering in the immutable
    # capture rather than leaving it to a database plan.
    # ``PlanningItem.is_actionable`` is intentionally a Python property, not
    # a database column.  Keep real model instances through this short
    # capture transaction and evaluate the property exactly as synchronous
    # scheduling does; do not duplicate its item-type policy in SQL here.
    rows = list(PlanningItem.objects.for_user(user).order_by('pk').only(
        'id', 'item_type', 'duration_category', 'start_date', 'due_date',
        'manual_requested_date', 'scheduled_date', 'priority_position',
        'is_completed', 'is_deleted', 'parent_id',
    ))
    unfinished_parents = {
        row.parent_id for row in rows
        if row.parent_id is not None and not row.is_deleted and not row.is_completed
    }
    blocked = set(PlanningDependency.objects.filter(
        dependent__user=user, prerequisite__user=user,
        prerequisite__is_completed=False, prerequisite__is_deleted=False,
    ).values_list('dependent_id', flat=True))
    tasks = tuple(LegacyTask(
        item_id=row.pk, duration_category=row.duration_category,
        start_date=row.start_date, due_date=row.due_date,
        manual_requested_date=row.manual_requested_date,
        scheduled_date=row.scheduled_date, priority_position=row.priority_position,
        is_eligible=(not row.is_deleted and not row.is_completed
                     and row.is_actionable and row.pk not in unfinished_parents),
        is_blocked=row.pk in blocked,
    ) for row in rows)
    return LegacyComputation(
        user_id=user.pk, requested_revision=revision,
        requested_scheduling_mode=state.pending_scheduling_mode,
        today=today, tasks=tasks, capacity_by_duration=scheduling.capacities(user),
        overload_dates=frozenset(SchedulingOverload.objects.filter(user=user, allowed=True)
                                 .values_list('date', flat=True)),
    )


def compute_legacy_request(captured: LegacyComputation) -> LegacyComputation:
    """Run the original ARC greedy policy entirely in memory."""
    if captured.conflicts is not None:
        raise ValueError("This legacy request has already been computed.")
    dates, ranks, conflicts = scheduling.legacy_policy_projection(
        captured.tasks, captured.capacity_by_duration, captured.overload_dates,
        captured.today, captured.requested_scheduling_mode,
    )
    return replace(captured, scheduled_dates=dates, execution_ranks=ranks,
                   conflicts=tuple(conflicts))


@transaction.atomic
def publish_legacy_result(computed: LegacyComputation):
    """Publish a legacy projection after one short revision check."""
    if computed.conflicts is None:
        raise ValueError("A legacy result cannot be published before computation.")
    user = get_user_model()(pk=computed.user_id)
    priority._lock(user)
    state = scheduling._locked_revision_state(user, computed.requested_revision)
    if state.applied_scheduling_revision >= computed.requested_revision:
        raise SchedulingRevisionAlreadyApplied("Scheduler result was already applied.")
    # A flavour change means the captured legacy policy is no longer selected.
    if state.scheduler_flavour is not None:
        raise SchedulerFlavourChanged("Scheduler flavour changed before publication.")
    rows = list(PlanningItem.objects.select_for_update().filter(user=user))
    # ``scheduled_dates`` intentionally omits frontier tasks with an invalid
    # duration category.  They are still scheduler-eligible and synchronous
    # legacy scheduling clears their old disposable placement, so eligibility
    # must come from the captured task facts rather than output-map keys.
    eligible_ids = {
        task.item_id
        for task in computed.tasks
        if task.is_eligible and not task.is_blocked
    }
    changed = []
    changed_ids = []
    for row in rows:
        if row.pk in eligible_ids:
            new_day = computed.scheduled_dates.get(row.pk)
            new_rank = computed.execution_ranks.get(row.pk)
        else:
            # Match the synchronous adapter's eligibility reconciliation:
            # clear stale slots only for active visible actionable work.
            # Deleted rows retain their historical scheduled date, while all
            # non-eligible rows lose their disposable execution rank below.
            new_day = (
                None if (row.is_actionable and not row.is_deleted
                         and not row.is_completed and row.scheduled_date is not None)
                else row.scheduled_date
            )
            new_rank = None
        if (row.scheduled_date, row.execution_rank) != (new_day, new_rank):
            row.scheduled_date, row.execution_rank = new_day, new_rank
            changed.append(row)
            if row.pk in eligible_ids:
                changed_ids.append(row.pk)
    if changed:
        PlanningItem.objects.bulk_update(changed, ['scheduled_date', 'execution_rank'])
    scheduling._reconcile_progress_allocations(user, computed.today)
    runtime = {'configured': False, 'flavour': None,
               'compatibility_conflicts': list(computed.conflicts)}
    scheduling._store_scheduler_runtime(user, runtime, state=state,
                                        applied_revision=computed.requested_revision)
    state.scheduler_failure_count = 0
    state.scheduler_retry_after = None
    state.save(update_fields=['scheduler_failure_count', 'scheduler_retry_after'])
    return {'changed_ids': changed_ids,
            'conflicts': list(computed.conflicts), 'scheduler': runtime}


@transaction.atomic
def publish_v1_result(computed: SchedulingComputationV1):
    """Atomically publish a current V1 result, or reject it without changes."""

    if computed.scheduler_output is None:
        raise ValueError("A V1 result cannot be published before computation.")

    # Use the exact lock protocol used by canonical planning mutations:
    # per-user lock first, then SchedulingState.  Do not lock this during
    # compute; it is held only for this short freshness-and-persistence step.
    user = get_user_model()(pk=computed.user_id)
    priority._lock(user)

    state = scheduling._locked_revision_state(
        user,
        computed.requested_revision,
    )

    if state.applied_scheduling_revision >= computed.requested_revision:
        raise SchedulingRevisionAlreadyApplied(
            "Scheduler result was already applied: "
            f"requested revision {computed.requested_revision}, "
            f"applied revision {state.applied_scheduling_revision}."
        )

    if state.scheduler_flavour != computed.scheduler_flavour:
        raise SchedulerFlavourChanged(
            "Scheduler result flavour no longer matches the configured flavour."
        )

    # apply_scheduler_output reuses the frozen boundary validator against the
    # original request before it writes any disposable projection fields.
    persistence = scheduler_v1.apply_scheduler_output(
        user,
        computed.scheduler_input,
        computed.scheduler_output,
    )

    runtime = scheduling._scheduler_v1_response(
        computed.scheduler_output,
        persistence,
    )
    runtime['compatibility_conflicts'] = _compatibility_conflicts(
        computed.scheduler_input,
        canonical_due_dates=computed.canonical_due_dates,
    )
    scheduling._store_scheduler_runtime(
        user,
        runtime,
        state=state,
        applied_revision=computed.requested_revision,
    )
    state.scheduler_failure_count = 0
    state.scheduler_retry_after = None
    state.save(update_fields=['scheduler_failure_count', 'scheduler_retry_after'])

    return persistence


def _compatibility_conflicts(request, *, canonical_due_dates=None):
    """Recreate legacy *reporting* facts from immutable V1 input.

    Publication cannot call the legacy scheduler: it writes through a
    savepoint and would both lengthen the lock and violate the compute/publish
    separation.  These are the compatibility facts represented by the
    captured input, calculated without database access.
    """
    conflicts = []
    usage = {}
    original_deadlines = (
        dict(canonical_due_dates)
        if canonical_due_dates is not None
        else None
    )
    for task in request.tasks:
        if task.duration_category not in request.capacity_by_duration:
            conflicts.append({'item_id': task.item_id, 'code': 'duration_required'})
            continue
        reporting_due_date = (
            original_deadlines.get(task.item_id, task.due_date)
            if original_deadlines is not None
            else task.due_date
        )
        if reporting_due_date and reporting_due_date < request.today:
            conflicts.append({'item_id': task.item_id, 'code': 'overdue'})
        if task.anchor_date:
            if task.release_date and task.anchor_date < task.release_date:
                conflicts.append({'item_id': task.item_id, 'code': 'before_start'})
            if task.due_date and task.anchor_date > task.due_date:
                conflicts.append({'item_id': task.item_id, 'code': 'after_deadline'})
            key = (task.anchor_date, task.duration_category)
            usage[key] = usage.get(key, 0) + 1
            if (usage[key] > request.capacity_by_duration[task.duration_category]
                    and task.anchor_date not in request.overload_dates):
                conflicts.append({'item_id': task.item_id, 'code': 'capacity_exceeded'})
    return conflicts
