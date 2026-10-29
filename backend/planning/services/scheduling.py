"""Global, capacity-constrained execution dates and atomic Timeline operations."""
from collections import Counter
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone

from planning.services.calendar_dates import user_local_date
from planning.services.overdue import effective_due_date
from planning.models import (
    DurationCategory,
    PlanningDependency,
    PlanningItem,
    ProgressSegment,
    SchedulerAllocation,
    SchedulingOverload,
    SchedulingState,
    SPLITTABLE_DURATION_CATEGORIES,
)
from planning.services import dependencies, history, leaf_order_sync, priority


class StaleSchedulingRevision(RuntimeError):
    """A computed disposable schedule no longer matches current intent."""


# Baseline scheduler policy, intentionally replaceable by future algorithm policy.
BASELINE_SCHEDULER_CAPACITY = {
    DurationCategory.UNDER_20_MINUTES: 5,
    DurationCategory.UNDER_1_HOUR: 4,
    DurationCategory.UNDER_4_HOURS: 3,
    DurationCategory.UNDER_8_HOURS: 3,
    DurationCategory.UNDER_16_HOURS: 3,
    DurationCategory.OVER_16_HOURS: 3,
}


class SchedulingConflict(Exception):
    def __init__(self, conflicts):
        self.conflicts = conflicts
        super().__init__('The requested schedule cannot satisfy the constraints.')


def capacities(user):
    return dict(BASELINE_SCHEDULER_CAPACITY)


def _focus_capacity_label(bucket):
    labels = {
        DurationCategory.UNDER_20_MINUTES:
            "under-20-minute tasks",

        DurationCategory.UNDER_1_HOUR:
            "under-1-hour tasks",

        DurationCategory.UNDER_4_HOURS:
            "under-4-hour tasks",

        DurationCategory.UNDER_8_HOURS:
            "under-8-hour tasks",

        DurationCategory.UNDER_16_HOURS:
            "under-16-hour tasks",

        DurationCategory.OVER_16_HOURS:
            "over-16-hour tasks",
    }

    return labels.get(
        bucket,
        "tasks",
    )


def focus_capacity_conflicts(
    user,
    changes,
):
    """Return action-scoped Focus capacity conflicts.

    SchedulingOverload remains persistent global scheduler policy.

    Focus placement confirmation is action-scoped: a new explicit
    cross-date move that increases an already-full date/category pair
    requires confirmation again for that action.

    Same-day reorder never changes capacity and therefore never prompts.
    """

    limits = capacities(
        user,
    )

    item_ids = {
        change["item_id"]
        for change in changes
    }

    changed_items = {
        item.pk: item
        for item in (
            _scheduler_eligible(
                user,
                include_blocked=True,
            )
            .filter(
                pk__in=item_ids,
            )
        )
    }

    all_items = list(
        _scheduler_eligible(
            user,
            include_blocked=True,
        )
        .filter(
            manual_requested_date__isnull=False,
        )
    )

    def capacity_bucket(item):
        return item.duration_category

    before = Counter()

    for item in all_items:
        bucket = capacity_bucket(
            item,
        )

        day = item.manual_requested_date

        if (
            day is None
            or bucket not in limits
        ):
            continue

        before[
            (
                day,
                bucket,
            )
        ] += 1

    after = before.copy()

    for change in changes:
        item = changed_items.get(
            change[
                "item_id"
            ]
        )

        if item is None:
            continue

        bucket = capacity_bucket(
            item,
        )

        if bucket not in limits:
            continue

        old_day = (
            item.manual_requested_date
        )

        new_day = change[
            "date"
        ]

        if old_day == new_day:
            continue

        if old_day is not None:
            after[
                (
                    old_day,
                    bucket,
                )
            ] -= 1

        after[
            (
                new_day,
                bucket,
            )
        ] += 1

    conflicts = []

    for change in changes:
        if change.get(
            "allow_overload",
            False,
        ):
            continue

        item = changed_items.get(
            change[
                "item_id"
            ]
        )

        if item is None:
            continue

        bucket = capacity_bucket(
            item,
        )

        if bucket not in limits:
            continue

        old_day = (
            item.manual_requested_date
        )

        new_day = change[
            "date"
        ]

        # Reordering within one day does not alter capacity.
        if old_day == new_day:
            continue

        key = (
            new_day,
            bucket,
        )

        previous_count = before[
            key
        ]

        resulting_count = after[
            key
        ]

        limit = limits[
            bucket
        ]

        # Prompt only if this action increased the target day's
        # count and the resulting count exceeds the configured limit.
        if (
            resulting_count
            <= limit
            or resulting_count
            <= previous_count
        ):
            continue

        conflicts.append({
            "item_id":
                item.pk,

            "item_title":
                item.title,

            "code":
                "capacity_exceeded",

            "requested_date":
                new_day,

            "duration_label":
                _focus_capacity_label(
                    bucket,
                ),

            "capacity_limit":
                limit,

            "resulting_count":
                resulting_count,

            "over_by_count":
                (
                    resulting_count
                    - limit
                ),
        })

    return conflicts


def _conflict(item, code):
    return {'item_id': item.pk, 'code': code}


def _scheduler_eligible(
    user,
    *,
    include_blocked=False,
):
    """Active execution-frontier work that may own an execution date.

    Production scheduling excludes dependency-blocked work.

    Focus conflict preflight may include blocked frontier work so ARC can
    present the canonical dependency and require an explicit decision before
    changing it.
    """

    unfinished_children = (
        PlanningItem.objects
        .visible()
        .filter(
            user=user,
            parent_id=OuterRef("pk"),
            is_completed=False,
        )
    )

    queryset = (
        PlanningItem.objects
        .for_user(user)
        .actionable()
        .filter(
            is_completed=False,
            is_deleted=False,
        )
        .annotate(
            has_unfinished_children=
                Exists(
                    unfinished_children
                ),

            is_residual=
                Exists(
                    PlanningItem.objects
                    .visible()
                    .filter(
                        user=user,
                        parent_id=
                            OuterRef("pk"),
                    )
                ),
        )
        .filter(
            has_unfinished_children=False,
        )
    )

    if not include_blocked:
        queryset = queryset.exclude(
            blocked_by_dependencies__prerequisite__is_completed=False,
            blocked_by_dependencies__prerequisite__is_deleted=False,
        )

    return queryset.distinct()


def _scheduling_order(item):
    """Deterministic order without inventing priority for unpositioned work."""
    positioned = item.priority_position is not None
    return (
        0 if positioned else 1,
        item.priority_position if positioned else 0,
        item.due_date or timezone.datetime.max.date(),
        item.start_date or timezone.datetime.max.date(),
        item.pk,
    )


def _validate_date(item, day, today):
    if day < today:
        return 'past_date'
    if item.start_date and day < item.start_date:
        return 'before_start'
    if item.due_date and day > item.due_date:
        return 'after_deadline'
    return None


