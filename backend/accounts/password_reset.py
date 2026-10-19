"""Desk reset for a locked-out account, and a signed-in password change.

The browser that files the request holds the only copy of the token. Admins
approve by row id. A decoy row keeps an unknown email on the same clock as a
real one, and it never shows up in the admin queue.
"""

import hashlib
import secrets
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from accounts.models import PasswordResetRequest

User = get_user_model()

RESET_TTL = timedelta(minutes=15)
REQUEST_DETAIL = (
    'If an account exists, an administrator has been asked to approve a reset. '
    'Keep this page open in this browser.'
)


class ResetNotReady(Exception):
    """The token is missing, expired, unapproved, or already used."""


class PasswordRejected(Exception):
    def __init__(self, messages):
        self.messages = list(messages)


def _digest(token):
    return hashlib.sha256(token.encode('utf-8')).hexdigest()


def revoke_refresh_tokens(user):
    """Outstanding refresh tokens survive for days. A password change ends them.

    The access token itself is not on this list. It can still be used until it
    expires (30 minutes). Callers that should stay signed in mint a new pair
    after this runs.
    """
    for outstanding in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=outstanding)


def change_password(user, new_password):
    user.set_password(new_password)
    user.save(update_fields=['password'])
    revoke_refresh_tokens(user)


def request_reset(email, purpose='password'):
    now = timezone.now()
    PasswordResetRequest.objects.filter(expires_at__lte=now).delete()
    normalised = User.objects.normalize_email(email)
    user = User.objects.filter(email__iexact=normalised).first()
    if user is not None:
        PasswordResetRequest.objects.filter(
            user=user,
            consumed_at__isnull=True,
        ).update(consumed_at=now)
    token = secrets.token_urlsafe(32)
    PasswordResetRequest.objects.create(
        user=user,
        token_digest=_digest(token),
        expires_at=now + RESET_TTL,
        purpose=purpose,
    )
    return token


def _row_for(token):
    return PasswordResetRequest.objects.filter(token_digest=_digest(token)).first()


def status_for(token):
    row = _row_for(token)
    if row is None or row.expires_at <= timezone.now():
        return 'expired'
    if row.consumed_at is not None:
        return 'consumed'
    if row.approved_at is not None and row.user_id is not None:
        return 'approved'
    return 'pending'


def open_requests():
    return (
        PasswordResetRequest.objects.filter(
            user__isnull=False,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .select_related('user')
        .order_by('created_at')
    )


def present_request(row):
    return {
        'id': str(row.id),
        'email': row.user.email,
        'created_at': row.created_at,
        'purpose': row.purpose,
        'status': 'approved' if row.approved_at else 'pending',
    }


def approve_reset(request_id, admin):
    row = (
        PasswordResetRequest.objects
        .select_related('user')
        .filter(pk=request_id, user__isnull=False)
        .first()
    )
    if row is None or row.consumed_at is not None or row.expires_at <= timezone.now():
        return None
    if row.approved_at is None:
        row.approved_at = timezone.now()
        row.approved_by = admin
        row.save(update_fields=['approved_at', 'approved_by'])
    return row


def _open_row(token, purpose):
    row = _row_for(token)
    if (
        row is None
        or row.user_id is None
        or row.purpose != purpose
        or row.approved_at is None
        or row.consumed_at is not None
        or row.expires_at <= timezone.now()
    ):
        raise ResetNotReady()
    return row


def confirm_reset(token, new_password):
    row = _open_row(token, 'password')
    user = row.user
    try:
        validate_password(new_password, user)
    except DjangoValidationError as exc:
        raise PasswordRejected(exc.messages) from exc
    change_password(user, new_password)
    row.consumed_at = timezone.now()
    row.save(update_fields=['consumed_at'])
    return user


def confirm_authenticator_recovery(token):
    """Drop the stored authenticator secret. The caller issues a new QR."""
    row = _open_row(token, 'authenticator')
    user = row.user
    user.totp_secret_encrypted = ''
    user.save(update_fields=['totp_secret_encrypted'])
    row.consumed_at = timezone.now()
    row.save(update_fields=['consumed_at'])
    return user
