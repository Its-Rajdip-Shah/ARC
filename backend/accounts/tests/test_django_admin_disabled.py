import pytest
from django.conf import settings
from django.urls import NoReverseMatch, Resolver404, resolve, reverse


def test_django_admin_disabled_by_default():
    """Django's built-in admin must not be exposed in the assessed config."""
    assert settings.ENABLE_DJANGO_ADMIN is False

    with pytest.raises(Resolver404):
        resolve("/admin/")

    with pytest.raises(NoReverseMatch):
        reverse("admin:index")