def legacy_policy_projection(tasks, limits, overload_dates, today, mode):
    """Pure legacy placement policy shared by worker-side computation.

    ``tasks`` are immutable value objects exposing the legacy scheduling
    fields.  This intentionally contains no ORM access or mutation; the
    synchronous adapter remains responsible for persistence, allocations and
    locking.
    """
    if mode not in {'minimal', 'global'}:
        raise ValueError('Unknown scheduling mode')
    conflicts, usage, dates = [], Counter(), {}
    eligible = [task for task in tasks if task.is_eligible and not task.is_blocked]

    def order(task):
        return (0 if task.priority_position is not None else 1,
                task.priority_position or 0, task.due_date or date.max,
                task.start_date or date.max, task.item_id)

    # Capture adapters supply tasks in primary-key order.  Preserve that order
    # for blocked-dependency reporting just as the old ORM loop did.
    for task in tasks:
        if task.is_blocked and task.manual_requested_date and task.manual_requested_date >= today:
            conflicts.append({'item_id': task.item_id, 'code': 'blocked_dependency'})
    pending = []
    for task in sorted(eligible, key=order):
        bucket = task.duration_category
        if bucket not in limits:
            conflicts.append({'item_id': task.item_id, 'code': 'duration_required'})
            continue
        if task.due_date and task.due_date < today:
            conflicts.append({'item_id': task.item_id, 'code': 'overdue'})
        manual = task.manual_requested_date
        if manual and manual < today:
            manual = None
        if manual:
            code = ('past_date' if manual < today else
                    'before_start' if task.start_date and manual < task.start_date else
                    'after_deadline' if task.due_date and manual > task.due_date else None)
            if code:
                conflicts.append({'item_id': task.item_id, 'code': code})
            if usage[(manual, bucket)] >= limits[bucket] and manual not in overload_dates:
                conflicts.append({'item_id': task.item_id, 'code': 'capacity_exceeded'})
            usage[(manual, bucket)] += 1
            dates[task.item_id] = None if task.start_date and manual < task.start_date else manual
        else:
            pending.append(task)
    for task in pending:
        bucket = task.duration_category
        lower = max(today, task.start_date or today)
        due = None if task.due_date and task.due_date < today else task.due_date
        day = lower
        if (mode == 'minimal' and task.scheduled_date and task.scheduled_date >= lower
                and (due is None or task.scheduled_date <= due)):
            day = task.scheduled_date
        if limits[bucket] == 0:
            conflicts.append({'item_id': task.item_id, 'code': 'capacity_disabled'})
        else:
            while usage[(day, bucket)] >= limits[bucket] and (due is None or day <= due):
                day += timedelta(days=1)
        if due and day > due:
            if lower <= due:
                choices = (lower + timedelta(days=i) for i in range((due - lower).days + 1))
                day = min(choices, key=lambda candidate: (usage[(candidate, bucket)], candidate))
                if usage[(day, bucket)] >= limits[bucket]:
                    conflicts.append({'item_id': task.item_id, 'code': 'no_capacity_before_deadline'})
            else:
                day = lower
                conflicts.append({'item_id': task.item_id, 'code': 'after_deadline'})
        usage[(day, bucket)] += 1
        dates[task.item_id] = day
    ranks, counts = {}, Counter()
    for task in sorted(eligible, key=lambda task: (dates.get(task.item_id) or date.max, order(task))):
        day = dates.get(task.item_id)
        if day is not None:
            counts[day] += 1
            ranks[task.item_id] = counts[day]

    # Allocation conflicts are part of the legacy reporting contract even
    # though allocations themselves are persisted by the adapter.  Derive
    # their dates from the same captured values so the worker never needs a
    # database read during computation.
    for task in sorted(eligible, key=lambda task: (dates.get(task.item_id) or date.max, order(task))):
        day = dates.get(task.item_id)
        active_anchor = (
            task.manual_requested_date
            and task.manual_requested_date >= today
        )
        due = task.due_date
        if due and due < today and not active_anchor:
            due = None
        if (
            day is not None
            and due is not None
            and task.duration_category in SPLITTABLE_DURATION_CATEGORIES
            and day + timedelta(days=_allocation_count(task.duration_category) - 1) > due
        ):
            conflict = {'item_id': task.item_id, 'code': 'allocation_after_deadline'}
            if conflict not in conflicts:
                conflicts.append(conflict)
    return dates, ranks, conflicts


@transaction.atomic
def _legacy_schedule(user, today=None, *, mode='minimal'):
    """Generate proposals from canonical state, reconsidering dates in global mode.

    Capacity is soft when deadlines are infeasible. Release dates remain hard;
    overdue and user-fixed dates are retained, with conflicts reported.
    """
    if mode not in {'minimal', 'global'}:
        raise ValueError('Unknown scheduling mode')
    today = user_local_date(user, explicit_date=today)
    # Scheduling may read/lock canonical priority, but it has no authority
    # to repair or manufacture canonical priority as a side effect.
    priority._lock(user)
    limits = capacities(user)
    overloaded = set(SchedulingOverload.objects.filter(user=user, allowed=True).values_list('date', flat=True))
    items = list(_scheduler_eligible(user))

    # Eligibility reconciliation is required in every scheduling mode.
    # Hierarchy changes can make a previously scheduled item cease to be
    # execution-frontier work. Clear that stale execution state without
    # forcing unrelated valid automatic dates to move.
    eligible_ids = {item.pk for item in items}

    stale = list(
        PlanningItem.objects.for_user(user)
        .actionable()
        .filter(
            is_completed=False,
            is_deleted=False,
            scheduled_date__isnull=False,
        )
        .exclude(pk__in=eligible_ids)
    )

    if stale:
        for item in stale:
            item.scheduled_date = None
        PlanningItem.objects.bulk_update(
            stale,
            ['scheduled_date'],
        )

    # The pure policy receives the complete canonical facts it needs.  This
    # adapter deliberately does all ORM work before invoking it, so the worker
    # and this compatibility path cannot drift in placement semantics.
    all_rows = list(PlanningItem.objects.for_user(user).order_by('pk'))
    blocked_ids = set(PlanningDependency.objects.filter(
        dependent__user=user,
        prerequisite__user=user,
        prerequisite__is_completed=False,
        prerequisite__is_deleted=False,
    ).values_list('dependent_id', flat=True))
    eligible_ids = {item.pk for item in items}
    tasks = tuple(SimpleNamespace(
        item_id=row.pk,
        duration_category=row.duration_category,
        start_date=row.start_date,
        due_date=row.due_date,
        manual_requested_date=row.manual_requested_date,
        scheduled_date=row.scheduled_date,
        priority_position=row.priority_position,
        is_eligible=row.pk in eligible_ids,
        is_blocked=row.pk in blocked_ids,
    ) for row in all_rows)
    dates, execution_ranks, conflicts = legacy_policy_projection(
        tasks, limits, overloaded, today, mode,
    )
    changed = []
    for item in items:
        day = dates.get(item.pk)
        if item.scheduled_date != day:
            item.scheduled_date = day
            changed.append(item)
    if changed:
        PlanningItem.objects.bulk_update(changed, ['scheduled_date'])

    # Proposed allocations are disposable scheduler output. Rebuild only the
    # unconfirmed projections; confirmed segments remain canonical progress.
    _reconcile_progress_allocations(user, today)
    # Rank is disposable execution advice, independent of canonical priority.
    for item in items:
        item.execution_rank = execution_ranks.get(item.pk)
    PlanningItem.objects.filter(user=user).exclude(pk__in=eligible_ids).update(execution_rank=None)
    if items:
        PlanningItem.objects.bulk_update(items, ['execution_rank'])
    allocations = list(SchedulerAllocation.objects.filter(item__user=user).select_related('item'))
    ranks = Counter()
    for allocation in sorted(allocations, key=lambda row: (row.scheduled_date, _scheduling_order(row.item))):
        ranks[allocation.scheduled_date] += 1
        allocation.execution_rank = ranks[allocation.scheduled_date]
        due = effective_due_date(allocation.item, today)
        if due and allocation.scheduled_date > due:
            conflict = _conflict(allocation.item, 'allocation_after_deadline')
            if conflict not in conflicts:
                conflicts.append(conflict)
    if allocations:
        SchedulerAllocation.objects.bulk_update(allocations, ['execution_rank'])


    return {'changed_ids': [item.pk for item in changed], 'conflicts': conflicts}


