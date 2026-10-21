"""Authentication flow tests (FR-01, FR-02, FR-03, FR-15, FR-16).

Every assertion checks the machine-readable ``error.code`` from the shared
envelope rather than the prose message, so rewording an error cannot silently
turn a rejection test green.
"""

import pytest
from django.contrib.auth import get_user_model

from accounts.tokens import MFAEnrolmentToken, MFAPendingToken
from accounts.totp import verify
from planning.models import SchedulingState

from .conftest import PASSWORD, code_for, expired_token, login_through_mfa, make_user

pytestmark = pytest.mark.django_db

REGISTER = '/api/auth/register/'
ENROL = '/api/auth/mfa/enroll/confirm/'
LOGIN = '/api/auth/login/'
LOGIN_MFA = '/api/auth/login/mfa/'
ADMIN_LOGIN = '/api/auth/admin/login/'
ADMIN_LOGIN_MFA = '/api/auth/admin/login/mfa/'
REFRESH = '/api/auth/token/refresh/'
LOGOUT = '/api/auth/logout/'
ME = '/api/auth/me/'


def code(response):
    return response.data['error']['code']


def fields(response):
    return response.data['error']['fields']


# --------------------------------------------------------------------------
# Registration and enrolment (FR-01)
# --------------------------------------------------------------------------

def test_register_returns_a_qr_code_and_leaves_mfa_incomplete(api):
    response = api.post(REGISTER, {'email': 'new@example.com', 'password': PASSWORD, 'scheduler_flavour': 'monk'}, format='json')

    assert response.status_code == 201
    assert response.data['user']['email'] == 'new@example.com'
    assert response.data['mfa']['provisioning_uri'].startswith('otpauth://totp/ARC:')
    assert response.data['mfa']['qr_png_base64']
    # The secret is only in the signed token until the user proves they
    # scanned it, so the account cannot log in yet.
    assert response.data['user']['mfa_enabled'] is False


def test_register_never_exposes_the_stored_secret_field(api):
    response = api.post(REGISTER, {'email': 'new@example.com', 'password': PASSWORD, 'scheduler_flavour': 'monk'}, format='json')
    assert 'totp_secret_encrypted' not in response.data['user']
    assert 'password' not in response.data['user']
@pytest.mark.parametrize('flavour', ['lock-in', 'monk'])
def test_registration_saves_scheduler_flavour(api, api_for, flavour):
    response = api.post(
        REGISTER,
        {
            'email': 'new@example.com',
            'password': PASSWORD,
            'scheduler_flavour': flavour,
        },
        format='json',
    )

    assert response.status_code == 201

    state = SchedulingState.objects.get(
        user_id=response.data['user']['id']
    )

    assert state.scheduler_flavour == flavour
    enrolment = api.post(
        ENROL,
        {
            'enrolment_token': response.data['enrolment_token'],
            'code': code_for(response.data['mfa']['secret']),
        },
        format='json',
    )
    assert enrolment.status_code == 200

    settings_response = api_for(state.user).get(
        '/api/planning/scheduler/settings/'
    )

    assert settings_response.status_code == 200
    assert settings_response.json() == {
        'flavour': flavour,
        'configured': True,
    }

@pytest.mark.parametrize('flavour', [None, 'invalid'])
def test_registration_rejects_missing_or_invalid_flavour(api, flavour):
    payload = {
        'email': 'new@example.com',
        'password': PASSWORD,
    }

    if flavour is not None:
        payload['scheduler_flavour'] = flavour

    response = api.post(REGISTER, payload, format='json')

    assert response.status_code == 400
    assert 'scheduler_flavour' in fields(response)

@pytest.mark.parametrize(
    'payload, bad_field',
    [
        ({'password': PASSWORD}, 'email'),
        ({'email': 'not-an-email', 'password': PASSWORD}, 'email'),
        ({'email': 'new@example.com'}, 'password'),
        ({'email': 'new@example.com', 'password': '123'}, 'password'),
    ],
)
def test_register_rejects_bad_input(api, payload, bad_field):
    response = api.post(REGISTER, payload, format='json')
    assert response.status_code == 400
    assert bad_field in fields(response)


