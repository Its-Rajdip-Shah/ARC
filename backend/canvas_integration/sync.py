"""Importing Canvas courses and assignments into the planning hierarchy.

FR-05: a course becomes a root PlanningItem and each of its assignments
becomes a child, matched on (canvas_object_type, canvas_object_id) so a
re-sync updates rows instead of duplicating them. Whatever the user has
changed locally is left alone: titles and dates come from Canvas, but the
priority position, completion flag and tags stay as the user left them.
Marks and weights are written only when Canvas supplies the inputs to
compute them; a later Canvas score replaces a stored mark.

FR-04: every attempt writes a SyncLog row, successful or not, which is what
lets the Connection screen report the last successful sync and the last error.
"""

from collections import defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from canvas_integration.client import CanvasClient, CanvasError
from canvas_integration.models import SyncLog, SyncStatus
from planning.models import AssignmentDetail, CanvasObjectType, ItemType, PlanningItem, Timezone
from planning.services import priority, lifecycle


def _as_date(value):
    """Canvas gives ISO timestamps, and omits them freely. Both are normal."""
    if not value:
        return None
    parsed = parse_datetime(value) if isinstance(value, str) else value
    if parsed is None:
        return None
    if timezone.is_aware(parsed):
        parsed = timezone.localtime(parsed)
    return parsed.date() if isinstance(parsed, datetime) else parsed


def _course_title(course):
    """Prefer the short code students recognise, fall back to the full name."""
    return course.get('course_code') or course.get('name') or 'Untitled Canvas course'


def _selected_course_ids(connection):
    """None means every course. Otherwise a set of Canvas id strings."""
    raw = connection.sync_course_ids
    if raw is None:
        return None
    return {str(course_id) for course_id in raw}


def _as_decimal(value):
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _group_point_totals(assignments):
    totals = defaultdict(lambda: Decimal('0'))
    for assignment in assignments:
        group_id = assignment.get('assignment_group_id')
        points = _as_decimal(assignment.get('points_possible'))
        if group_id is None or points is None or points <= 0:
            continue
        totals[group_id] += points
    return totals


def _weight_percent(assignment, groups_by_id, point_totals):
    """Share of the group's course weight, or None if Canvas omitted inputs."""
    group = groups_by_id.get(assignment.get('assignment_group_id'))
    if group is None:
        return None
    group_weight = _as_decimal(group.get('group_weight'))
    points = _as_decimal(assignment.get('points_possible'))
    total = point_totals.get(assignment.get('assignment_group_id'))
    if group_weight is None or points is None or not total:
        return None
    return (group_weight * points / total).quantize(Decimal('0.01'))


def _mark_percent(assignment, submissions_by_id):
    """Percentage mark from a self-submission, or None if Canvas omitted it."""
    submission = submissions_by_id.get(assignment.get('id'))
    if submission is None:
        return None
    score = _as_decimal(submission.get('score'))
    points = _as_decimal(assignment.get('points_possible'))
    if score is None or points is None or points <= 0:
        return None
    return (score * Decimal('100') / points).quantize(Decimal('0.01'))


def _term_window(course):
    term = course.get('term') if isinstance(course.get('term'), dict) else {}
    name = (term.get('name') or '').strip() or None
    return {
        'name': name,
        'start': _as_date(term.get('start_at')),
        'end': _as_date(term.get('end_at')),
    }


def _upsert_term_timezone(user, term):
    if not term['name'] or term['start'] is None or term['end'] is None:
        return
    if term['end'] < term['start']:
        return
    existing = Timezone.objects.filter(user=user, title=term['name']).first()
    if existing is None:
        Timezone.objects.create(
            user=user,
            title=term['name'],
            start_date=term['start'],
            end_date=term['end'],
        )
        return
    if (existing.start_date, existing.end_date) != (term['start'], term['end']):
        existing.start_date = term['start']
        existing.end_date = term['end']
        existing.save(update_fields=['start_date', 'end_date'])