@transaction.atomic
def _next_scheduling_revision(user):
    """Allocate one monotonic reconciliation revision for this user."""

    state, _ = (
        SchedulingState.objects
        .select_for_update()
        .get_or_create(user=user)
    )

    state.scheduling_revision += 1
    state.save(
        update_fields=[
            'scheduling_revision',
        ]
    )

    return state.scheduling_revision


@transaction.atomic
def request_reconcile(
    user,
    today=None,
    *,
    mode='minimal',
):
    """Durably request, but do not compute, a schedule reconciliation.

    The state row is locked only long enough to allocate a revision and
    coalesce intent.  A future separate worker must calculate and apply the
    requested revision after the canonical mutation commits.
    """

    if mode not in {'minimal', 'global'}:
        raise ValueError("Scheduling request mode must be 'minimal' or 'global'.")

    # Keep requests in the same per-user -> SchedulingState lock order as
    # canonical commands and asynchronous capture/publication.  Besides
    # avoiding an inverse lock order, this makes a requested revision part of
    # the same serialized canonical snapshot.
    priority._lock(user)

    state, _ = (
        SchedulingState.objects
        .select_for_update()
        .get_or_create(user=user)
    )

    has_pending_request = (
        state.applied_scheduling_revision
        < state.scheduling_revision
    )

    # A global request subsumes minimal work.  Preserve it while there is
    # pending work, but allow a fresh request after an applied revision to set
    # its own intent.
    if mode == 'global' or not (
        has_pending_request
        and state.pending_scheduling_mode == 'global'
    ):
        state.pending_scheduling_mode = mode

    # Preserve the calendar date of the canonical request across worker delay.
    state.pending_scheduling_date = user_local_date(user, explicit_date=today)
    state.scheduling_revision += 1
    state.scheduler_failure_count = 0
    state.scheduler_retry_after = None
    state.save(
        update_fields=[
            'scheduling_revision',
            'pending_scheduling_mode',
            'pending_scheduling_date',
            'scheduler_failure_count',
            'scheduler_retry_after',
        ]
    )

    return {
        'requested_revision': state.scheduling_revision,
        'applied_revision': state.applied_scheduling_revision,
        'pending': True,
        'mode': state.pending_scheduling_mode,
        'freshness': {
            'pending': True,
            'requested_revision': state.scheduling_revision,
            'applied_revision': state.applied_scheduling_revision,
        },
    }


@transaction.atomic
def _mark_restored_schedule_current(user):
    """Advance freshness after history restores disposable schedule state.

    Schedule undo/redo deliberately restores the historical proposal directly
    instead of rerunning the optimizer. The monotonic revision must still
    advance so any older in-flight computation can never overwrite that
    explicit history action.
    """

    state, _ = (
        SchedulingState.objects
        .select_for_update()
        .get_or_create(user=user)
    )

    state.scheduling_revision += 1
    state.applied_scheduling_revision = (
        state.scheduling_revision
    )

    state.save(
        update_fields=[
            'scheduling_revision',
            'applied_scheduling_revision',
        ]
    )

    return state.scheduling_revision


@transaction.atomic
def restore_scheduling_intent(user, intent):
    """Restore a historical scheduling *request* without reviving its revision.

    Revisions are deliberately monotonic.  Undoing a request therefore either
    marks the restored projection current (when there was no earlier pending
    request), or creates a new request with the historical mode.  In both
    cases a worker holding the old revision is made stale before it can write.
    """
    if intent is None:
        return _mark_restored_schedule_current(user)

    state, _ = SchedulingState.objects.select_for_update().get_or_create(user=user)
    state.scheduling_revision += 1
    state.scheduler_failure_count = 0
    state.scheduler_retry_after = None
    if intent.get('pending'):
        state.pending_scheduling_mode = intent['mode']
    else:
        state.applied_scheduling_revision = state.scheduling_revision
    state.save(update_fields=[
        'scheduling_revision', 'applied_scheduling_revision',
        'pending_scheduling_mode', 'scheduler_failure_count',
        'scheduler_retry_after',
    ])
    return state.scheduling_revision


def _locked_revision_state(
    user,
    expected_revision,
):
    """Lock and verify freshness before disposable state can apply."""

    state, _ = (
        SchedulingState.objects
        .select_for_update()
        .get_or_create(user=user)
    )

    if (
        expected_revision is not None
        and state.scheduling_revision
        != expected_revision
    ):
        raise StaleSchedulingRevision(
            "Scheduler result is stale: "
            f"expected revision {expected_revision}, "
            f"current revision {state.scheduling_revision}."
        )

    return state


def _compatibility_conflicts(
    user,
    today,
    *,
    mode,
):
    """Run frozen legacy conflict logic without persisting its proposal."""

    savepoint = transaction.savepoint_create()

    try:
        result = _legacy_schedule(
            user,
            today,
            mode=mode,
        )

        conflicts = list(
            result['conflicts']
        )
    finally:
        transaction.savepoint_rollback(
            savepoint
        )

    return conflicts


@transaction.atomic
def reconcile(
    user,
    today=None,
    *,
    mode='minimal',
):
    """Request and synchronously reconcile the newest schedule revision.

    This slice deliberately remains synchronous. A later worker can execute
    schedule(..., expected_revision=revision) out of band without changing
    the freshness contract established here.
    """

    revision = _next_scheduling_revision(
        user
    )

    return schedule(
        user,
        today,
        mode=mode,
        expected_revision=revision,
    )


def _configured_scheduler_flavour(user):
    """Return the explicitly selected V1 flavour, or None.

    A null SchedulingState.scheduler_flavour is deliberate: the user has not
    opted into either production scheduler behaviour yet.
    """

    state = (
        SchedulingState.objects
        .filter(user=user)
        .only('scheduler_flavour')
        .first()
    )

    if state is None:
        return None

    return state.scheduler_flavour


def _disposable_schedule_state(user):
    """Snapshot only scheduler-owned summary projection fields."""

    return {
        item_id: (scheduled_date, execution_rank)
        for item_id, scheduled_date, execution_rank in (
            PlanningItem.objects
            .filter(user=user)
            .values_list(
                'pk',
                'scheduled_date',
                'execution_rank',
            )
        )
    }


def _json_safe_scheduler_value(value):
    """Convert frozen scheduler values into JSONField-safe primitives."""

    if isinstance(value, Decimal):
        return str(value)

    if isinstance(value, date):
        return value.isoformat()

    if isinstance(value, dict):
        return {
            key: _json_safe_scheduler_value(item)
            for key, item in value.items()
        }

    if isinstance(value, (list, tuple)):
        return [
            _json_safe_scheduler_value(item)
            for item in value
        ]

    return value


def _store_scheduler_runtime(
    user,
    runtime,
    *,
    state=None,
    applied_revision=None,
):
    """Replace cached scheduler output and its applied freshness token."""

    if state is None:
        state, _ = SchedulingState.objects.get_or_create(
            user=user,
        )

    state.scheduler_runtime = _json_safe_scheduler_value(
        runtime
    )

    fields = [
        'scheduler_runtime',
    ]

    if applied_revision is not None:
        state.applied_scheduling_revision = (
            applied_revision
        )
        fields.append(
            'applied_scheduling_revision'
        )

    state.save(
        update_fields=fields
    )


