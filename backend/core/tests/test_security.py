"""Security hardening controls (A2 gap closure)."""

from importlib import reload
from types import SimpleNamespace

import pytest
from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.test import override_settings
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from accounts.views import LoginView, LogoutView, MFAVerifyView, RegisterView
from core.mixins import UserScopedMixin
from core.permissions import IsOwner, _resolve_owner


pytestmark = pytest.mark.django_db


def test_user_scoped_mixin_wires_is_owner():
    assert IsOwner in UserScopedMixin.permission_classes


def test_is_owner_resolves_nested_user_field():
    owner = SimpleNamespace(pk=1)
    other = SimpleNamespace(pk=2)
    obj = SimpleNamespace(planning_item=SimpleNamespace(user=owner))

    assert _resolve_owner(obj, 'planning_item__user') is owner
    assert _resolve_owner(obj, 'planning_item__user') is not other


def test_is_owner_object_permission_uses_view_user_field():
    owner = SimpleNamespace(pk=1, is_authenticated=True)
    obj = SimpleNamespace(planning_item=SimpleNamespace(user=owner))
    view = SimpleNamespace(user_field='planning_item__user')
    request = SimpleNamespace(user=owner)

    assert IsOwner().has_object_permission(request, view, obj) is True

    request.user = SimpleNamespace(pk=2, is_authenticated=True)
    assert IsOwner().has_object_permission(request, view, obj) is False


def test_throttle_and_replay_state_is_a_database_row():
    """LocMem dies on restart and is invisible to other workers."""
    assert settings.CACHES['default']['BACKEND'].endswith('DatabaseCache')
    cache.set('arc:probe', 'shared', timeout=60)
    with connection.cursor() as cursor:
        cursor.execute(
            'SELECT COUNT(*) FROM arc_cache WHERE cache_key LIKE %s',
            ['%arc:probe%'],
        )
        assert cursor.fetchone()[0] == 1


def test_the_eleventh_login_attempt_in_a_minute_is_throttled(api):
    for index in range(10):
        response = api.post(
            '/api/auth/login/',
            {'email': f'person{index}@example.com', 'password': 'not-the-password'},
            format='json',
        )
        assert response.status_code == 401

    blocked = api.post(
        '/api/auth/login/',
        {'email': 'person10@example.com', 'password': 'not-the-password'},
        format='json',
    )
    assert blocked.status_code == 429
    assert blocked.data['error']['code'] == 'throttled'
    for view in (RegisterView, LoginView, MFAVerifyView, LogoutView):
        assert ScopedRateThrottle in view.throttle_classes
    assert LoginView.throttle_scope == 'auth_strict'
    assert MFAVerifyView.throttle_scope == 'auth_strict'


def test_api_responses_carry_security_headers():
    client = APIClient()
    response = client.get('/api/health/')
    assert response.status_code == 200
    assert response['X-Content-Type-Options'] == 'nosniff'
    assert response['Referrer-Policy'] == 'same-origin'
    assert "default-src 'none'" in response['Content-Security-Policy']


def _url_prefixes():
    import arc_backend.urls as urls

    reload(urls)
    return [str(pattern.pattern) for pattern in urls.urlpatterns]


@override_settings(ENABLE_DJANGO_ADMIN=False)
def test_django_admin_urls_omitted_when_disabled():
    prefixes = _url_prefixes()
    assert not any(p.startswith('admin/') for p in prefixes)


@override_settings(ENABLE_API_DOCS=False)
def test_api_docs_urls_omitted_when_disabled():
    prefixes = _url_prefixes()
    assert 'api/docs/' not in prefixes
    assert 'api/schema/' not in prefixes
