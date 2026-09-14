"""Adaptive scheduling for tasks with no real deadline (FR-11).

A task without a due_date is not a commitment to anyone, so ARC picks a
provisional scheduled_date for it. When that date passes with the task still
unfinished, the date moves forward instead of the task turning overdue; only
a genuine deadline in due_date can do that (FR-12).

Pushing one task forward can land it on top of the next one under the same
root, so the later tasks shuffle along too, which is what preserves the order
the user set in the Priority View.

This module writes scheduled_date and nothing else. due_date is never touched,
and there is a regression test asserting exactly that.
"""

from datetime import timedelta

from django.db import transaction

from planning.models import PlanningItem
from planning.queries import parent_map, root_of


def _adaptive_items(user):
    """Active, actionable, no real deadline: the items ARC gets to schedule."""
    return (
        PlanningItem.objects.for_user(user)
        .actionable()
        .active()
        .adaptive()
        .order_by('priority_position', 'id')
    )


@transaction.atomic
def roll_forward_adaptive(user, today):
    """Bring every adaptive task up to date, then de-collide within each root.

    Idempotent: once it has run for a given `today`, running it again changes
    nothing, so it is safe to drive from both a daily command and a lazy
    catch-up on the first timeline read.
    """
    items = list(_adaptive_items(user))
    if not items:
        return []

    original = {item.pk: item.scheduled_date for item in items}

    for item in items:
        if item.scheduled_date is None:
            # FR-11 expects every adaptive task to carry a provisional date.
            item.scheduled_date = today
        elif item.scheduled_date < today:
            # "Move forward by one day" is the daily case. Taking the later of
            # the two keeps the result sane if nobody ran the sweep for a
            # week, rather than dragging the task forward one day per run.
            item.scheduled_date = max(item.scheduled_date + timedelta(days=1), today)

    # Ordering inside a root is the priority order; items without a position
    # sort last.
    parents = parent_map(user.pk)
    grouped = {}
    for item in items:
        grouped.setdefault(root_of(parents, item.pk), []).append(item)

    for group in grouped.values():
        group.sort(key=lambda i: (i.priority_position is None, i.priority_position, i.pk))
        previous = None
        for item in group:
            if previous is not None and item.scheduled_date <= previous:
                item.scheduled_date = previous + timedelta(days=1)
            previous = item.scheduled_date

    changed = [item for item in items if item.scheduled_date != original[item.pk]]
    if changed:
        PlanningItem.objects.bulk_update(changed, ['scheduled_date'])
    return changed