def _scheduler_v1_response(output, persistence):
    """Serialize the useful frozen V1 output for API consumers.

    This is derived/disposable scheduler information only.  It does not
    manufacture or alter canonical planning state.
    """

    objective = output.objective

    return {
        'configured': True,
        'flavour': output.metadata.flavour.value,
        'engine_version': output.metadata.engine_version,
        'input_contract_version': (
            output.metadata.input_contract_version
        ),
        'output_contract_version': (
            output.metadata.output_contract_version
        ),
        'iterations': output.metadata.iterations,
        'evaluations': output.metadata.evaluations,
        'termination_reason': (
            output.metadata.termination_reason
        ),
        'engine_conflicts': list(output.conflicts),
        'diagnostics': [
            {
                'code': code,
                'detail': detail,
            }
            for code, detail in output.diagnostics
        ],
        'allocation_count': persistence['allocation_count'],
        'allocations': [
            {
                'item_id': row.item_id,
                'scheduled_date': row.scheduled_date,
                'hours': row.hours,
                'percentage': row.percentage,
                'execution_rank': row.execution_rank,
            }
            for row in output.allocations
        ],
        'estimates': [
            {
                'item_id': row.item_id,
                'total_hours': row.total_hours,
                'source': row.source,
            }
            for row in output.estimates
        ],
        'daily_load': [
            {
                'scheduled_date': row.scheduled_date,
                'hours': row.hours,
                'status': row.status.value,
            }
            for row in output.daily_load
        ],
        'weekly_load': [
            {
                'period': row.period,
                'hours': row.hours,
                'status': row.status.value,
            }
            for row in output.weekly_load
        ],
        'monthly_load': [
            {
                'period': row.period,
                'hours': row.hours,
                'status': row.status.value,
            }
            for row in output.monthly_load
        ],
        'objective': {
            'late_hours': objective.late_hours,
            'infeasible_day_count': objective.infeasible_day_count,
            'infeasible_excess_hours': (
                objective.infeasible_excess_hours
            ),
            'tiny_nonfinal_sessions': (
                objective.tiny_nonfinal_sessions
            ),
            'avoidable_idle_days': (
                objective.avoidable_idle_days
            ),
            'max_daily_hours': objective.max_daily_hours,
            'overloaded_excess_hours': (
                objective.overloaded_excess_hours
            ),
            'overloaded_day_count': (
                objective.overloaded_day_count
            ),
            'unjustified_marathon_excess_hours': (
                objective.unjustified_marathon_excess_hours
            ),
            'deadline_buffer_risk': (
                objective.deadline_buffer_risk
            ),
            'priority_postponement_days': (
                objective.priority_postponement_days
            ),
            'session_shape_penalty': (
                objective.session_shape_penalty
            ),
            'fragmentation_count': (
                objective.fragmentation_count
            ),
            'preferred_excess_squared': (
                objective.preferred_excess_squared
            ),
            'continuity_gap_days': (
                objective.continuity_gap_days
            ),
            'completion_day_sum': (
                objective.completion_day_sum
            ),
        },
    }


@transaction.atomic
def schedule(
    user,
    today=None,
    *,
    mode='minimal',
    expected_revision=None,
):
    """ARC scheduling facade.

    Unconfigured users retain the frozen legacy ARC scheduler behaviour.

    Once a user explicitly chooses Lock-in or Monk, the legacy scheduler is
    still run first solely to preserve ARC's established conflict contract.
    The versioned V1 engine then owns the final disposable schedule proposal.

    Canonical planning state remains outside scheduler authority.
    """

    today = user_local_date(user, explicit_date=today)
    # Scheduling is projection-only.  In particular, it must not expire,
    # carry, clear, or otherwise rewrite a user's manual commitment while
    # computing or publishing dates.  Anchor lifecycle maintenance is an
    # explicit daily-domain operation in ``daily_schedule``; keeping it out
    # of this facade also makes direct worker publication authority-safe.
    anchor_changed_ids = []
    flavour = _configured_scheduler_flavour(user)

    if flavour is None:
        # Legacy scheduling still computes and applies in one pass.
        # Holding the revision row lock prevents a newer reconciliation
        # from committing ahead of this short legacy operation.
        state = None

        if expected_revision is not None:
            state = _locked_revision_state(
                user,
                expected_revision,
            )

        result = _legacy_schedule(
            user,
            today,
            mode=mode,
        )

        if state is not None:
            state.applied_scheduling_revision = (
                expected_revision
            )
            state.save(
                update_fields=[
                    'applied_scheduling_revision',
                ]
            )

        result['scheduler'] = {
            'configured': False,
            'flavour': None,
        }

        return _with_anchor_changes(result, user, anchor_changed_ids)

    before = _disposable_schedule_state(user)

    # Preserve ARC's exact established compatibility-conflict surface without
    # allowing the legacy intermediary schedule proposal to persist.
    compatibility_conflicts = (
        _compatibility_conflicts(
            user,
            today,
            mode=mode,
        )
    )

    from planning.services import scheduler_v1

    # The expensive frozen V1 engine is compute-only here. No V1 output is
    # persisted until freshness is checked below.
    request, output = (
        scheduler_v1.run_scheduler_v1(
            user,
            flavour=flavour,
            today=today,
        )
    )

    state = _locked_revision_state(
        user,
        expected_revision,
    )

    persistence = (
        scheduler_v1.apply_scheduler_output(
            user,
            request,
            output,
        )
    )

    after = _disposable_schedule_state(user)

    changed_ids = sorted(
        item_id
        for item_id in set(before) | set(after)
        if before.get(item_id) != after.get(item_id)
    )

    runtime = _scheduler_v1_response(
        output,
        persistence,
    )

    # Preserve the compatibility conflict surface alongside the cached V1
    # runtime so later read-only Timeline requests do not need to rerun either
    # scheduler merely to reconstruct the response.
    runtime['compatibility_conflicts'] = (
        compatibility_conflicts
    )

    _store_scheduler_runtime(
        user,
        runtime,
        state=state,
        applied_revision=expected_revision,
    )

    return _with_anchor_changes({
        'changed_ids': changed_ids,
        'conflicts': compatibility_conflicts,
        'scheduler': runtime,
    }, user, anchor_changed_ids)


