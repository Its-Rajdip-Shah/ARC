"""EncryptedCharField stores ciphertext and refuses equality lookups."""

import pytest
from django.contrib.auth import get_user_model
from django.core.exceptions import ImproperlyConfigured
from django.db import NotSupportedError, connection
from django.test import override_settings

from core.fields import _build_fernet, get_fernet, max_plaintext_length

pytestmark = pytest.mark.django_db
User = get_user_model()


@pytest.fixture
def user():
    return User.objects.create_user('enc@example.com', 'corr3ct-horse-battery')


def test_a_secret_round_trips_and_is_not_stored_as_plaintext(user):
    user.totp_secret_encrypted = 'JBSWY3DPEHPK3PXP'
    user.save(update_fields=['totp_secret_encrypted'])

    with connection.cursor() as cursor:
        cursor.execute(
            'SELECT totp_secret_encrypted FROM users WHERE user_id = %s',
            [user.pk],
        )
        stored = cursor.fetchone()[0]

    assert stored != 'JBSWY3DPEHPK3PXP'
    user.refresh_from_db()
    assert user.totp_secret_encrypted == 'JBSWY3DPEHPK3PXP'


def test_blank_ciphertext_stays_blank(user):
    user.totp_secret_encrypted = ''
    user.save(update_fields=['totp_secret_encrypted'])
    user.refresh_from_db()
    assert user.totp_secret_encrypted == ''


def test_equality_lookups_are_rejected():
    with pytest.raises(NotSupportedError):
        list(User.objects.filter(totp_secret_encrypted='secret'))


def test_a_missing_encryption_key_is_refused():
    _build_fernet.cache_clear()
    with override_settings(ARC_FIELD_ENCRYPTION_KEY=''):
        with pytest.raises(ImproperlyConfigured):
            get_fernet()


def test_plaintext_limit_fits_inside_the_column():
    assert max_plaintext_length(255) >= 100
    assert max_plaintext_length(1) == 0
