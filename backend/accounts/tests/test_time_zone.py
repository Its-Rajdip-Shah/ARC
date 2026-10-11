"""Authenticated account timezone ownership and strict update boundary."""

import pytest
from django.contrib.auth import get_user_model

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize('zone', ['Australia/Sydney', 'America/Los_Angeles', 'UTC', None])
def test_time_zone_update_and_get(api_for, user, zone):
    user.time_zone = 'Europe/London'
    user.save(update_fields=['time_zone'])
    client = api_for(user)
    response = client.patch('/api/auth/me/', {'time_zone': zone}, format='json')
    assert response.status_code == 200
    assert response.data['time_zone'] == zone
    user.refresh_from_db()
    assert user.time_zone == zone
    assert client.get('/api/auth/me/').data['time_zone'] == zone


@pytest.mark.parametrize('zone', ['', ' ', 'Not/AZone', '../UTC', '/etc/passwd', 42, False])
def test_invalid_time_zone_is_rejected(api_for, user, zone):
    response = api_for(user).patch('/api/auth/me/', {'time_zone': zone}, format='json')
    assert response.status_code == 400
    user.refresh_from_db()
    assert user.time_zone is None


@pytest.mark.parametrize('extra', [
    {'email': 'attacker@example.com'}, {'is_admin': True}, {'is_locked': True},
    {'password': 'changed'}, {'id': 999}, {'user_id': 999},
])
def test_other_fields_are_rejected_atomically(api_for, user, extra):
    response = api_for(user).patch('/api/auth/me/', {'time_zone': 'UTC', **extra}, format='json')
    assert response.status_code == 400
    user.refresh_from_db()
    assert user.time_zone is None
    assert not user.is_admin
    assert user.email == 'alice@example.com'


def test_update_is_isolated_to_authenticated_user(api_for, user):
    other = get_user_model().objects.create_user('other@example.com', 'secret')
    response = api_for(user).patch('/api/auth/me/', {'time_zone': 'UTC'}, format='json')
    assert response.status_code == 200
    other.refresh_from_db()
    assert other.time_zone is None
    assert api_for(other).get('/api/auth/me/').data['time_zone'] is None


def test_update_requires_authentication_and_a_timezone(api, api_for, user):
    assert api.patch('/api/auth/me/', {'time_zone': 'UTC'}, format='json').status_code == 401
    assert api_for(user).patch('/api/auth/me/', {}, format='json').status_code == 400
