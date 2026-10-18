"""UserScopedMixin only returns and creates the caller's own rows."""

from types import SimpleNamespace

import pytest
from django.contrib.auth import get_user_model
from rest_framework.viewsets import GenericViewSet

from core.mixins import UserScopedMixin
from planning.models import ItemType, PlanningItem

pytestmark = pytest.mark.django_db
User = get_user_model()


@pytest.fixture
def user():
    return User.objects.create_user('alice@example.com', 'corr3ct-horse-battery')


@pytest.fixture
def other_user():
    return User.objects.create_user('bob@example.com', 'corr3ct-horse-battery')


class ItemView(UserScopedMixin, GenericViewSet):
    queryset = PlanningItem.objects.all()


def _view(user, **flags):
    view = ItemView()
    view.request = SimpleNamespace(user=user)
    view.format_kwarg = None
    for key, value in flags.items():
        setattr(view, key, value)
    return view


def test_queryset_excludes_another_users_rows(user, other_user):
    own = PlanningItem.objects.create(user=user, title='Mine', item_type=ItemType.GOAL)
    PlanningItem.objects.create(user=other_user, title='Theirs', item_type=ItemType.GOAL)

    ids = set(_view(user).get_queryset().values_list('pk', flat=True))

    assert ids == {own.pk}


def test_schema_generation_and_anonymous_calls_see_nothing(user):
    PlanningItem.objects.create(user=user, title='Mine', item_type=ItemType.GOAL)
    anonymous = SimpleNamespace(is_authenticated=False)

    assert _view(user, swagger_fake_view=True).get_queryset().count() == 0
    assert _view(anonymous).get_queryset().count() == 0


def test_perform_create_stamps_the_requesting_user(user):
    saved = {}

    def save(**kwargs):
        saved.update(kwargs)

    _view(user).perform_create(SimpleNamespace(save=save))
    assert saved['user'] == user


def test_a_nested_user_field_does_not_invent_an_owner(user):
    saved = {}

    def save(**kwargs):
        saved.update(kwargs)

    view = _view(user)
    view.user_field = 'planning_item__user'
    view.perform_create(SimpleNamespace(save=save))
    assert saved == {}