def test_wrong_password_on_a_taken_email_looks_like_a_new_signup(api, user):
    """An unauthenticated probe must not learn that the email is registered.

    Someone who already knows the password still gets a sign-in error once
    enrolment is finished. A wrong password gets the same 201 shape as a
    brand-new address, and confirming that response does not touch the
    real account.
    """
    fresh = api.post(
        REGISTER,
        {'email': 'brand-new@example.com', 'password': PASSWORD, 'scheduler_flavour': 'monk'},
        format='json',
    )
    probe = api.post(
        REGISTER,
        {
            'email': user.email,
            'password': 'another-correct-horse',
            'scheduler_flavour': 'monk',
        },
        format='json',
    )

    assert fresh.status_code == 201
    assert probe.status_code == 201
    assert set(probe.data) == set(fresh.data)
    assert set(probe.data['user']) == set(fresh.data['user'])
    assert set(probe.data['mfa']) == set(fresh.data['mfa'])
    assert 'already exists' not in str(probe.data)
    assert probe.data['user']['id'] != user.pk

    secret_before = user.totp_secret_encrypted
    user.refresh_from_db()
    assert user.check_password(PASSWORD)
    assert user.totp_secret_encrypted == secret_before
    assert get_user_model().objects.filter(email__iexact=user.email).count() == 1

    confirmed = api.post(
        ENROL,
        {
            'enrolment_token': probe.data['enrolment_token'],
            'code': code_for(probe.data['mfa']['secret']),
        },
        format='json',
    )
    assert confirmed.status_code == 200
    user.refresh_from_db()
    assert user.check_password(PASSWORD)
    assert user.totp_secret_encrypted == secret_before


def test_correct_password_on_a_finished_account_says_sign_in(api, user):
    response = api.post(
        REGISTER,
        {'email': user.email, 'password': PASSWORD, 'scheduler_flavour': 'monk'},
        format='json',
    )
    assert response.status_code == 400
    assert 'email' in fields(response)
    assert 'already exists' not in str(response.data)
    assert 'enrolment_token' not in response.data


def test_same_password_resumes_an_unfinished_signup(api):
    first = api.post(
        REGISTER,
        {'email': 'new@example.com', 'password': PASSWORD, 'scheduler_flavour': 'monk'},
        format='json',
    )
    assert first.status_code == 201

    second = api.post(
        REGISTER,
        {'email': 'new@example.com', 'password': PASSWORD, 'scheduler_flavour': 'lock-in'},
        format='json',
    )

    assert second.status_code == 201
    assert second.data['user']['id'] == first.data['user']['id']
    assert second.data['user']['mfa_enabled'] is False
    assert get_user_model().objects.filter(email__iexact='new@example.com').count() == 1
    assert SchedulingState.objects.get(user_id=first.data['user']['id']).scheduler_flavour == 'lock-in'


def test_resumed_signup_can_finish_enrolment_and_reach_login(api):
    first = api.post(
        REGISTER,
        {'email': 'new@example.com', 'password': PASSWORD, 'scheduler_flavour': 'monk'},
        format='json',
    )
    resumed = api.post(
        REGISTER,
        {'email': 'new@example.com', 'password': PASSWORD, 'scheduler_flavour': 'monk'},
        format='json',
    )
    assert resumed.status_code == 201

    enrolled = api.post(
        ENROL,
        {
            'enrolment_token': resumed.data['enrolment_token'],
            'code': code_for(resumed.data['mfa']['secret']),
        },
        format='json',
    )
    assert enrolled.status_code == 200
    assert enrolled.data['user']['mfa_enabled'] is True

    login = api.post(LOGIN, {'email': 'new@example.com', 'password': PASSWORD}, format='json')
    assert login.status_code == 200
    assert login.data['mfa_required'] is True
    assert first.data['mfa']['secret'] != resumed.data['mfa']['secret']


def test_a_different_password_cannot_take_over_an_unfinished_signup(api):
    api.post(
        REGISTER,
        {'email': 'new@example.com', 'password': PASSWORD, 'scheduler_flavour': 'monk'},
        format='json',
    )

    response = api.post(
        REGISTER,
        {
            'email': 'new@example.com',
            'password': 'different-horse-battery',
            'scheduler_flavour': 'lock-in',
        },
        format='json',
    )

    assert response.status_code == 201
    assert 'already exists' not in str(response.data)
    user = get_user_model().objects.get(email='new@example.com')
    assert user.check_password(PASSWORD)
    assert user.mfa_enabled is False
    assert SchedulingState.objects.get(user=user).scheduler_flavour == 'monk'

    confirmed = api.post(
        ENROL,
        {
            'enrolment_token': response.data['enrolment_token'],
            'code': code_for(response.data['mfa']['secret']),
        },
        format='json',
    )
    assert confirmed.status_code == 200
    user.refresh_from_db()
    assert user.mfa_enabled is False


