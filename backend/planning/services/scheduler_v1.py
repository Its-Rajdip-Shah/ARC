"""ARC <-> arc-scheduler V1 integration boundary.

This module is deliberately separate from planning.services.scheduling.

ARC owns canonical planning truth.  The external scheduler receives an
immutable SchedulerInputV1 and returns disposable proposal state.  Nothing in
this module gives the scheduler authority to rewrite hierarchy, dependency,
priority, release/deadline, manual intent, or confirmed progress.

Phase 2B intentionally does not replace the legacy public schedule() entry
point yet.  That cutover requires an explicit ARC flavour-selection policy and
a decision about compatibility with the legacy minimal/global modes.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone

from arc_scheduler import (
    SchedulerDependencyInputV1,
    SchedulerEngineV1,
    SchedulerFlavourV1,
    SchedulerInputV1,
    SchedulerOutputV1,
    SchedulerTaskInputV1,
)
from arc_scheduler.contracts import (
    ENGINE_VERSION,
    INPUT_CONTRACT_VERSION,
    OUTPUT_CONTRACT_VERSION,
)

from planning.models import (
    PlanningDependency,
    PlanningItem,
    SchedulerAllocation,
    SchedulingOverload,
    SPLITTABLE_DURATION_CATEGORIES,
)


class SchedulerV1IntegrationError(ValueError):
    """The ARC/V1 authority boundary rejected an invalid mapping or output."""


def _structural_candidates(user):
    """Unfinished actionable execution-frontier work before dependency blocking.

    This deliberately differs from scheduling._scheduler_eligible():

    * a decomposed item with unfinished visible children remains structural;
    * completed/deleted work is absent;
    * an unfinished dependency does NOT immediately remove a task when its
      prerequisite is itself schedulable.

    The V1 engine needs both sides of A -> B so it can schedule B strictly
    after A completes rather than treating B as permanently invisible.
    """

    unfinished_children = PlanningItem.objects.visible().filter(
        user=user,
        parent_id=OuterRef("pk"),
        is_completed=False,
    )

    return (
        PlanningItem.objects.for_user(user)
        .actionable()
        .filter(
            is_completed=False,
            is_deleted=False,
        )
        .annotate(
            has_unfinished_children=Exists(unfinished_children),
            is_residual=Exists(
                PlanningItem.objects.visible().filter(
                    user=user,
                    parent_id=OuterRef("pk"),
                )
            ),
        )
        .filter(has_unfinished_children=False)
        .distinct()
    )


def _candidate_order(item):
    """Deterministic ARC ordering without manufacturing canonical priority."""

    positioned = item.priority_position is not None

    return (
        0 if positioned else 1,
        item.priority_position if positioned else 0,
        item.due_date or timezone.datetime.max.date(),
        item.start_date or timezone.datetime.max.date(),
        item.pk,
    )


def _schedulable_frontier(user):
    """Return candidates whose unresolved prerequisites can also be planned.

    Completed or deleted prerequisites do not block execution under the
    authoritative ARC dependency semantics.

    If an unfinished prerequisite is not itself algorithm-visible -- for
    example a structural/decomposed item -- its dependent must remain outside
    the scheduler input.  The fixed point also propagates that exclusion down
    dependency chains.
    """

    candidates = list(_structural_candidates(user))
    by_id = {item.pk: item for item in candidates}

    retained = set(by_id)

    unresolved_edges = list(
        PlanningDependency.objects.filter(
            dependent_id__in=retained,
            prerequisite__is_completed=False,
            prerequisite__is_deleted=False,
        ).values_list(
            "prerequisite_id",
            "dependent_id",
        )
    )

    changed = True

    while changed:
        changed = False

        for prerequisite_id, dependent_id in unresolved_edges:
            if dependent_id not in retained:
                continue

            if prerequisite_id not in retained:
                retained.remove(dependent_id)
                changed = True

    items = sorted(
        (
            by_id[item_id]
            for item_id in retained
        ),
        key=_candidate_order,
    )

    dependencies = tuple(
        sorted(
            (
                prerequisite_id,
                dependent_id,
            )
            for prerequisite_id, dependent_id in unresolved_edges
            if (
                prerequisite_id in retained
                and dependent_id in retained
            )
        )
    )

    return items, dependencies


def _remaining_fraction(item):
    completed = Decimal(str(item.percent_completed))

    remaining_percent = max(
        Decimal("0"),
        Decimal("100") - completed,
    )

    return remaining_percent / Decimal("100")


def build_scheduler_input(
    user,
    *,
    flavour,
    today=None,
) -> SchedulerInputV1:
    """Translate authoritative ARC canonical state into SchedulerInputV1.

    This function is read-only with respect to ARC state.

    ``flavour`` is intentionally mandatory.  ARC does not yet have a
    canonical user flavour preference, and the integration layer must not
    silently invent one.
    """

    today = today or timezone.localdate()
    flavour = SchedulerFlavourV1(flavour)

    items, dependency_pairs = _schedulable_frontier(user)

    # Import lazily so this bridge can later be called by scheduling.py
    # without introducing a module-import cycle.
    from planning.services.scheduling import capacities

    overload_dates = frozenset(
        SchedulingOverload.objects.filter(
            user=user,
            allowed=True,
        ).values_list(
            "date",
            flat=True,
        )
    )

    tasks = tuple(
        SchedulerTaskInputV1(
            item_id=item.pk,
            duration_category=str(item.duration_category),
            priority_position=item.priority_position,
            release_date=item.start_date,
            due_date=item.due_date,
            anchor_date=(
                item.manual_requested_date
                if (
                    item.manual_requested_date is not None
                    and item.manual_requested_date >= today
                )
                else None
            ),
            percent_completed=Decimal(str(item.percent_completed)),
            remaining_fraction=_remaining_fraction(item),
            is_residual=bool(item.is_residual),
            existing_scheduled_date=item.scheduled_date,
            # ponytail: pinned arc-scheduler@0adf317 has no anchor_order.
            # Keep manual_requested_order on PlanningItem; forward it when
            # the engine contract grows the field.
        )
        for item in items
    )

    dependencies = tuple(
        SchedulerDependencyInputV1(
            prerequisite_id=prerequisite_id,
            dependent_id=dependent_id,
        )
        for prerequisite_id, dependent_id in dependency_pairs
    )

    return SchedulerInputV1(
        today=today,
        flavour=flavour,
        tasks=tasks,
        dependencies=dependencies,
        capacity_by_duration={
            str(category): limit
            for category, limit in capacities(user).items()
        },
        overload_dates=overload_dates,

        # ARC currently has duration categories, not canonical exact-hour
        # estimates.  V1 therefore uses its frozen duration-category priors.
        explicit_total_hours={},
    )


def run_scheduler_v1(
    user,
    *,
    flavour,
    today=None,
    engine=None,
):
    """Build an immutable request and execute the frozen V1 engine.

    No scheduler output is persisted by this function.
    """

    request = build_scheduler_input(
        user,
        flavour=flavour,
        today=today,
    )

    engine = engine or SchedulerEngineV1()
    output = engine.run(request)

    return request, output


def _validate_output_boundary(
    request: SchedulerInputV1,
    output: SchedulerOutputV1,
):
    """Reject output that does not match the exact request/version boundary."""

    metadata = output.metadata

    if metadata.engine_version != ENGINE_VERSION:
        raise SchedulerV1IntegrationError(
            "Scheduler output engine version does not match installed engine."
        )

    if metadata.input_contract_version != INPUT_CONTRACT_VERSION:
        raise SchedulerV1IntegrationError(
            "Scheduler output input-contract version mismatch."
        )

    if metadata.output_contract_version != OUTPUT_CONTRACT_VERSION:
        raise SchedulerV1IntegrationError(
            "Scheduler output contract version mismatch."
        )

    if metadata.flavour != request.flavour:
        raise SchedulerV1IntegrationError(
            "Scheduler output flavour does not match request flavour."
        )

    task_by_id = {
        task.item_id: task
        for task in request.tasks
    }

    allocation_keys = set()
    percentage_by_item = defaultdict(lambda: Decimal("0"))

    for allocation in output.allocations:
        if allocation.item_id not in task_by_id:
            raise SchedulerV1IntegrationError(
                f"Scheduler returned unknown item {allocation.item_id}."
            )

        if allocation.scheduled_date < request.today:
            raise SchedulerV1IntegrationError(
                f"Scheduler returned past allocation for {allocation.item_id}."
            )

        key = (
            allocation.item_id,
            allocation.scheduled_date,
        )

        if key in allocation_keys:
            raise SchedulerV1IntegrationError(
                f"Duplicate item/day scheduler allocation: {key}."
            )

        allocation_keys.add(key)
        percentage_by_item[allocation.item_id] += allocation.percentage

    for task in request.tasks:
        expected = (
            task.remaining_fraction
            * Decimal("100")
        )

        actual = percentage_by_item[task.item_id]

        if actual != expected:
            raise SchedulerV1IntegrationError(
                "Scheduler output does not conserve remaining work for "
                f"item {task.item_id}: expected {expected}, got {actual}."
            )


@transaction.atomic
def apply_scheduler_output(
    user,
    request: SchedulerInputV1,
    output: SchedulerOutputV1,
):
    """Persist only disposable scheduler-owned V1 output.

    Canonical ARC facts are never written here.

    PlanningItem.scheduled_date and execution_rank are disposable summary
    projections.  SchedulerAllocation contains future splittable proposals.
    Confirmed ProgressSegment rows are intentionally untouched.
    """

    _validate_output_boundary(
        request,
        output,
    )

    request_ids = {
        task.item_id
        for task in request.tasks
    }

    owned_ids = set(
        PlanningItem.objects.filter(
            user=user,
            pk__in=request_ids,
        ).values_list(
            "pk",
            flat=True,
        )
    )

    if owned_ids != request_ids:
        missing = sorted(request_ids - owned_ids)

        raise SchedulerV1IntegrationError(
            "Scheduler request contains items not owned by this user: "
            f"{missing}"
        )

    task_by_id = {
        task.item_id: task
        for task in request.tasks
    }

    allocations_by_item = defaultdict(list)

    for allocation in output.allocations:
        allocations_by_item[
            allocation.item_id
        ].append(allocation)

    # Snapshot disposable summary state solely for changed_ids reporting.
    before = {
        item.pk: (
            item.scheduled_date,
            item.execution_rank,
        )
        for item in PlanningItem.objects.filter(user=user)
    }

    # Scheduler proposal state is disposable.  A complete V1 result replaces
    # the user's previous disposable projection atomically.
    PlanningItem.objects.filter(user=user).update(
        scheduled_date=None,
        execution_rank=None,
    )

    SchedulerAllocation.objects.filter(
        item__user=user,
    ).delete()

    changed_items = []
    proposal_rows = []

    splittable = {
        str(category)
        for category in SPLITTABLE_DURATION_CATEGORIES
    }

    for item_id in sorted(request_ids):
        task = task_by_id[item_id]

        rows = sorted(
            allocations_by_item[item_id],
            key=lambda row: (
                row.scheduled_date,
                row.execution_rank,
            ),
        )

        if not rows:
            continue

        first = rows[0]

        item = PlanningItem.objects.get(
            user=user,
            pk=item_id,
        )

        item.scheduled_date = first.scheduled_date
        item.execution_rank = first.execution_rank
        changed_items.append(item)

        # Residual parent work is treated by the frozen engine as an atomic
        # UNDER_20_MINUTES unit.  Only genuine splittable ARC work receives
        # confirmable SchedulerAllocation proposal rows.
        if (
            not task.is_residual
            and task.duration_category in splittable
        ):
            for row in rows:
                proposal_rows.append(
                    SchedulerAllocation(
                        item=item,
                        percentage=row.percentage,
                        scheduled_date=row.scheduled_date,
                        execution_rank=row.execution_rank,
                    )
                )

    if changed_items:
        PlanningItem.objects.bulk_update(
            changed_items,
            [
                "scheduled_date",
                "execution_rank",
            ],
        )

    if proposal_rows:
        SchedulerAllocation.objects.bulk_create(
            proposal_rows
        )

    after = {
        item.pk: (
            item.scheduled_date,
            item.execution_rank,
        )
        for item in PlanningItem.objects.filter(user=user)
    }

    changed_ids = sorted(
        item_id
        for item_id in set(before) | set(after)
        if before.get(item_id) != after.get(item_id)
    )

    return {
        "changed_ids": changed_ids,
        "allocation_count": len(proposal_rows),
        "engine_version": output.metadata.engine_version,
        "input_contract_version": output.metadata.input_contract_version,
        "output_contract_version": output.metadata.output_contract_version,
        "flavour": output.metadata.flavour.value,
    }


@transaction.atomic
def run_and_apply_scheduler_v1(
    user,
    *,
    flavour,
    today=None,
    engine=None,
):
    """Explicit V1 execution path used for integration/certification.

    This is intentionally not wired into legacy schedule() yet.
    """

    request, output = run_scheduler_v1(
        user,
        flavour=flavour,
        today=today,
        engine=engine,
    )

    persistence = apply_scheduler_output(
        user,
        request,
        output,
    )

    return request, output, persistence