@transaction.atomic
def _reconcile_manual_anchors(user, today):
    """Carry a commitment through days 1-3, then retain its origin as history.

    Date-invalid carries terminate the commitment using the same validation
    as explicit moves. Completed/deleted work cannot retain an active window.
    Return every changed ID, including carries and legacy origin initialization.
    """
    priority._lock(user)
    anchors = list(
        PlanningItem.objects.select_for_update().filter(
            user=user, manual_requested_date__isnull=False,
        ).order_by('pk')
    )
    if not anchors:
        return []
    # Match Focus anchor-order validation, including blocked frontier work.
    eligible = {
        item.pk: item
        for item in _scheduler_eligible(user, include_blocked=True).filter(
            manual_requested_date__isnull=False,
        )
    }
    changed, carried = [], []
    occupied = {}
    for item in anchors:
        origin = item.manual_anchor_origin_date or item.manual_requested_date
        age = (today - origin).days
        if (
            item.is_completed or item.is_deleted or age >= 4
            or (1 <= age <= 3 and _validate_date(item, today, today))
        ):
            item.expired_manual_requested_date = origin
            item.manual_requested_date = None
            item.manual_requested_order = None
            item.manual_anchor_origin_date = None
            changed.append(item)
            continue
        if item.manual_anchor_origin_date is None:
            item.manual_anchor_origin_date = origin
            changed.append(item)
        if 1 <= age <= 3 and item.manual_requested_date != today:
            carried.append(item)
        elif item.manual_requested_date == today and item.manual_requested_order is not None and item.pk in eligible:
            candidate = eligible[item.pk]
            bucket = focus_bucket_key(candidate.duration_category, is_residual=candidate.is_residual)
            occupied.setdefault(bucket, set()).add(item.manual_requested_order)

    carried.sort(key=lambda item: (
        item.manual_anchor_origin_date,
        item.manual_requested_order if item.manual_requested_order is not None else float('inf'),
        item.pk,
    ))
    changed_ids = {item.pk for item in changed}
    for item in carried:
        item.manual_requested_date = today
        # Structural/non-actionable work has no Focus execution slot.
        if item.pk in eligible:
            candidate = eligible[item.pk]
            bucket = focus_bucket_key(candidate.duration_category, is_residual=candidate.is_residual)
            used = occupied.setdefault(bucket, set())
            order = 1
            while order in used:
                order += 1
            item.manual_requested_order = order
            used.add(order)
        if item.pk not in changed_ids:
            changed.append(item)
            changed_ids.add(item.pk)

    if changed:
        PlanningItem.objects.bulk_update(changed, [
            'manual_requested_date', 'manual_requested_order',
            'manual_anchor_origin_date', 'expired_manual_requested_date',
        ])
    return sorted(changed_ids)


def _with_anchor_changes(result, user, changed_ids):
    """Expose lifecycle changes even when disposable placement stayed the same."""
    ids = sorted(set(changed_ids) | set(result.get('anchor_changed_ids', [])))
    result['anchor_changed_ids'] = ids
    result['changed_ids'] = sorted(set(result.get('changed_ids', [])) | set(ids))
    result['expired_anchor_ids'] = list(
        PlanningItem.objects.filter(
            user=user, pk__in=ids, manual_requested_date__isnull=True,
            expired_manual_requested_date__isnull=False,
        ).order_by('pk').values_list('pk', flat=True)
    )
    return result


@transaction.atomic
def daily_schedule(user, today=None):
    """Apply canonical daily maintenance and queue projection work.

    This boundary is intentionally safe for request paths: carrying/expiring
    anchors is canonical work, while every optimisation is deferred to the
    durable worker after this transaction commits.
    """
    today = user_local_date(user, explicit_date=today)
    priority._lock(user)
    state, _ = SchedulingState.objects.get_or_create(user=user)
    mode = 'global' if state.last_global_date != today else 'minimal'
    anchor_changed_ids = _reconcile_manual_anchors(user, today)

    result = request_reconcile(user, today, mode=mode)

    _with_anchor_changes(result, user, anchor_changed_ids)

    if mode == 'global':
        state.last_global_date = today
        state.save(update_fields=['last_global_date'])

    return result


@transaction.atomic
def reschedule(user, today=None):
    """Durably request an undoable global optimisation; never compute inline."""

    today = user_local_date(user, explicit_date=today)

    priority._lock(user)

    before = _snapshot(user)
    result = request_reconcile(user, today, mode='global')

    history.record_checkpoint(
        user,
        'SCHEDULE',
        before,
        _snapshot(user),
    )
    return result


def roll_forward_adaptive(user, today):
    """Compatibility entry point; all eligible work now uses the global engine."""
    result = schedule(user, today)
    return list(PlanningItem.objects.filter(user=user, pk__in=result['changed_ids']))


def _snapshot(
    user,
    *,
    include_dependencies=False,
):
    scheduler_state = (
        SchedulingState.objects
        .filter(user=user)
        .first()
    )

    state = {
        'priority': history.capture_priority(
            user,
            include_unpositioned=True,
        ),

        'leaf_siblings':
            history.capture_leaf_order(
                user
            ),

        'schedule': [
            {
                'id':
                    item.pk,

                'scheduled_date': (
                    item.scheduled_date.isoformat()
                    if item.scheduled_date
                    else None
                ),

                'execution_rank':
                    item.execution_rank,

                'manual_requested_date': (
                    item.manual_requested_date.isoformat()
                    if item.manual_requested_date
                    else None
                ),

                'manual_anchor_origin_date': (
                    item.manual_anchor_origin_date.isoformat()
                    if item.manual_anchor_origin_date else None
                ),

                'expired_manual_requested_date': (
                    item.expired_manual_requested_date.isoformat()
                    if item.expired_manual_requested_date else None
                ),

                'manual_requested_order':
                    item.manual_requested_order,

                'priority_restore_context':
                    item.priority_restore_context,
            }
            for item in (
                PlanningItem.objects
                .filter(user=user)
                .order_by('pk')
            )
        ],

        'scheduler_allocations': [
            {
                'item_id':
                    row.item_id,

                'percentage':
                    str(row.percentage),

                'scheduled_date':
                    row.scheduled_date.isoformat(),

                'execution_rank':
                    row.execution_rank,
            }
            for row in (
                SchedulerAllocation.objects
                .filter(item__user=user)
                .order_by(
                    'scheduled_date',
                    'execution_rank',
                    'id',
                )
            )
        ],

        'scheduler_runtime': (
            scheduler_state.scheduler_runtime
            if scheduler_state is not None
            else {}
        ),

        # This is the undoable user intent, not a historical revision number.
        # Restoring it always allocates a fresh revision so stale workers can
        # never publish after undo/redo.
        'scheduling_intent': {
            'pending': bool(
                scheduler_state
                and scheduler_state.scheduling_revision
                > scheduler_state.applied_scheduling_revision
            ),
            'mode': (
                scheduler_state.pending_scheduling_mode
                if scheduler_state is not None else 'minimal'
            ),
        },

        'overload': [
            {
                'date':
                    row.date.isoformat(),

                'allowed':
                    row.allowed,
            }
            for row in (
                SchedulingOverload.objects
                .filter(user=user)
                .order_by('date')
            )
        ],
    }

    if include_dependencies:
        state[
            'dependencies'
        ] = [
            {
                'prerequisite_id':
                    row.prerequisite_id,

                'dependent_id':
                    row.dependent_id,
            }
            for row in (
                PlanningDependency.objects
                .filter(
                    prerequisite__user=user,
                    dependent__user=user,
                )
                .order_by(
                    'prerequisite_id',
                    'dependent_id',
                )
            )
        ]

    return state


def _item(user, item_id, *, include_blocked=False):
    """Return an actionable item for a manual command.

    A dependency-blocked item is still a real canonical target.  Hiding it
    here used to turn a useful ``blocked_dependency`` response into the much
    less useful ``not_eligible`` response before the manual-command
    preflight had a chance to run.
    """
    item = _scheduler_eligible(
        user,
        include_blocked=include_blocked,
    ).filter(pk=item_id).first()
    if item is None:
        raise SchedulingConflict([{'item_id': item_id, 'code': 'not_eligible'}])
    return item