def test_enrolment_stores_the_secret(api):
    registered = api.post(
        REGISTER, {'email': 'new@example.com', 'password': PASSWORD, 'scheduler_flavour': 'monk'}, format='json'
    ).data
    secret = registered['mfa']['secret']

    response = api.post(
        ENROL,
        {'enrolment_token': registered['enrolment_token'], 'code': code_for(secret)},
        format='json',
    )

    assert response.status_code == 200
    assert response.data['enrolled'] is True
    assert response.data['user']['mfa_enabled'] is True


def test_enrolment_rejects_a_wrong_code(api):
    registered = api.post(
        REGISTER, {'email': 'new@example.com', 'password': PASSWORD, 'scheduler_flavour': 'monk'}, format='json'
    ).data

    response = api.post(
        ENROL,
        {'enrolment_token': registered['enrolment_token'], 'code': '000000'},
        format='json',
    )

    assert response.status_code == 401
    assert code(response) == 'invalid_totp'


def test_enrolment_rejects_an_expired_token(api, user, secret):
    response = api.post(
        ENROL,
        {'enrolment_token': expired_token(MFAEnrolmentToken, user, secret=secret),
         'code': code_for(secret)},
        format='json',
    )
    assert response.status_code == 401
    assert code(response) == 'enrolment_token_invalid'


# --------------------------------------------------------------------------
# Login step one: credentials (FR-02)
# --------------------------------------------------------------------------

def test_login_returns_an_mfa_token_not_an_access_token(api, user):
    response = api.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')

    assert response.status_code == 200
    assert response.data['mfa_required'] is True
    assert 'mfa_token' in response.data
    assert 'access' not in response.data
    assert 'refresh' not in response.data


def test_login_rejects_a_wrong_password(api, user):
    response = api.post(LOGIN, {'email': user.email, 'password': 'wrong-password'}, format='json')
    assert response.status_code == 401
    assert code(response) == 'invalid_credentials'


def test_login_cooldown_after_five_failed_passwords(api, user):
    from django.core.cache import cache

    cache.clear()

    payload = {
        'email': user.email,
        'password': 'incorrect-password',
    }

    # First four failed attempts return 401.
    for _ in range(4):
        response = api.post(LOGIN, payload, format='json')
        assert response.status_code == 401
        assert code(response) == 'invalid_credentials'

    # Fifth failure triggers the temporary cool-down.
    response = api.post(LOGIN, payload, format='json')
    assert response.status_code == 429

    # Even the correct password is blocked during cool-down.
    response = api.post(
        LOGIN,
        {'email': user.email, 'password': PASSWORD},
        format='json',
    )
    assert response.status_code == 429


def test_login_rejects_an_unknown_email(api, db):
    response = api.post(LOGIN, {'email': 'nobody@example.com', 'password': PASSWORD}, format='json')
    assert response.status_code == 401
    assert code(response) == 'invalid_credentials'


def test_unknown_email_cooldown_does_not_reveal_accounts(api, user):
    from django.core.cache import cache

    cache.clear()

    known = api.post(
        LOGIN,
        {'email': user.email, 'password': 'wrong-password'},
        format='json',
    )

    unknown_payload = {
        'email': 'nonexistent@example.com',
        'password': 'wrong-password',
    }

    unknown = api.post(LOGIN, unknown_payload, format='json')

    # Unknown and existing emails produce identical credential errors.
    assert known.status_code == unknown.status_code == 401
    assert code(known) == code(unknown) == 'invalid_credentials'

    # Unknown emails receive the same failed-attempt protection.
    for _ in range(3):
        response = api.post(LOGIN, unknown_payload, format='json')
        assert response.status_code == 401

    # Fifth failure triggers cool-down.
    response = api.post(LOGIN, unknown_payload, format='json')
    assert response.status_code == 429


def test_login_rejects_a_locked_account(api, user):
    user.is_locked = True
    user.save(update_fields=['is_locked'])

    response = api.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')

    assert response.status_code == 403
    assert code(response) == 'account_locked'


def test_a_locked_account_is_not_revealed_by_a_wrong_password(api, user):
    """Checking the password first stops login being an oracle for which
    accounts exist or are locked."""
    user.is_locked = True
    user.save(update_fields=['is_locked'])

    locked = api.post(LOGIN, {'email': user.email, 'password': 'wrong'}, format='json')
    unknown = api.post(LOGIN, {'email': 'nobody@example.com', 'password': 'wrong'}, format='json')

    assert locked.status_code == unknown.status_code == 401
    assert code(locked) == code(unknown) == 'invalid_credentials'


