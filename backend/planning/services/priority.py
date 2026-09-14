"""The single global task priority order (FR-09).

Every active, actionable task of a user holds exactly one position, numbered
densely from 1, and no two share a number. Completed and non-actionable items
hold NULL. Keeping that invariant is entirely this module's job; the database
backs it up with uniq_user_priority_position.

That constraint is DEFERRABLE INITIALLY DEFERRED, which is what makes the
renumbering below straightforward: a reorder walks positions through states
that contain duplicates, and only the committed result has to be unique. An
immediate constraint would force each write to dodge its neighbour, usually by
shifting everything into a temporary offset range and back again.
"""

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max

from planning.models import PlanningItem


def ordered(user):
    """The user's positioned active tasks, highest priority first."""
    return (
        PlanningItem.objects.for_user(user)
        .actionable()
        .active()
        .exclude(priority_position=None)
        .order_by('priority_position', 'id')
    )


def _lock(user):
    """Serialise concurrent position writes for one user.

    Two simultaneous creates would otherwise read the same MAX and claim the
    same tail position.
    """
    get_user_model().objects.select_for_update().get(pk=user.pk)


@transaction.atomic
def assign_initial_position(task):
    """Place a newly active task at the end of the order.

    Does nothing for goals, completed items, or a task that already holds a
    position, so it is safe to call from a save path.
    """
    if not task.is_actionable or task.is_completed or task.priority_position is not None:
        return task.priority_position

    _lock(task.user)
    highest = (
        PlanningItem.objects.filter(user_id=task.user_id)
        .aggregate(Max('priority_position'))['priority_position__max']
    )
    task.priority_position = (highest or 0) + 1
    task.save(update_fields=['priority_position'])
    return task.priority_position


@transaction.atomic
def renumber(user):
    """Rewrite the order as a dense 1..n, preserving relative sequence."""
    items = list(ordered(user))
    changed = []
    for position, item in enumerate(items, start=1):
        if item.priority_position != position:
            item.priority_position = position
            changed.append(item)
    if changed:
        PlanningItem.objects.bulk_update(changed, ['priority_position'])
    return items


@transaction.atomic
def reorder(user, item_id, new_position):
    """Move one task to a new row and close the gap it left behind.

    Positions outside the current range are clamped rather than rejected, so
    a drag past either end of the Priority View behaves the way it looks.
    """
    _lock(user)
    items = list(ordered(user).select_for_update())

    index = next((i for i, item in enumerate(items) if item.pk == item_id), None)
    if index is None:
        raise ValidationError('That task is not in the priority order.')

    moved = items.pop(index)
    target = max(1, min(int(new_position), len(items) + 1))
    items.insert(target - 1, moved)

    changed = []
    for position, item in enumerate(items, start=1):
        if item.priority_position != position:
            item.priority_position = position
            changed.append(item)
    if changed:
        # Passes through duplicate positions; legal only because the unique
        # constraint is deferred to COMMIT.
        PlanningItem.objects.bulk_update(changed, ['priority_position'])

    return items


@transaction.atomic
def release_position(task):
    """Drop a task out of the order, on completion or before deletion."""
    if task.priority_position is None:
        return
    task.priority_position = None
    task.save(update_fields=['priority_position'])
    renumber(task.user)


@transaction.atomic
def release_positions(user, item_ids):
    """release_position for a whole subtree, in two statements."""
    PlanningItem.objects.filter(user=user, pk__in=item_ids).exclude(
        priority_position=None
    ).update(priority_position=None)
    renumber(user)


@transaction.atomic
def restore_position(task):
    """Return a re-opened task to the order, at the end."""
    if task.priority_position is not None:
        return task.priority_position
    return assign_initial_position(task)