def _finish(user, before, today, baseline):
    # Projection conflicts and allocations are worker output.  The mutation
    # transaction records only canonical anchor intent and exits promptly.
    result = request_reconcile(user, today)
    history.record_checkpoint(user, 'SCHEDULE', before, _snapshot(user))
    # These are canonical intent changes made by the command itself.  Do not
    # overload ``changed_ids``: projected placement changes are unknown until
    # a worker publishes the requested revision.
    after = _snapshot(user)
    before_rows = {row['id']: row for row in before['schedule']}
    result['canonical_changed_ids'] = sorted(
        row['id'] for row in after['schedule']
        if any(
            row.get(key) != before_rows.get(row['id'], {}).get(key)
            for key in (
                'manual_requested_date', 'manual_anchor_origin_date',
                'expired_manual_requested_date', 'manual_requested_order',
            )
        )
    )
    return result


def _begin(user, today):
    priority._lock(user)
    before = _snapshot(user)
    # Commands need a canonical snapshot for history, not a speculative
    # schedule.  Calling the legacy optimiser here used to hold the command
    # transaction open and made an otherwise nonblocking mutation synchronous.
    return before, set()


@transaction.atomic
def move_to_date(user, item_id, day, *, allow_overload=False, today=None):
    today = user_local_date(user, explicit_date=today)
    before, baseline = _begin(user, today)
    item = _item(user, item_id, include_blocked=True)
    conflicts = _anchor_preflight_conflicts(user, [{
        'item_id': item.pk,
        'date': day,
        'allow_overload': allow_overload,
        # Timeline move has no dependency acknowledgement affordance.  Keep
        # the established safe default rather than silently anchoring blocked
        # work.
        'acknowledge_dependency_block': False,
    }], today=today)
    if not item.duration_category:
        conflicts.append(_conflict(item, 'duration_required'))
    if conflicts:
        raise SchedulingConflict(conflicts)
    if allow_overload:
        SchedulingOverload.objects.update_or_create(user=user, date=day, defaults={'allowed': True})
    # Explicit Timeline movement is canonical date intent, not merely a
    # disposable scheduler suggestion. The scheduler may reproduce
    # scheduled_date from this anchor, but cannot silently erase the intent.
    item.manual_requested_date = day
    item.manual_anchor_origin_date = day
    item.expired_manual_requested_date = None
    item.save(
        update_fields=[
            'manual_requested_date',
            'manual_anchor_origin_date',
            'expired_manual_requested_date',
        ]
    )
    # Existing conflicts on the manipulated item must not be swallowed.
    baseline = {pair for pair in baseline if pair[0] != item.pk}
    return _finish(user, before, today, baseline)


@transaction.atomic
def replace(user, replacement_id, displaced_id, *, allow_overload=False, today=None):
    today = user_local_date(user, explicit_date=today)
    before, baseline = _begin(user, today)
    replacement, displaced = (
        _item(user, replacement_id, include_blocked=True),
        _item(user, displaced_id, include_blocked=True),
    )
    # A published projection may not exist while the background worker is
    # processing a newer revision. A canonical manual commitment is already
    # authoritative and can supply the replacement date without waiting for
    # optimisation. Never invent a date when neither source exists.
    day = displaced.manual_requested_date or displaced.scheduled_date
    if replacement.pk == displaced.pk or day is None:
        raise SchedulingConflict([_conflict(displaced, 'invalid_replacement')])
    conflicts = _anchor_preflight_conflicts(user, [{
        'item_id': replacement.pk,
        'date': day,
        'allow_overload': allow_overload,
        'acknowledge_dependency_block': False,
    }], today=today)
    if not replacement.duration_category:
        conflicts.append(_conflict(replacement, 'duration_required'))
    # A non-overload replacement also commits the displaced item to the next
    # date immediately.  Validate that canonical consequence here; the
    # worker must never be responsible for accepting/rejecting a user edit.
    if not allow_overload:
        displaced_day = day + timedelta(days=1)
        code = _validate_date(displaced, displaced_day, today)
        if code:
            # The replacement occupies the displaced task's original slot.
            # Missing its deadline is therefore a capacity consequence, not
            # an attempted explicit after-deadline anchor.
            conflicts.append(_conflict(
                displaced,
                'no_capacity_before_deadline'
                if code == 'after_deadline' else code,
            ))
    if conflicts:
        raise SchedulingConflict(conflicts)
    if allow_overload:
        SchedulingOverload.objects.update_or_create(user=user, date=day, defaults={'allowed': True})
    # Replacement is date intent, not a global importance reorder. A
    # scheduler candidate can legitimately have no current priority position.
    replacement.manual_requested_date = day
    replacement.manual_anchor_origin_date = day
    replacement.expired_manual_requested_date = None
    replacement.save(update_fields=[
        'manual_requested_date',
        'manual_anchor_origin_date',
        'expired_manual_requested_date',
    ])
    # A non-overload replacement explicitly commits the displaced task to
    # the next day. Leaving it unanchored allows the optimizer to move it
    # arbitrarily and violates the user's accepted replacement intent.
    displaced.manual_requested_date = day if allow_overload else displaced_day
    displaced.manual_anchor_origin_date = day if allow_overload else displaced_day
    if not allow_overload:
        displaced.manual_requested_order = None
    displaced.save(update_fields=['manual_requested_date', 'manual_anchor_origin_date', 'manual_requested_order'])
    baseline = {pair for pair in baseline if pair[0] not in {replacement.pk, displaced.pk}}
    return _finish(user, before, today, baseline)


@transaction.atomic
def configure(user, *, day=None, overloaded=None, today=None):
    today = user_local_date(user, explicit_date=today)
    before, baseline = _begin(user, today)
    if day is not None:
        SchedulingOverload.objects.update_or_create(user=user, date=day, defaults={'allowed': overloaded})
    return _finish(user, before, today, baseline)


# ---------------------------------------------------------------------------
# Frozen ARC anchor/manual-intent commands
# ---------------------------------------------------------------------------

def _apply_anchor_intent(
    item: PlanningItem,
    day,
    *,
    order=None,
    change_deadline=False,
    change_release=False,
    allow_overload=False,
    order_only=False,
):
    """Apply canonical manual placement intent without scheduling.

    This is deliberately the single mutation primitive used by:
    - Timeline date anchors,
    - one-item Focus anchors,
    - staged/batched Focus anchors.

    The scheduler still exclusively owns scheduled_date/execution_rank.
    """

    from . import lifecycle

    item = lifecycle.active(item)

    if item.is_deleted or item.is_completed:
        raise ValidationError(
            "Only active unfinished work can be anchored."
        )

    if item.due_date and day > item.due_date:
        if not change_deadline:
            raise ValidationError({
                "anchor": (
                    "Anchor is after deadline; explicitly "
                    "extend the deadline or cancel."
                )
            })

        item.due_date = day

    if item.start_date and day < item.start_date:
        if not change_release:
            raise ValidationError({
                "anchor": (
                    "Anchor is before release; explicitly "
                    "move the release or cancel."
                )
            })

        item.start_date = day

    if order is not None and order < 1:
        raise ValidationError({
            "anchor":
                "Manual execution order must be positive."
        })

    if order_only and item.manual_requested_date != day:
        raise SchedulingConflict([{
            "item_id": item.pk,
            "code": "anchor_changed",
        }])

    item.manual_requested_date = day
    if not order_only:
        item.manual_anchor_origin_date = day
        item.expired_manual_requested_date = None
    item.manual_requested_order = order

    fields = [
        "manual_anchor_origin_date",
        "manual_requested_date",
        "manual_requested_order",
    ]
    if not order_only:
        fields.append("expired_manual_requested_date")

    if change_deadline:
        fields.append(
            "due_date"
        )

    if change_release:
        fields.append(
            "start_date"
        )

    item.save(
        update_fields=fields,
    )

    if allow_overload:
        SchedulingOverload.objects.update_or_create(
            user=item.user,
            date=day,
            defaults={
                "allowed": True,
            },
        )

    return item


