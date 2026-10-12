"""Persistent failed-login protection for password and MFA authentication."""

from datetime import timedelta
from math import ceil

from django.db import transaction
from django.utils import timezone
from django.utils.crypto import salted_hmac
from rest_framework.exceptions import Throttled

from .models import LoginAttempt


MAX_FAILED_ATTEMPTS = 5
COOLDOWN_MINUTES = 15


def _email_digest(email):
    """Use a keyed hash so login attempts do not store plain emails."""
    return salted_hmac(
        'accounts.login_protection',
        email.strip().casefold(),
        algorithm='sha256',
    ).hexdigest()


def check_login_cooldown(email):
    """Reject authentication while an email is temporarily blocked."""
    attempt = LoginAttempt.objects.filter(
        email_digest=_email_digest(email)
    ).first()

    if attempt and attempt.locked_until:
        remaining = (attempt.locked_until - timezone.now()).total_seconds()

        if remaining > 0:
            raise Throttled(
                wait=ceil(remaining),
                detail='Too many failed attempts. Please try again later.',
            )


def record_failed_login(email):
    """Count a failure and start a cool-down when the limit is reached."""
    digest = _email_digest(email)

    with transaction.atomic():
        attempt, _ = LoginAttempt.objects.select_for_update().get_or_create(
            email_digest=digest
        )

        now = timezone.now()

        if attempt.locked_until and attempt.locked_until > now:
            remaining = (attempt.locked_until - now).total_seconds()
            raise Throttled(
                wait=ceil(remaining),
                detail='Too many failed attempts. Please try again later.',
            )

        if attempt.locked_until and attempt.locked_until <= now:
            attempt.failed_attempts = 0
            attempt.locked_until = None

        attempt.failed_attempts += 1

        if attempt.failed_attempts >= MAX_FAILED_ATTEMPTS:
            attempt.locked_until = now + timedelta(
                minutes=COOLDOWN_MINUTES
            )

        attempt.save(update_fields=['failed_attempts', 'locked_until'])

    check_login_cooldown(email)


def clear_failed_logins(email):
    """Reset failure tracking after successful complete MFA login."""
    LoginAttempt.objects.filter(
        email_digest=_email_digest(email)
    ).delete()