def test_login_refuses_an_account_that_never_finished_enrolment(api, unenrolled):
    response = api.post(LOGIN, {'email': unenrolled.email, 'password': PASSWORD}, format='json')
    assert response.status_code == 403
    assert code(response) == 'mfa_enrolment_required'
    assert 'same email and password' in response.data['error']['message']


# --------------------------------------------------------------------------
# Login step two: TOTP (FR-02)
# --------------------------------------------------------------------------

def test_mfa_step_issues_a_usable_token_pair(api, user, secret):
    body = login_through_mfa(api, user, secret)

    assert body['user']['email'] == user.email
    api.credentials(HTTP_AUTHORIZATION=f'Bearer {body["access"]}')
    assert api.get(ME).status_code == 200


def test_mfa_step_updates_last_login_for_the_admin_dashboard(api, user, secret):
    assert user.last_login is None
    login_through_mfa(api, user, secret)
    user.refresh_from_db()
    assert user.last_login is not None


def test_mfa_step_rejects_a_wrong_code(api, user, secret):
    step_one = api.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')

    response = api.post(
        LOGIN_MFA, {'mfa_token': step_one.data['mfa_token'], 'code': '000000'}, format='json'
    )

    assert response.status_code == 401
    assert code(response) == 'invalid_totp'


def test_mfa_cooldown_after_five_failed_codes(api, user, secret):
    from django.core.cache import cache

    cache.clear()

    step_one = api.post(
        LOGIN,
        {'email': user.email, 'password': PASSWORD},
        format='json',
    )
    assert step_one.status_code == 200

    valid_code = code_for(secret)
    wrong_code = '000000' if valid_code != '000000' else '111111'

    payload = {
        'mfa_token': step_one.data['mfa_token'],
        'code': wrong_code,
    }

    # First four incorrect codes return 401.
    for _ in range(4):
        response = api.post(LOGIN_MFA, payload, format='json')
        assert response.status_code == 401
        assert code(response) == 'invalid_totp'

    # Fifth incorrect code triggers cool-down.
    response = api.post(LOGIN_MFA, payload, format='json')
    assert response.status_code == 429

    # Even the correct MFA code is blocked during cool-down.
    response = api.post(
        LOGIN_MFA,
        {
            'mfa_token': step_one.data['mfa_token'],
            'code': valid_code,
        },
        format='json',
    )
    assert response.status_code == 429


def test_mfa_step_rejects_a_replayed_code(api, user, secret):
    """pyotp accepts a code for its whole validity window, so a second use of
    the same code must be refused by the replay guard."""
    first = api.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')
    reused = code_for(secret)
    assert api.post(
        LOGIN_MFA, {'mfa_token': first.data['mfa_token'], 'code': reused}, format='json'
    ).status_code == 200

    second = api.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')
    response = api.post(
        LOGIN_MFA, {'mfa_token': second.data['mfa_token'], 'code': reused}, format='json'
    )

    assert response.status_code == 401
    assert code(response) == 'invalid_totp'


def test_mfa_step_rejects_an_expired_mfa_token(api, user, secret):
    response = api.post(
        LOGIN_MFA,
        {'mfa_token': expired_token(MFAPendingToken, user, admin_login=False),
         'code': code_for(secret)},
        format='json',
    )
    assert response.status_code == 401
    assert code(response) == 'mfa_token_invalid'


def test_mfa_step_rejects_an_account_locked_between_the_two_steps(api, user, secret):
    step_one = api.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')
    user.is_locked = True
    user.save(update_fields=['is_locked'])

    response = api.post(
        LOGIN_MFA,
        {'mfa_token': step_one.data['mfa_token'], 'code': code_for(secret)},
        format='json',
    )

    assert response.status_code == 403
    assert code(response) == 'account_locked'


# --------------------------------------------------------------------------
# Token scope: the MFA step must not be bypassable (FR-02, FR-03)
# --------------------------------------------------------------------------

def test_an_mfa_pending_token_cannot_reach_a_protected_endpoint(api, user):
    """The whole point of the scope check. This token is validly signed and
    names a real user, so without the scope check it would be a complete
    bypass of the TOTP step."""
    step_one = api.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')

    api.credentials(HTTP_AUTHORIZATION=f'Bearer {step_one.data["mfa_token"]}')
    response = api.get(ME)

    assert response.status_code == 401
    assert code(response) in {'insufficient_token_scope', 'token_not_valid'}


def test_an_enrolment_token_cannot_reach_a_protected_endpoint(api, user, secret):
    token = MFAEnrolmentToken.for_user(user)
    token['secret'] = secret

    api.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')

    assert api.get(ME).status_code == 401


def test_protected_endpoints_require_a_token_at_all(api, db):
    assert api.get(ME).status_code == 401