def _import_course(user, client, course, counts):
    """Upsert one course and its assignments.

    The Canvas call happens before the transaction opens, so a slow Canvas
    never holds a write transaction open against Postgres.
    """
    assignments = client.assignments(course['id'])
    groups = client.assignment_groups(course['id'])
    submissions = client.submissions_self(course['id'])
    groups_by_id = {
        group['id']: group for group in groups if group.get('id') is not None
    }
    submissions_by_id = {
        row['assignment_id']: row
        for row in submissions
        if row.get('assignment_id') is not None
    }
    point_totals = _group_point_totals(assignments)

    term = _term_window(course)

    with transaction.atomic():
        priority._lock(user)
        root, created = PlanningItem.objects.update_or_create(
            user=user,
            canvas_object_type=CanvasObjectType.COURSE,
            canvas_object_id=str(course['id']),
            defaults={
                'item_type': ItemType.GOAL,
                'title': _course_title(course),
                'parent': None,
                'start_date': term['start'],
                'due_date': term['end'],
            },
        )
        _upsert_term_timezone(user, term)
        counts['courses_created' if created else 'courses_updated'] += 1

        for assignment in assignments:
            if assignment.get('id') is None:
                continue
            _import_assignment(
                user,
                root,
                assignment,
                counts,
                weight=_weight_percent(assignment, groups_by_id, point_totals),
                mark=_mark_percent(assignment, submissions_by_id),
            )


def _import_assignment(user, root, assignment, counts, weight=None, mark=None):
    assignment_id = str(assignment['id'])
    due_date = _as_date(assignment.get('due_at'))

    item, created = PlanningItem.objects.update_or_create(
        user=user,
        canvas_object_type=CanvasObjectType.ASSIGNMENT,
        canvas_object_id=assignment_id,
        defaults={
            'item_type': ItemType.ASSIGNMENT,
            'title': assignment.get('name') or 'Untitled Canvas assignment',
            'description': assignment.get('description') or None,
            'parent': root,
            'due_date': due_date,
            'start_date': _as_date(assignment.get('unlock_at')),
        },
    )

    detail_defaults = {'submission_url': assignment.get('html_url') or None}
    if weight is not None:
        detail_defaults['weight_percent'] = weight
    if mark is not None:
        detail_defaults['mark_achieved'] = mark
    AssignmentDetail.objects.update_or_create(
        planning_item=item,
        defaults=detail_defaults,
    )

    if not item.is_completed:
        lifecycle.reopen_ancestors(item)

    counts['assignments_created' if created else 'assignments_updated'] += 1


def run_sync(connection, client=None):
    """Pull the user's Canvas courses and assignments, logging the attempt.

    Returns the SyncLog row. Failures are recorded rather than raised, because
    an unreachable Canvas is an expected state the Connection screen has to be
    able to display.
    """
    user = connection.user
    # Opened as FAILED so an attempt that dies mid-flight is not recorded as a
    # success (FR-04).
    log = SyncLog.objects.create(user=user, status=SyncStatus.FAILED)
    client = client or CanvasClient(
        settings.CANVAS_BASE_URL, connection.api_token_encrypted
    )

    counts = {
        'courses_created': 0,
        'courses_updated': 0,
        'assignments_created': 0,
        'assignments_updated': 0,
    }

    try:
        profile = client.whoami()
        courses = client.courses()
        allow = _selected_course_ids(connection)
        for course in courses:
            if course.get('id') is None:
                continue
            if allow is not None and str(course['id']) not in allow:
                continue
            _import_course(user, client, course, counts)
    except CanvasError as exc:
        log.completed_at = timezone.now()
        log.error_message = str(exc)
        log.save(update_fields=['completed_at', 'error_message'])
        return log
    except Exception as exc:
        log.completed_at = timezone.now()
        log.error_message = str(exc)
        log.save(update_fields=['completed_at', 'error_message'])
        return log

    log.status = SyncStatus.SUCCESS
    log.completed_at = timezone.now()
    log.error_message = None

    try:
        lifecycle.finish(user)
    except Exception as exc:
        log.error_message = f'Imported; scheduler failed: {exc}'

    log.save(update_fields=['status', 'completed_at', 'error_message'])

    connection.canvas_user_id = str(profile.get('id') or '') or None
    connection.last_sync_at = log.completed_at
    connection.save(update_fields=['canvas_user_id', 'last_sync_at'])

    log.counts = counts
    return log
