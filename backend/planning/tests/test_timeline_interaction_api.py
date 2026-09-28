from datetime import timedelta

import pytest

from planning.models import (
    DurationCategory,
    PlanningItemTag,
    SchedulingOverload,
    Tag,
)
from planning.services import dependencies

pytestmark = pytest.mark.django_db


def test_timeline_exposes_search_and_anchor_fields(
    api_for,
    user,
    make_item,
    today,
):
    item = make_item(
        user,
        'Searchable task',
        description='Needle in description',
        manual_requested_date=today + timedelta(days=1),
    )

    tag = Tag.objects.create(
        user=user,
        name='NeedleTag',
    )

    PlanningItemTag.objects.create(
        planning_item=item,
        tag=tag,
    )

    response = api_for(user).get(
        '/api/planning/timeline/',
        {
            'from': today.isoformat(),
            'to': (
                today + timedelta(days=7)
            ).isoformat(),
        },
    )

    assert response.status_code == 200

    rows = [
        row
        for group in response.json()['groups']
        for row in group['items']
    ]

    row = next(
        row
        for row in rows
        if row['id'] == item.pk
    )

    assert row['description'] == 'Needle in description'
    assert row['tags'] == [
        {
            'id': tag.pk,
            'name': 'NeedleTag',
        },
    ]

    assert (
        row['manual_requested_date']
        == (
            today + timedelta(days=1)
        ).isoformat()
    )


def test_anchor_after_deadline_requires_explicit_decision(
    api_for,
    user,
    make_item,
    today,
):
    due = today + timedelta(days=2)
    target = due + timedelta(days=3)

    item = make_item(
        user,
        'Task',
        due_date=due,
    )

    response = api_for(user).post(
        '/api/planning/timeline/anchor/',
        {
            'item_id': item.pk,
            'date': target.isoformat(),
        },
        format='json',
    )

    assert response.status_code == 409

    assert response.json()['conflicts'] == [
        {
            'item_id': item.pk,
            'code': 'after_deadline',
        },
    ]

    response = api_for(user).post(
        '/api/planning/timeline/anchor/',
        {
            'item_id': item.pk,
            'date': target.isoformat(),
            'change_deadline': True,
        },
        format='json',
    )

    assert response.status_code == 200

    item.refresh_from_db()

    assert item.due_date == target
    assert item.manual_requested_date == target


def test_dependency_anchor_requires_acknowledgement(
    api_for,
    user,
    make_item,
    today,
):
    prerequisite = make_item(
        user,
        'Prerequisite',
    )

    dependent = make_item(
        user,
        'Dependent',
    )

    dependencies.add(
        prerequisite,
        dependent,
    )

    target = today + timedelta(days=3)

    response = api_for(user).post(
        '/api/planning/timeline/anchor/',
        {
            'item_id': dependent.pk,
            'date': target.isoformat(),
        },
        format='json',
    )

    assert response.status_code == 409

    assert any(
        row['code'] == 'blocked_dependency'
        for row in response.json()['conflicts']
    )

    response = api_for(user).post(
        '/api/planning/timeline/anchor/',
        {
            'item_id': dependent.pk,
            'date': target.isoformat(),
            'acknowledge_dependency_block': True,
        },
        format='json',
    )

    assert response.status_code == 200

    dependent.refresh_from_db()

    assert dependent.manual_requested_date == target


def test_anchor_can_be_removed(
    api_for,
    user,
    make_item,
    today,
):
    item = make_item(
        user,
        'Anchored',
        manual_requested_date=(
            today + timedelta(days=2)
        ),
    )

    response = api_for(user).post(
        '/api/planning/timeline/anchor/',
        {
            'item_id': item.pk,
            'remove': True,
        },
        format='json',
    )

    assert response.status_code == 200

    item.refresh_from_db()

    assert item.manual_requested_date is None


def test_timeline_exposes_global_allowed_overload_dates(
    api_for,
    user,
    today,
):
    inside = today + timedelta(days=2)
    outside = today + timedelta(days=60)

    SchedulingOverload.objects.create(
        user=user,
        date=inside,
        allowed=True,
    )

    SchedulingOverload.objects.create(
        user=user,
        date=outside,
        allowed=True,
    )

    response = api_for(user).get(
        '/api/planning/timeline/',
        {
            'from': today.isoformat(),
            'to': (
                today + timedelta(days=7)
            ).isoformat(),
        },
    )

    assert response.status_code == 200

    assert response.json()['overload_dates'] == [
        inside.isoformat(),
        outside.isoformat(),
    ]

    # Existing range-scoped compatibility surface stays range scoped.
    assert response.json()['overload'] == [
        {
            'date': inside.isoformat(),
            'allowed': True,
        },
    ]


def test_timeline_navigation_is_global_and_exposes_anchor_state(
    api_for,
    user,
    make_item,
    today,
):
    anchored = make_item(
        user,
        'Globally anchored',
        manual_requested_date=(
            today + timedelta(days=40)
        ),
    )

    completed = make_item(
        user,
        'Completed searchable',
        due_date=(
            today + timedelta(days=60)
        ),
        is_completed=True,
    )

    response = api_for(user).get(
        '/api/planning/timeline/navigation/',
    )

    assert response.status_code == 200

    rows = response.json()

    by_id = {
        row['id']: row
        for row in rows
    }

    assert (
        by_id[anchored.pk]['manual_requested_date']
        == (
            today + timedelta(days=40)
        ).isoformat()
    )

    assert by_id[completed.pk]['is_completed'] is True


def test_completed_timeline_position_survives_scheduler_projection_reset(
    api_for,
    user,
    make_item,
    today,
):
    scheduled = (
        today + timedelta(days=2)
    )

    item = make_item(
        user,
        'Historical completed card',
        scheduled_date=scheduled,
    )

    response = api_for(user).post(
        f'/api/planning/items/{item.pk}/complete/',
        {
            'completed': True,
        },
        format='json',
    )

    assert response.status_code == 200

    item.refresh_from_db()

    assert item.is_completed is True

    assert (
        item.completed_display_date
        == scheduled
    )

    # Scheduler-owned projection remains disposable.
    item.scheduled_date = None
    item.save(
        update_fields=[
            'scheduled_date',
        ]
    )

    response = api_for(user).get(
        '/api/planning/timeline/',
        {
            'from': today.isoformat(),
            'to': (
                today + timedelta(days=7)
            ).isoformat(),
        },
    )

    assert response.status_code == 200

    rows = [
        row
        for group in response.json()['groups']
        for row in group['items']
    ]

    restored = next(
        row
        for row in rows
        if row['id'] == item.pk
    )

    assert (
        restored['completed_display_date']
        == scheduled.isoformat()
    )


def test_uncomplete_splittable_reverses_latest_confirmed_segment(
    api_for,
    user,
    make_item,
):
    item = make_item(
        user,
        'Large reversible task',
        duration_category=(
            DurationCategory.OVER_16_HOURS
        ),
    )

    complete = api_for(user).post(
        f'/api/planning/items/{item.pk}/complete/',
        {
            'completed': True,
        },
        format='json',
    )

    assert complete.status_code == 200

    item.refresh_from_db()

    assert item.is_completed is True
    assert item.percent_completed == 100
    assert item.progress_segments.count() == 1
    assert item.completed_display_date is not None

    reopen = api_for(user).post(
        f'/api/planning/items/{item.pk}/complete/',
        {
            'completed': False,
        },
        format='json',
    )

    assert reopen.status_code == 200

    item.refresh_from_db()

    assert item.is_completed is False
    assert item.percent_completed == 0
    assert item.progress_segments.count() == 0
    assert item.completed_display_date is None
