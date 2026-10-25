"""Signed-in password change and admin-approved reset.

A locked-out person can file a request. Every administrator sees it. Only the
browser that filed it, after an approval, can choose the new password.
"""

from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import PasswordResetRequest
from accounts.totp import verify

from .conftest import PASSWORD, code_for, login_through_mfa, make_user

User = get_user_model()

CHANGE = '/api/auth/password/change/'
REQUEST = '/api/auth/password-reset/'
CONFIRM = '/api/auth/password-reset/confirm/'
RECOVER = '/api/auth/mfa/recover/'
RECOVER_CONFIRM = '/api/auth/mfa/recover/confirm/'
ENROL = '/api/auth/mfa/enroll/confirm/'
QUEUE = '/api/admin/password-resets/'
NEW_PASSWORD = 'fresh-stamp-7-river'


def code(response):
    return response.data['error']['code']


def status_url(token):
    return f'/api/auth/password-reset/status/{token}/'


def signed_in(user, secret):
    client = APIClient()
    body = login_through_mfa(client, user, secret)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {body["access"]}')
    return client, body


@pytest.fixture
def second_admin(db):
    return make_user('other-admin@example.com', is_admin=True)


def test_signed_in_change_replaces_the_password_and_kills_the_old_refresh(secret, user):
    client, body = signed_in(user, secret)

    response = client.post(
        CHANGE,
        {'current_password': PASSWORD, 'new_password': NEW_PASSWORD},
        format='json',
    )

    assert response.status_code == 200, response.data
    user.refresh_from_db()
    assert user.check_password(NEW_PASSWORD)
    assert response.data['access']
    assert response.data['refresh'] != body['refresh']
    stale = APIClient().post('/api/auth/token/refresh/', {'refresh': body['refresh']}, format='json')
    assert stale.status_code == 401
    fresh = APIClient().post(
        '/api/auth/token/refresh/',
        {'refresh': response.data['refresh']},
        format='json',
    )
    assert fresh.status_code == 200


def test_wrong_current_password_does_not_change_it(secret, user):
    client, _body = signed_in(user, secret)

    response = client.post(
        CHANGE,
        {'current_password': 'not-the-password', 'new_password': NEW_PASSWORD},
        format='json',
    )

    assert response.status_code == 400
    assert code(response) == 'invalid'
    assert 'current_password' in response.data['error']['fields']
    user.refresh_from_db()
    assert user.check_password(PASSWORD)


def test_anonymous_password_change_is_rejected(api):
    response = api.post(
        CHANGE,
        {'current_password': PASSWORD, 'new_password': NEW_PASSWORD},
        format='json',
    )
    assert response.status_code == 401


def test_known_and_unknown_emails_get_the_same_reset_response(api, user, admin_user):
    known = api.post(REQUEST, {'email': user.email}, format='json')
    unknown = api.post(REQUEST, {'email': 'missing@example.com'}, format='json')

    assert known.status_code == unknown.status_code == 200
    assert known.data['detail'] == unknown.data['detail']
    assert set(known.data) == set(unknown.data) == {'detail', 'request_token'}
    assert known.data['request_token'] != unknown.data['request_token']

    queue = APIClient()
    queue.force_authenticate(user=admin_user)
    listed = queue.get(QUEUE)
    assert listed.status_code == 200
    assert [row['email'] for row in listed.data] == [user.email]
    assert listed.data[0]['status'] == 'pending'
    assert 'request_token' not in listed.data[0]
    assert PasswordResetRequest.objects.filter(user__isnull=True).exists()


def test_every_admin_sees_the_same_queue(api, user, admin_user, second_admin):
    api.post(REQUEST, {'email': user.email}, format='json')

    first = APIClient()
    first.force_authenticate(user=admin_user)
    second = APIClient()
    second.force_authenticate(user=second_admin)

    assert first.get(QUEUE).data == second.get(QUEUE).data


def test_a_student_cannot_open_the_reset_queue(api_for, user):
    response = api_for(user).get(QUEUE)
    assert response.status_code == 403


def test_confirm_before_approval_keeps_the_password(api, user):
    filed = api.post(REQUEST, {'email': user.email}, format='json')
    token = filed.data['request_token']

    waiting = api.get(status_url(token))
    assert waiting.data == {'status': 'pending'}

    confirm = api.post(
        CONFIRM,
        {'request_token': token, 'new_password': NEW_PASSWORD},
        format='json',
    )
    assert confirm.status_code == 400
    assert code(confirm) == 'reset_not_ready'
    user.refresh_from_db()
    assert user.check_password(PASSWORD)


def test_approval_lets_the_same_token_set_a_new_password(api, user, admin_user):
    filed = api.post(REQUEST, {'email': user.email}, format='json')
    token = filed.data['request_token']
    admin = APIClient()
    admin.force_authenticate(user=admin_user)
    request_id = admin.get(QUEUE).data[0]['id']

    approved = admin.post(f'{QUEUE}{request_id}/approve/')
    assert approved.status_code == 200
    assert approved.data['status'] == 'approved'
    assert api.get(status_url(token)).data == {'status': 'approved'}

    confirm = api.post(
        CONFIRM,
        {'request_token': token, 'new_password': NEW_PASSWORD},
        format='json',
    )
    assert confirm.status_code == 200, confirm.data
    user.refresh_from_db()
    assert user.check_password(NEW_PASSWORD)
    assert api.get(status_url(token)).data == {'status': 'consumed'}
    assert admin.get(QUEUE).data == []
    login = api.post('/api/auth/login/', {'email': user.email, 'password': PASSWORD}, format='json')
    assert login.status_code == 401