def _anchor_preflight_conflicts(user, changes, *, today):
    """Return immediate, canonical conflicts for proposed manual anchors.

    This intentionally models only facts owned by canonical rows: release and
    deadline bounds, dependency blocking, and per-day category capacity.  It
    must remain cheap enough to run inside the short mutation transaction and
    must never call either scheduler implementation.
    """
    item_ids = {change['item_id'] for change in changes}
    items = {
        item.pk: item for item in _scheduler_eligible(
            user, include_blocked=True,
        ).filter(pk__in=item_ids)
    }
    conflicts = []
    for change in changes:
        item = items.get(change['item_id'])
        if item is None:
            conflicts.append({'item_id': change['item_id'], 'code': 'not_eligible'})
            continue
        code = _validate_date(item, change['date'], today)
        if code == 'before_start' and change.get('change_release'):
            code = None
        if code == 'after_deadline' and change.get('change_deadline'):
            code = None
        if code:
            conflicts.append(_conflict(item, code))
        # A batch may explicitly dissolve this item's incoming blocking
        # edges as part of the same atomic canonical command.  Do not reject
        # that command based on the pre-command graph.
        if (
            dependencies.is_blocked(item)
            and not change.get('dissolve_dependencies', False)
            and not change.get('acknowledge_dependency_block', False)
        ):
            conflicts.append(_conflict(item, 'blocked_dependency'))

    # Reuse the existing action-scoped capacity accounting so a same-date
    # reorder does not spuriously require an overload acknowledgement.
    for conflict in focus_capacity_conflicts(user, changes):
        change = next(row for row in changes if row['item_id'] == conflict['item_id'])
        if not change.get('allow_overload', False):
            conflicts.append({'item_id': conflict['item_id'], 'code': 'capacity_exceeded'})
    return conflicts


def _focus_queue_preflight(user, items, changes, expected_queue):
    """Validate explicit Focus slots without reading a stale projection.

    Automatic neighbours are worker output.  Only manual same-day slots are
    canonical and can therefore support an immediate order guarantee.
    """
    if any(change.get('order') is not None for change in changes):
        state = SchedulingState.objects.filter(user=user).only(
            'scheduler_flavour',
        ).first()
        # Legacy scheduling has no manual-order input.  Do not persist a
        # command that it cannot ever publish faithfully.
        if state is None or state.scheduler_flavour is None:
            return [
                {'item_id': change['item_id'],
                 'code': 'queue_order_unrepresentable'}
                for change in changes if change.get('order') is not None
            ]

    if expected_queue is None:
        return []

    prospective = {
        item.pk: (item.manual_requested_date, item.manual_requested_order)
        for item in _scheduler_eligible(user, include_blocked=True).filter(
            manual_requested_date__isnull=False,
        )
    }
    prospective.update({
        change['item_id']: (change['date'], change.get('order'))
        for change in changes
    })
    expected_by_date = {}
    for entry in expected_queue:
        expected_by_date.setdefault(entry['date'], []).append(entry['item_id'])

    for day, expected_ids in expected_by_date.items():
        # Ignore automatic entries: a later worker is allowed to place them.
        expected_explicit = [
            item_id for item_id in expected_ids
            if prospective.get(item_id, (None, None))[0] == day
            and prospective.get(item_id, (None, None))[1] is not None
        ]
        if not expected_explicit:
            continue
        actual_explicit = [
            item_id for item_id, (anchor_day, order) in sorted(
                prospective.items(),
                key=lambda row: (row[1][1] is None, row[1][1] or 0, row[0]),
            )
            if anchor_day == day and order is not None
        ]
        if actual_explicit != expected_explicit:
            affected = [
                change['item_id'] for change in changes
                if change['date'] == day
            ]
            return [
                {'item_id': item_id, 'code': 'queue_order_unrepresentable'}
                for item_id in affected
            ]
    return []


@transaction.atomic
def set_anchor(
    item: PlanningItem,
    day,
    *,
    order=None,
    change_deadline=False,
    change_release=False,
    allow_overload=False,
    acknowledge_dependency_block=False,
):
    """Set one explicit canonical placement intent and reconcile once."""

    priority._lock(item.user)
    today = user_local_date(item.user)
    conflicts = _anchor_preflight_conflicts(item.user, [{
        'item_id': item.pk, 'date': day, 'change_deadline': change_deadline,
        'change_release': change_release, 'allow_overload': allow_overload,
        'acknowledge_dependency_block': acknowledge_dependency_block,
    }], today=today)
    if conflicts:
        raise SchedulingConflict(conflicts)

    before = _snapshot(
        item.user,
    )

    item = _apply_anchor_intent(
        item,
        day,
        order=order,
        change_deadline=change_deadline,
        change_release=change_release,
        allow_overload=allow_overload,
    )

    result = request_reconcile(item.user)

    item.refresh_from_db()

    after = _snapshot(
        item.user,
    )

    history.record_checkpoint(
        item.user,
        "SCHEDULE",
        before,
        after,
    )

    return item