def test_an_expired_access_token_is_rejected(api, user, secret):
    from rest_framework_simplejwt.tokens import AccessToken

    stale = expired_token(AccessToken, user, scope='full')
    api.credentials(HTTP_AUTHORIZATION=f'Bearer {stale}')

    assert api.get(ME).status_code == 401


def test_locking_an_account_kills_a_live_session_immediately(api, user, secret):
    """FR-16: the lock must bite on the next request, not whenever the access
    token happens to expire."""
    body = login_through_mfa(api, user, secret)
    api.credentials(HTTP_AUTHORIZATION=f'Bearer {body["access"]}')
    assert api.get(ME).status_code == 200

    user.is_locked = True
    user.save(update_fields=['is_locked'])

    response = api.get(ME)
    assert response.status_code == 401
    assert code(response) == 'account_locked'


# --------------------------------------------------------------------------
# Refresh and logout
# --------------------------------------------------------------------------

def test_refreshing_preserves_the_full_scope(api, user, secret):
    body = login_through_mfa(api, user, secret)

    refreshed = api.post(REFRESH, {'refresh': body['refresh']}, format='json')
    assert refreshed.status_code == 200

    api.credentials(HTTP_AUTHORIZATION=f'Bearer {refreshed.data["access"]}')
    assert api.get(ME).status_code == 200


def test_logout_blacklists_the_refresh_token(api, user, secret):
    body = login_through_mfa(api, user, secret)
    api.credentials(HTTP_AUTHORIZATION=f'Bearer {body["access"]}')

    assert api.post(LOGOUT, {'refresh': body['refresh']}, format='json').status_code == 205
    assert api.post(REFRESH, {'refresh': body['refresh']}, format='json').status_code == 401


def test_logout_rejects_the_access_token_that_was_presented(api, user, secret):
    body = login_through_mfa(api, user, secret)
    api.credentials(HTTP_AUTHORIZATION=f'Bearer {body["access"]}')
    assert api.get(ME).status_code == 200

    assert api.post(LOGOUT, {'refresh': body['refresh']}, format='json').status_code == 205

    assert api.get(ME).status_code == 401


def test_logout_works_without_an_access_token(api, user, secret):
    """Refresh is the credential — clients must be able to revoke after expiry."""
    body = login_through_mfa(api, user, secret)
    api.credentials()

    assert api.post(LOGOUT, {'refresh': body['refresh']}, format='json').status_code == 205
    assert api.post(REFRESH, {'refresh': body['refresh']}, format='json').status_code == 401


# --------------------------------------------------------------------------
# Administrator entry point (FR-15)
# --------------------------------------------------------------------------

def test_admin_login_rejects_a_standard_account(api, user):
    response = api.post(ADMIN_LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')
    assert response.status_code == 403
    assert code(response) == 'not_an_administrator'


def test_admin_login_accepts_an_administrator(api, admin_user, secret):
    body = login_through_mfa(api, admin_user, secret, admin=True)
    assert body['user']['is_admin'] is True


def test_an_admin_mfa_token_is_not_redeemable_on_the_standard_endpoint(api, admin_user, secret):
    step_one = api.post(
        ADMIN_LOGIN, {'email': admin_user.email, 'password': PASSWORD}, format='json'
    )

    response = api.post(
        LOGIN_MFA,
        {'mfa_token': step_one.data['mfa_token'], 'code': code_for(secret)},
        format='json',
    )

    assert response.status_code == 403
    assert code(response) == 'wrong_login_flow'


def test_a_standard_mfa_token_is_not_redeemable_on_the_admin_endpoint(api, user, secret):
    step_one = api.post(LOGIN, {'email': user.email, 'password': PASSWORD}, format='json')

    response = api.post(
        ADMIN_LOGIN_MFA,
        {'mfa_token': step_one.data['mfa_token'], 'code': code_for(secret)},
        format='json',
    )

    assert response.status_code == 403
    assert code(response) == 'wrong_login_flow'


# --------------------------------------------------------------------------
# TOTP helper
# --------------------------------------------------------------------------

def test_verify_rejects_empty_input(secret):
    assert verify(secret, '') is False
    assert verify('', '123456') is False


def test_verify_accepts_a_current_code_once(db, secret):
    assert verify(secret, code_for(secret), user_id=1) is True
    assert verify(secret, code_for(secret), user_id=1) is False


def test_verify_without_a_user_id_does_not_consume_the_code(secret):
    """The enrolment path checks a code before a user is known to the guard."""
    assert verify(secret, code_for(secret)) is True
    assert verify(secret, code_for(secret)) is True