def test_a_second_request_consumes_the_first_token(api, user):
    first = api.post(REQUEST, {'email': user.email}, format='json').data['request_token']
    second = api.post(REQUEST, {'email': user.email}, format='json').data['request_token']

    assert api.get(status_url(first)).data == {'status': 'consumed'}
    assert api.get(status_url(second)).data == {'status': 'pending'}


def _approve_only_open_request(admin_user):
    admin = APIClient()
    admin.force_authenticate(user=admin_user)
    request_id = admin.get(QUEUE).data[0]['id']
    approved = admin.post(f'{QUEUE}{request_id}/approve/')
    assert approved.status_code == 200, approved.data
    return admin


def test_a_second_password_reset_consumes_an_approved_password_token(api, user, admin_user):
    first = api.post(REQUEST, {'email': user.email}, format='json').data['request_token']
    _approve_only_open_request(admin_user)

    second = api.post(REQUEST, {'email': user.email}, format='json').data['request_token']

    assert api.get(status_url(first)).data == {'status': 'consumed'}
    assert api.get(status_url(second)).data == {'status': 'pending'}


def test_recovery_request_leaves_an_approved_password_reset(api, user, admin_user):
    token = api.post(REQUEST, {'email': user.email}, format='json').data['request_token']
    admin = _approve_only_open_request(admin_user)

    recovered = api.post(RECOVER, {'email': user.email}, format='json')

    assert recovered.status_code == 200, recovered.data
    assert api.get(status_url(token)).data == {'status': 'approved'}
    queue = admin.get(QUEUE).data
    assert [(row['purpose'], row['status']) for row in queue] == [
        ('password', 'approved'),
        ('authenticator', 'pending'),
    ]


def test_password_reset_leaves_an_approved_recovery_token(api, user, admin_user):
    token = api.post(RECOVER, {'email': user.email}, format='json').data['request_token']
    _approve_only_open_request(admin_user)

    reset = api.post(REQUEST, {'email': user.email}, format='json')

    assert reset.status_code == 200, reset.data
    assert api.get(status_url(token)).data == {'status': 'approved'}


def test_second_recovery_leaves_an_approved_recovery_token(api, user, admin_user):
    token = api.post(RECOVER, {'email': user.email}, format='json').data['request_token']
    _approve_only_open_request(admin_user)

    again = api.post(RECOVER, {'email': user.email}, format='json')

    assert again.status_code == 200, again.data
    assert api.get(status_url(token)).data == {'status': 'approved'}
    confirmed = api.post(RECOVER_CONFIRM, {'request_token': token}, format='json')
    assert confirmed.status_code == 200, confirmed.data
    assert api.get(status_url(again.data['request_token'])).data == {'status': 'pending'}


def test_second_recovery_consumes_a_pending_recovery_token(api, user):
    first = api.post(RECOVER, {'email': user.email}, format='json').data['request_token']
    second = api.post(RECOVER, {'email': user.email}, format='json').data['request_token']

    assert api.get(status_url(first)).data == {'status': 'consumed'}
    assert api.get(status_url(second)).data == {'status': 'pending'}


def test_password_reset_does_not_disable_mfa(api, user, admin_user, secret):
    filed = api.post(REQUEST, {'email': user.email}, format='json')
    admin = APIClient()
    admin.force_authenticate(user=admin_user)
    request_id = admin.get(QUEUE).data[0]['id']
    admin.post(f'{QUEUE}{request_id}/approve/')

    confirm = api.post(
        CONFIRM,
        {'request_token': filed.data['request_token'], 'new_password': NEW_PASSWORD},
        format='json',
    )

    assert confirm.status_code == 200, confirm.data
    user.refresh_from_db()
    assert user.mfa_enabled is True
    assert verify(user.totp_secret_encrypted, code_for(secret), user.pk)


def test_approved_authenticator_recovery_replaces_the_secret(api, user, admin_user, secret):
    filed = api.post(RECOVER, {'email': user.email}, format='json')
    assert filed.status_code == 200, filed.data
    token = filed.data['request_token']

    admin = APIClient()
    admin.force_authenticate(user=admin_user)
    row = admin.get(QUEUE).data[0]
    assert row['purpose'] == 'authenticator'
    assert 'secret' not in row
    approved = admin.post(f'{QUEUE}{row["id"]}/approve/')
    assert approved.data['purpose'] == 'authenticator'
    assert 'secret' not in approved.data

    confirmed = api.post(RECOVER_CONFIRM, {'request_token': token}, format='json')
    assert confirmed.status_code == 200, confirmed.data
    new_secret = confirmed.data['mfa']['secret']
    assert new_secret != secret

    user.refresh_from_db()
    assert user.mfa_enabled is False
    assert user.check_password(PASSWORD)
    blocked = api.post('/api/auth/login/', {'email': user.email, 'password': PASSWORD}, format='json')
    assert blocked.status_code == 403
    assert code(blocked) == 'mfa_enrolment_required'

    enrolled = api.post(
        ENROL,
        {'enrolment_token': confirmed.data['enrolment_token'], 'code': code_for(new_secret)},
        format='json',
    )
    assert enrolled.status_code == 200, enrolled.data
    user.refresh_from_db()
    assert user.mfa_enabled is True
    assert user.totp_secret_encrypted == new_secret
    assert verify(user.totp_secret_encrypted, code_for(secret), user.pk) is False


def test_an_expired_request_cannot_be_approved(api, user, admin_user):
    api.post(REQUEST, {'email': user.email}, format='json')
    row = PasswordResetRequest.objects.get(user=user)
    row.expires_at = timezone.now() - timedelta(seconds=1)
    row.save(update_fields=['expires_at'])

    admin = APIClient()
    admin.force_authenticate(user=admin_user)
    assert admin.get(QUEUE).data == []
    assert admin.post(f'{QUEUE}{row.id}/approve/').status_code == 404
