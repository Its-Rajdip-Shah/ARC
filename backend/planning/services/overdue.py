"""Derived overdue classification without mutating canonical task facts.

Only fixed-date work can be overdue. Work without a due_date
rolls forward under FR-11 and can never appear here; that is the distinction
the Overdue View exists to make.
"""

from planning.models import RECENT_OVERDUE_DAYS, PlanningItem
from planning.queries import ancestor_chain, parent_map


def _overdue_items(user, today):
    return (
        PlanningItem.objects.for_user(user)
        .overdue(today)
        .select_related('assignment_detail')
        .order_by('due_date', 'id')
    )


def classify(user, today):
    """Split the user's overdue work into Recent and Backlog.

    Each entry carries the hierarchy path the wireframe shows, so the user can
    tell which course and assignment the stray task belongs to.
    """
    items = list(_overdue_items(user, today))
    if not items:
        return {'recent': [], 'backlog': []}

    parents = parent_map(user.pk)
    titles = dict(PlanningItem.objects.visible().filter(user=user).values_list('id', 'title'))

    result = {'recent': [], 'backlog': []}
    for item in items:
        days = (today - item.due_date).days
        path = [titles[i] for i in reversed(ancestor_chain(parents, item.pk))]
        entry = {
            'item': item,
            'days_overdue': days,
            'hierarchy_path': path + [item.title],
        }
        bucket = 'recent' if days <= RECENT_OVERDUE_DAYS else 'backlog'
        result[bucket].append(entry)

    return result


def is_overdue(item, today):
    """Whether one item counts as overdue, without touching the database."""
    return bool(
        item.is_actionable
        and not item.is_completed
        and item.due_date
        and item.due_date < today
    )


def is_active_carried_anchor(item, today):
    """Whether a missed anchor is still an active three-day commitment."""
    origin = item.manual_anchor_origin_date
    if not origin:
        return False
    age = (today - origin).days
    return bool(
        item.is_actionable
        and not item.is_completed
        and not item.is_deleted
        and item.manual_requested_date
        and 1 <= age <= 3
    )


def is_expired_anchor_history(item, today=None):
    """Whether a task retains (or has reached) released anchor history.

    The daily reconciliation persists ``expired_manual_requested_date``.  A
    read projection also treats a stale pre-reconciliation anchor at day four
    as expired, so presentation never mistakes it for a live commitment.
    """
    reached_expiry = bool(
        today
        and item.manual_anchor_origin_date
        and (today - item.manual_anchor_origin_date).days >= 4
    )
    return bool(
        item.is_actionable
        and not item.is_completed
        and not item.is_deleted
        and (item.expired_manual_requested_date or reached_expiry)
    )


def classify_v3(user, today):
    """Return the approved Deadline/Anchor Overdue presentation buckets.

    Deadline overdue has precedence.  Anchor overdue deliberately includes
    both carried active commitments and released historical misses; only the
    former remains an input constraint for scheduling.
    """
    items = list(
        PlanningItem.objects.for_user(user)
        .actionable()
        .active()
        .select_related('assignment_detail')
        .order_by('id')
    )
    if not items:
        return {'deadline_overdue': [], 'anchor_overdue': []}

    parents = parent_map(user.pk)
    titles = dict(PlanningItem.objects.visible().filter(user=user).values_list('id', 'title'))

    def entry(item, *, anchor_kind=None, missed_anchor_date=None):
        return {
            'item': item,
            'days_overdue': (today - item.due_date).days if item.due_date else None,
            'anchor_kind': anchor_kind,
            'missed_anchor_date': missed_anchor_date,
            'hierarchy_path': [titles[i] for i in reversed(ancestor_chain(parents, item.pk))] + [item.title],
        }

    deadlines = [entry(item) for item in items if is_overdue(item, today)]
    deadline_ids = {row['item'].pk for row in deadlines}
    anchors = []
    for item in items:
        if item.pk in deadline_ids:
            continue
        if is_active_carried_anchor(item, today):
            anchors.append(entry(
                item,
                anchor_kind='active_carried',
                missed_anchor_date=item.manual_anchor_origin_date,
            ))
        elif is_expired_anchor_history(item, today):
            anchors.append(entry(
                item,
                anchor_kind='expired_history',
                missed_anchor_date=item.expired_manual_requested_date or item.manual_anchor_origin_date,
            ))

    deadlines.sort(key=lambda row: (row['item'].due_date, row['item'].pk))
    anchors.sort(key=lambda row: (
        0 if row['anchor_kind'] == 'active_carried' else 1,
        row['missed_anchor_date'],
        row['item'].pk,
    ))
    return {'deadline_overdue': deadlines, 'anchor_overdue': anchors}


def effective_due_date(item, today):
    """Release a missed deadline only for automatic recovery placement.

    Candidate eligibility (frontier, dependencies, release dates) remains the
    caller's responsibility. This projection never changes canonical facts or
    overdue classification. Active explicit anchors retain the canonical bound.
    """
    active_anchor = item.manual_requested_date and item.manual_requested_date >= today
    if not item.is_deleted and not active_anchor and is_overdue(item, today):
        return None
    return item.due_date
