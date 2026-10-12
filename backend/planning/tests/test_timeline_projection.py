"""Timeline cards project execution work without removing hierarchy context."""

from datetime import date

import pytest
from freezegun import freeze_time

from planning.models import ItemType, PlanningDependency

pytestmark = pytest.mark.django_db
DAY = date(2026, 9, 14)


@pytest.fixture(autouse=True)
def frozen_clock():
    with freeze_time(DAY):
        yield


def timeline_rows(client):
    response = client.get('/api/planning/timeline/', {
        'from': DAY.isoformat(), 'to': DAY.isoformat(),
    })
    assert response.status_code == 200, response.data
    return {
        row['id']: row
        for group in response.data['groups']
        for row in group['items']
    }


@pytest.mark.parametrize('date_fields', [
    {'start_date': DAY},
    {'due_date': DAY},
    {'start_date': date(2026, 9, 1), 'due_date': date(2026, 9, 30)},
])
def test_unfinished_structural_parent_is_not_a_timeline_card(
    user, api_for, make_item, date_fields,
):
    parent = make_item(user, 'Assignment', ItemType.ASSIGNMENT, **date_fields)
    child = make_item(user, 'Draft', parent=parent, due_date=DAY)

    rows = timeline_rows(api_for(user))

    assert parent.pk not in rows
    assert child.pk in rows


def test_residual_parent_with_completed_children_remains_visible(user, api_for, make_item):
    parent = make_item(user, 'Submit assignment', ItemType.ASSIGNMENT, due_date=DAY)
    make_item(user, 'Finished draft', parent=parent, is_completed=True)

    row = timeline_rows(api_for(user))[parent.pk]

    assert row['is_completed'] is False
    assert row['has_children'] is True


@pytest.mark.parametrize('child_completed', [True, False])
def test_completed_parent_retains_historical_visibility(
    user, api_for, make_item, child_completed,
):
    parent = make_item(
        user, 'Submitted assignment', ItemType.ASSIGNMENT,
        is_completed=True, completed_display_date=DAY,
    )
    # Preserve historical projection even for inconsistent imported state.
    make_item(user, 'Draft', parent=parent, is_completed=child_completed)

    row = timeline_rows(api_for(user))[parent.pk]

    assert row['is_completed'] is True
    assert row['completed_display_date'] == DAY.isoformat()


def test_dependency_blocked_leaf_remains_visible(user, api_for, make_item):
    prerequisite = make_item(user, 'Prerequisite')
    blocked = make_item(user, 'Blocked leaf', due_date=DAY)
    PlanningDependency.objects.create(prerequisite=prerequisite, dependent=blocked)

    assert blocked.pk in timeline_rows(api_for(user))


def test_structural_parent_retains_tree_navigation_and_card_ancestry(user, api_for, make_item):
    root = make_item(user, 'Course', ItemType.GOAL)
    parent = make_item(user, 'Assignment', ItemType.ASSIGNMENT, parent=root, due_date=DAY)
    child = make_item(user, 'Draft', parent=parent, due_date=DAY)
    client = api_for(user)

    rows = timeline_rows(client)
    assert parent.pk not in rows
    assert rows[child.pk]['hierarchy_path'] == [
        {'id': root.pk, 'title': root.title},
        {'id': parent.pk, 'title': parent.title},
    ]
    tree = client.get('/api/planning/items/tree/')
    assert tree.status_code == 200
    assert tree.data[0]['id'] == root.pk
    assert tree.data[0]['children'][0]['id'] == parent.pk
    assert tree.data[0]['children'][0]['children'][0]['id'] == child.pk
    navigation = client.get('/api/planning/timeline/navigation/')
    assert navigation.status_code == 200
    assert {row['id'] for row in navigation.data} == {parent.pk, child.pk}


def test_deleted_unfinished_child_does_not_hide_parent(user, api_for, make_item):
    parent = make_item(user, 'Assignment', ItemType.ASSIGNMENT, due_date=DAY)
    child = make_item(user, 'Deleted draft', parent=parent, is_deleted=True)

    rows = timeline_rows(api_for(user))

    assert parent.pk in rows
    assert child.pk not in rows


def test_foreign_children_cannot_hide_parent(user, other_user, api_for, make_item):
    parent = make_item(user, 'Assignment', ItemType.ASSIGNMENT, due_date=DAY)
    # Deliberately malformed legacy data: eligibility must scope the child
    # subquery by owner even when the foreign key points at this user's parent.
    foreign_child = make_item(other_user, 'Private draft', parent=parent, due_date=DAY)

    rows = timeline_rows(api_for(user))

    assert parent.pk in rows
    assert foreign_child.pk not in rows