@transaction.atomic
def set_anchor_batch(
    user,
    changes,
    *,
    today=None,
    expected_queue=None,
):
    """Apply multiple Focus anchors then run the scheduler exactly once.

    The whole batch is one canonical user action and therefore one undo/redo
    checkpoint. No partial anchor batch survives a validation or scheduling
    failure.
    """

    today = user_local_date(user, explicit_date=today)

    if not changes:
        return {
            "changed_ids": [],
            "conflicts": [],
            "scheduler": {},
        }

    priority._lock(
        user,
    )

    item_ids = [
        change[
            "item_id"
        ]
        for change in changes
    ]

    if (
        len(item_ids)
        != len(set(item_ids))
    ):
        raise ValidationError({
            "changes":
                "A task may appear only once in one Focus anchor batch."
        })

    items = {
        item.pk: item
        for item in (
            _scheduler_eligible(
                user,
                include_blocked=True,
            )
            .filter(
                pk__in=item_ids,
            )
        )
    }

    missing = [
        item_id
        for item_id in item_ids
        if item_id not in items
    ]

    if missing:
        raise ValidationError({
            "item_id":
                "One or more planning items do not exist."
        })

    if expected_queue is not None:
        expected_ids = [entry["item_id"] for entry in expected_queue]
        owned_ids = set(PlanningItem.objects.for_user(user).filter(
            pk__in=expected_ids,
        ).values_list("pk", flat=True))
        if (
            len(set(expected_ids)) != len(expected_ids)
            or not set(item_ids).issubset(expected_ids)
            or set(expected_ids) != owned_ids
        ):
            raise ValidationError({"expected_queue": "Choose distinct owned tasks, including every changed task."})

    explicit_slots = [
        (
            change[
                "date"
            ],
            focus_bucket_key(
                items[
                    change[
                        "item_id"
                    ]
                ].duration_category,
                is_residual=
                    items[
                        change[
                            "item_id"
                        ]
                    ].is_residual,
            ),
            change[
                "order"
            ],
        )
        for change in changes
        if change.get(
            "order"
        ) is not None
    ]

    if (
        len(explicit_slots)
        != len(set(explicit_slots))
    ):
        raise SchedulingConflict([
            {
                "item_id":
                    change[
                        "item_id"
                    ],
                "code":
                    "anchor_order_taken",
            }
            for change in changes
            if change.get(
                "order"
            ) is not None
        ])

    changed_ids = set(
        item_ids
    )

    occupied = (
        _scheduler_eligible(
            user,
            include_blocked=True,
        )
        .filter(
            manual_requested_order__isnull=False,
        )
        .exclude(
            pk__in=changed_ids,
        )
        .values_list(
            "manual_requested_date",
            "manual_requested_order",
            "pk",
            "duration_category",
            "is_residual",
        )
    )

    occupied_by_slot = {
        (
            day,
            focus_bucket_key(
                duration_category,
                is_residual=is_residual,
            ),
            order,
        ): item_id
        for (
            day,
            order,
            item_id,
            duration_category,
            is_residual,
        ) in occupied
    }

    slot_conflicts = []

    for change in changes:
        order = change.get(
            "order"
        )

        if order is None:
            continue

        item = items[
            change[
                "item_id"
            ]
        ]

        slot = (
            change[
                "date"
            ],
            focus_bucket_key(
                item.duration_category,
                is_residual=
                    item.is_residual,
            ),
            order,
        )

        if slot in occupied_by_slot:
            slot_conflicts.append({
                "item_id":
                    change[
                        "item_id"
                    ],
                "code":
                    "anchor_order_taken",
                "blocking_item_id":
                    occupied_by_slot[
                        slot
                    ],
            })

    if slot_conflicts:
        raise SchedulingConflict(
            slot_conflicts
        )

    # Preserve the established conflict precedence: concrete occupied
    # manual slots are reported before speculative queue feasibility.
    # Both checks run before any canonical mutation.
    if expected_queue is not None:
        queue_conflicts = _focus_queue_preflight(
            user, items, changes, expected_queue,
        )
        if queue_conflicts:
            raise SchedulingConflict(queue_conflicts)

    captures_dependencies = any(
        change.get(
            "dissolve_dependencies",
            False,
        )
        for change in changes
    )

    before = _snapshot(
        user,
        include_dependencies=
            captures_dependencies,
    )

    preflight_conflicts = _anchor_preflight_conflicts(
        user, changes, today=today,
    )
    if preflight_conflicts:
        raise SchedulingConflict(preflight_conflicts)

    for change in changes:
        item = items[
            change[
                "item_id"
            ]
        ]

        if change.get(
            "dissolve_dependencies",
            False,
        ):
            dependencies.remove_blocking(
                item,
                finish=False,
            )

        _apply_anchor_intent(
            item,
            change[
                "date"
            ],
            order_only=change.get("order_only", False),
            order=change.get(
                "order"
            ),
            change_deadline=change.get(
                "change_deadline",
                False,
            ),
            change_release=change.get(
                "change_release",
                False,
            ),
            allow_overload=change.get(
                "allow_overload",
                False,
            ),
        )

    result = request_reconcile(user, today)

    # ``expected_queue`` guards the caller's edit basis above, but cannot be
    # checked against Focus here: this request only persists canonical
    # anchors and queues a revision.  The Focus projection remains the last
    # published one until the worker applies that revision.  Rejecting based
    # on that stale projection made valid Lock-In/Monk reorders fail in HTTP.

    after = _snapshot(
        user,
        include_dependencies=
            captures_dependencies,
    )

    history.record_checkpoint(
        user,
        "SCHEDULE",
        before,
        after,
    )

    previous = {
        row[
            "id"
        ]: row
        for row in before[
            "schedule"
        ]
    }

    result[
        "changed_ids"
    ] = [
        row[
            "id"
        ]
        for row in after[
            "schedule"
        ]
        if (
            previous.get(
                row[
                    "id"
                ]
            )
            != row
        )
    ]

    return result


anchor = set_anchor
set_manual_requested_date = set_anchor
request_date = set_anchor


@transaction.atomic
def remove_anchor(item: PlanningItem):
    """Explicitly return placement authority to automatic scheduling."""
    from . import lifecycle

    item = lifecycle.active(item)

    before = _snapshot(
        item.user,
    )
    item.manual_requested_date = None
    item.manual_anchor_origin_date = None
    item.manual_requested_order = None
    item.expired_manual_requested_date = None
    item.save(
        update_fields=[
            "manual_requested_date",
            "manual_anchor_origin_date",
            "manual_requested_order",
            "expired_manual_requested_date",
        ]
    )
    request_reconcile(item.user)

    item.refresh_from_db()

    after = _snapshot(
        item.user,
    )

    history.record_checkpoint(
        item.user,
        "SCHEDULE",
        before,
        after,
    )

    return item


unanchor = remove_anchor
clear_anchor = remove_anchor
clear_manual_requested_date = remove_anchor


def validate_anchor(item: PlanningItem, day):
    """Return canonical conflicts without mutating state."""
    conflicts = []
    if item.start_date and day < item.start_date:
        conflicts.append("before_release")
    if item.due_date and day > item.due_date:
        conflicts.append("after_deadline")
    return conflicts


@transaction.atomic
def reconcile_anchors(user, today=None):
    """Time reconciliation for expired explicit date intent."""
    today = user_local_date(user, explicit_date=today)
    changed = _reconcile_manual_anchors(user, today)
    result = request_reconcile(user, today)
    return _with_anchor_changes(result, user, changed)


# ---------------------------------------------------------------------------
# Frozen ARC splittable-work allocation bridge
# ---------------------------------------------------------------------------

_SPLITTABLE_VALUES = {
    value.value if hasattr(value, "value") else str(value)
    for value in SPLITTABLE_DURATION_CATEGORIES
}


def _allocation_count(category):
    """Session count is scheduler policy, not canonical task identity.

    This baseline merely guarantees genuine splitting for splittable classes;
    later arena algorithms are free to replace these proposal sizes.
    """
    if category == DurationCategory.OVER_16_HOURS:
        return 3
    return 2


def _reconcile_progress_allocations(user, today=None):
    """Rebuild disposable allocations from current canonical remaining work."""

    today = user_local_date(user, explicit_date=today)
    candidates = list(_scheduler_eligible(user))

    # Scheduler proposals are disposable by definition. A rerun may replace
    # every proposal without touching confirmed canonical progress history.
    SchedulerAllocation.objects.filter(item__user=user).delete()

    allocations = []

    for item in candidates:
        if item.scheduled_date is None or item.duration_category not in _SPLITTABLE_VALUES:
            continue

        remaining = Decimal("100") - Decimal(str(item.percent_completed))
        if remaining <= 0:
            continue

        count = _allocation_count(item.duration_category)
        base = (remaining / count).quantize(Decimal("0.01"))
        pieces = [base] * count
        pieces[-1] += remaining - sum(pieces)

        first_day = (
            item.scheduled_date
            or max(today, item.start_date or today)
        )

        for index, percentage in enumerate(pieces):
            if percentage <= 0:
                continue

            allocations.append(
                SchedulerAllocation(
                    item=item,
                    percentage=percentage,
                    scheduled_date=first_day + timedelta(days=index),
                    execution_rank=index + 1,
                )
            )

    if allocations:
        SchedulerAllocation.objects.bulk_create(allocations)




# Re-export progress lifecycle commands through scheduling because scheduling
# is the primary domain façade consumed by Timeline/Focus and contract tests.
from planning.services.progress import (  # noqa: E402
    complete_segment,
    reopen_segment,
    reconcile_progress,
)
from .focus_buckets import focus_bucket_key

complete_allocation = complete_segment
confirm_progress = complete_segment
record_completed_allocation = complete_segment
uncomplete_segment = reopen_segment
reverse_progress_segment = reopen_segment
