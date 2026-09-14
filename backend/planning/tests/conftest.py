"""Shared fixtures for the planning service tests."""

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone

from planning.models import ItemType, PlanningItem

User = get_user_model()


@pytest.fixture
def today():
    return timezone.localdate()


@pytest.fixture
def user(db):
    return User.objects.create_user('alice@example.com', 'corr3ct-horse-battery')


@pytest.fixture
def other_user(db):
    return User.objects.create_user('bob@example.com', 'corr3ct-horse-battery')


@pytest.fixture
def make_item(db):
    """Create a planning item. Defaults to an active task with no dates."""

    def factory(user, title, item_type=ItemType.TASK, parent=None, **fields):
        return PlanningItem.objects.create(
            user=user, title=title, item_type=item_type, parent=parent, **fields
        )

    return factory


@pytest.fixture
def chain(user, make_item):
    """A three-deep line: a -> b -> c."""
    a = make_item(user, 'a', ItemType.GOAL)
    b = make_item(user, 'b', ItemType.GOAL, parent=a)
    c = make_item(user, 'c', ItemType.GOAL, parent=b)
    return a, b, c


def positions(user):
    """The user's priority order as a list of (position, title)."""
    return list(
        PlanningItem.objects.for_user(user)
        .exclude(priority_position=None)
        .order_by('priority_position')
        .values_list('priority_position', 'title')
    )
