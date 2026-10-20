"""The two-step authentication flow (FR-01, FR-02, FR-03, FR-15).

Password and TOTP are separate requests, and the only thing linking them is a
short-lived mfa_pending token. That token names a real user and is validly
signed, so the project-wide authentication class refuses it everywhere except
the one endpoint below that expects it in the request body.
"""
from django.core.cache import cache
from django.db import transaction
from django.contrib.auth import get_user_model
from django.contrib.auth.signals import user_logged_in
from django.utils import timezone
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, AuthenticationFailed, PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.tokens import RefreshToken
from planning.models import SchedulingState

from . import password_reset, totp
from .authentication import revoke_access_token
from .login_protection import (
    check_login_cooldown,
    record_failed_login,
    clear_failed_logins,
)
from .serializers import (
    LoginSerializer,
    LogoutSerializer,
    PasswordChangeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    AuthenticatorRecoveryConfirmSerializer,
    MFAEnrolConfirmSerializer,
    MFAVerifySerializer,
    RegisterSerializer,
    TimeZoneUpdateSerializer,
    UserSerializer,
)
from .tokens import FULL_ACCESS_SCOPE, MFAEnrolmentToken, MFAPendingToken

User = get_user_model()


def _enrolment_payload(email, secret, token):
    uri = totp.provisioning_uri(email, secret)
    return {
        'enrolment_token': str(token),
        'mfa': {
            'secret': secret,
            'provisioning_uri': uri,
            'qr_png_base64': totp.qr_png_base64(uri),
        },
    }


def _enrolment_body(user):
    secret = totp.generate_secret()
    enrolment = MFAEnrolmentToken.for_user(user)
    enrolment['secret'] = secret
    # Confirm will only store a secret when this row exists. A lookalike
    # response for an unknown password has no row, so it cannot attach.
    cache.set(
        f'arc:enrol-bind:{enrolment["jti"]}',
        user.pk,
        timeout=int(MFAEnrolmentToken.lifetime.total_seconds()),
    )
    return _enrolment_payload(user.email, secret, enrolment)


def _decoy_registration(email):
    """Same shape as a new signup, bound to no account."""
    secret = totp.generate_secret()
    last_pk = User.objects.order_by('-pk').values_list('pk', flat=True).first() or 0
    token = MFAEnrolmentToken()
    token[api_settings.USER_ID_CLAIM] = last_pk + 1
    token['secret'] = secret
    return {
        'user': {
            'id': last_pk + 1,
            'email': email,
            'is_admin': False,
            'is_locked': False,
            'mfa_enabled': False,
            'created_at': serializers.DateTimeField().to_representation(timezone.now()),
            'last_login': None,
            'time_zone': None,
        },
        **_enrolment_payload(email, secret, token),
    }


class ResetNotReadyResponse(APIException):
    status_code = 400
    default_detail = (
        'This reset is not ready. Ask an administrator to approve it, or start again.'
    )
    default_code = 'reset_not_ready'


def _issue_token_pair(user):
    refresh = RefreshToken.for_user(user)
    # Copied onto every access token derived from this refresh token, so a
    # refreshed session keeps its scope without re-running the MFA step.
    refresh['scope'] = FULL_ACCESS_SCOPE
    refresh['is_admin'] = user.is_admin
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


def _parse(token_class, raw, expired_code):
    try:
        return token_class(raw)
    except TokenError:
        raise AuthenticationFailed(
            'This token is invalid or has expired. Please start again.',
            code=expired_code,
        )


class PublicAuthView(APIView):
    """Base for the endpoints that run before a session exists.

    They register no authenticator on purpose: a client may still be holding a
    stale access token, and that must not stop it logging in again. DRF
    downgrades a 401 to 403 when a view has no authenticator to name in a
    WWW-Authenticate header, so the header is supplied here to keep the
    status codes honest.
    """

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'auth'

    def get_authenticate_header(self, request):
        return 'Bearer realm="api"'


class RegisterView(PublicAuthView):
    """POST /api/auth/register/ (FR-01)."""

    @extend_schema(
        request=RegisterSerializer,
        responses={
            201: inline_serializer(
                'RegisterResponse',
                {
                    'user': UserSerializer(),
                    'enrolment_token': serializers.CharField(),
                    'mfa': inline_serializer(
                        'MFAEnrolment',
                        {
                            'secret': serializers.CharField(),
                            'provisioning_uri': serializers.CharField(),
                            'qr_png_base64': serializers.CharField(),
                        },
                    ),
                },
            )
        },
    )
    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data['email']
        password = serializer.validated_data['password']
        flavour = serializer.validated_data['scheduler_flavour']

        existing = User.objects.filter(email__iexact=email).first()
        if existing is not None and not existing.check_password(password):
            return Response(_decoy_registration(email), status=status.HTTP_201_CREATED)
        if existing is not None and existing.mfa_enabled:
            raise serializers.ValidationError({
                'email': 'Sign in instead. This account is already set up.',
            })

        with transaction.atomic():
            user = existing
            if user is None:
                user = User.objects.create_user(email=email, password=password)
            SchedulingState.objects.update_or_create(
                user=user,
                defaults={'scheduler_flavour': flavour},
            )

        # The secret stays in the signed token until the authenticator is
        # confirmed. Submitting the same email and password again replaces
        # that token, so closing the tab does not burn the address.
        return Response(
            {'user': UserSerializer(user).data, **_enrolment_body(user)},
            status=status.HTTP_201_CREATED,
        )


class MFAEnrolConfirmView(PublicAuthView):
    """POST /api/auth/mfa/enroll/confirm/ (FR-01)."""

    @extend_schema(
        request=MFAEnrolConfirmSerializer,
        responses=inline_serializer(
            'MFAEnrolConfirmResponse',
            {'enrolled': serializers.BooleanField(), 'user': UserSerializer()},
        ),
    )
    def post(self, request):
        serializer = MFAEnrolConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = _parse(
            MFAEnrolmentToken,
            serializer.validated_data['enrolment_token'],
            'enrolment_token_invalid',
        )
        bound_pk = cache.get(f'arc:enrol-bind:{token["jti"]}')
        secret = token.get('secret')
        code = serializer.validated_data['code']
        if bound_pk is None:
            if not totp.verify(secret, code, user_id=token['jti']):
                raise AuthenticationFailed('That code is not valid.', code='invalid_totp')
            return Response({
                'enrolled': True,
                'user': {
                    'id': token.get(api_settings.USER_ID_CLAIM),
                    'email': None,
                    'is_admin': False,
                    'is_locked': False,
                    'mfa_enabled': True,
                    'created_at': None,
                    'last_login': None,
                    'time_zone': None,
                },
            })

        user = User.objects.filter(pk=bound_pk).first()
        if user is None:
            raise AuthenticationFailed('That code is not valid.', code='invalid_totp')
        if user.mfa_enabled:
            raise PermissionDenied('MFA is already set up for this account.',
                                   code='mfa_already_enrolled')

        if not totp.verify(secret, code, user.pk):
            raise AuthenticationFailed('That code is not valid.', code='invalid_totp')

        user.totp_secret_encrypted = secret
        user.save(update_fields=['totp_secret_encrypted'])

        return Response({'enrolled': True, 'user': UserSerializer(user).data})


class LoginView(PublicAuthView):
    """POST /api/auth/login/ - step one (FR-02)."""

    require_admin = False
    throttle_scope = 'auth_strict'

    @extend_schema(
        request=LoginSerializer,
        responses=inline_serializer(
            'LoginResponse',
            {
                'mfa_required': serializers.BooleanField(),
                'mfa_token': serializers.CharField(help_text='Valid for 5 minutes.'),
            },
        ),
    )
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = User.objects.normalize_email(serializer.validated_data['email'])

        # Block further attempts during the temporary cool-down.
        check_login_cooldown(email)

        user = User.objects.filter(email__iexact=email).first()

        # Count failed attempts for both existing and unknown email addresses.
        # Return the same error to avoid revealing whether an account exists.
        if user is None or not user.check_password(serializer.validated_data['password']):
            record_failed_login(email)
            raise AuthenticationFailed(
                'Incorrect email address or password.',
                code='invalid_credentials',
            )

        if self.require_admin and not user.is_admin:
            raise PermissionDenied('This account is not an administrator.',
                                   code='not_an_administrator')

        if user.is_locked:
            raise PermissionDenied('This account has been locked by an administrator.',
                                   code='account_locked')

        if not user.mfa_enabled:
            raise PermissionDenied(
                'Finish setting up multi-factor authentication first. '
                'Sign up again with the same email and password.',
                code='mfa_enrolment_required',
            )

        pending = MFAPendingToken.for_user(user)
        pending['admin_login'] = self.require_admin
        return Response({'mfa_required': True, 'mfa_token': str(pending)})


class AdminLoginView(LoginView):
    """POST /api/auth/admin/login/ - the separate administrator entry point
    required by FR-15."""

    require_admin = True


class MFAVerifyView(PublicAuthView):
    """POST /api/auth/login/mfa/ - step two (FR-02)."""

    require_admin = False
    throttle_scope = 'auth_strict'

    @extend_schema(
        request=MFAVerifySerializer,
        responses=inline_serializer(
            'TokenPairResponse',
            {
                'access': serializers.CharField(),
                'refresh': serializers.CharField(),
                'user': UserSerializer(),
            },
        ),
    )
    def post(self, request):
        serializer = MFAVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        token = _parse(
            MFAPendingToken,
            serializer.validated_data['mfa_token'],
            'mfa_token_invalid',
        )
        user = User.objects.filter(pk=token.get('user_id')).first()
        if user is None:
            raise AuthenticationFailed('User not found.', code='user_not_found')
        check_login_cooldown(user.email)

        # An administrator token must not be redeemable on the ordinary
        # endpoint, or the other way round.
        if bool(token.get('admin_login')) != self.require_admin:
            raise PermissionDenied('This token belongs to a different login flow.',
                                   code='wrong_login_flow')

        if self.require_admin and not user.is_admin:
            raise PermissionDenied('This account is not an administrator.',
                                   code='not_an_administrator')

        # Re-checked here because an administrator may have locked the account
        # during the few minutes the mfa_token is alive.
        if user.is_locked:
            raise PermissionDenied('This account has been locked by an administrator.',
                                   code='account_locked')

        if not totp.verify(user.totp_secret_encrypted, serializer.validated_data['code'], user.pk):
            record_failed_login(user.email)
            raise AuthenticationFailed(
                'That code is not valid.',
                code='invalid_totp',
            )

        clear_failed_logins(user.email)
        # Updates last_login, which FR-16's active-user count reads.
        user_logged_in.send(sender=user.__class__, request=request, user=user)

        return Response({**_issue_token_pair(user), 'user': UserSerializer(user).data})


class AdminMFAVerifyView(MFAVerifyView):
    """POST /api/auth/admin/login/mfa/ (FR-15)."""

    require_admin = True


class LogoutView(PublicAuthView):
    """POST /api/auth/logout/ - blacklists the refresh token.

    The refresh token is the credential: logout must work even when the access
    token has already expired, otherwise a client cannot revoke a session.
    """

    throttle_scope = 'auth'

    @extend_schema(request=LogoutSerializer, responses={205: None})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            RefreshToken(serializer.validated_data['refresh']).blacklist()
        except TokenError:
            raise AuthenticationFailed('That refresh token is not valid.',
                                       code='invalid_refresh_token')
        header = request.META.get('HTTP_AUTHORIZATION', '')
        if header.lower().startswith('bearer '):
            revoke_access_token(header.split(' ', 1)[1].strip())
        return Response(status=status.HTTP_205_RESET_CONTENT)


class MeView(APIView):
    """GET/PATCH /api/auth/me/ - the signed-in account."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=UserSerializer)
    def get(self, request):
        return Response(UserSerializer(request.user).data)

    @extend_schema(request=TimeZoneUpdateSerializer, responses=UserSerializer)
    def patch(self, request):
        serializer = TimeZoneUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        request.user.time_zone = serializer.validated_data['time_zone']
        request.user.save(update_fields=['time_zone'])
        return Response(UserSerializer(request.user).data)


class PasswordChangeView(APIView):
    """POST /api/auth/password/change/ — the signed-in account's own password."""

    permission_classes = [IsAuthenticated]

    @extend_schema(request=PasswordChangeSerializer, responses={200: None})
    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        password_reset.change_password(request.user, serializer.validated_data['new_password'])
        return Response({
            'detail': 'Password updated.',
            **_issue_token_pair(request.user),
        })


class PasswordResetRequestView(PublicAuthView):
    """POST /api/auth/password-reset/ — ask an administrator to approve a reset."""

    purpose = 'password'

    @extend_schema(request=PasswordResetRequestSerializer, responses={200: None})
    def post(self, request):
        serializer = PasswordResetRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = password_reset.request_reset(
            serializer.validated_data['email'],
            purpose=self.purpose,
        )
        return Response({
            'detail': password_reset.REQUEST_DETAIL,
            'request_token': token,
        })


class AuthenticatorRecoveryRequestView(PasswordResetRequestView):
    """POST /api/auth/mfa/recover/ — same queue, for a lost authenticator."""

    purpose = 'authenticator'


class PasswordResetStatusView(PublicAuthView):
    """GET /api/auth/password-reset/status/<token>/ — pending, approved, or finished."""

    throttle_scope = 'password_reset'

    def get(self, request, token):
        return Response({'status': password_reset.status_for(token)})


class PasswordResetConfirmView(PublicAuthView):
    """POST /api/auth/password-reset/confirm/ — the approved browser sets the password."""

    @extend_schema(request=PasswordResetConfirmSerializer, responses={200: None})
    def post(self, request):
        serializer = PasswordResetConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            password_reset.confirm_reset(
                serializer.validated_data['request_token'],
                serializer.validated_data['new_password'],
            )
        except password_reset.ResetNotReady:
            raise ResetNotReadyResponse()
        except password_reset.PasswordRejected as exc:
            raise ValidationError({'new_password': exc.messages})
        return Response({'detail': 'Password updated.'})


class AuthenticatorRecoveryConfirmView(PublicAuthView):
    """POST /api/auth/mfa/recover/confirm/ — approved browser receives a new QR."""

    @extend_schema(request=AuthenticatorRecoveryConfirmSerializer, responses={200: None})
    def post(self, request):
        serializer = AuthenticatorRecoveryConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            user = password_reset.confirm_authenticator_recovery(
                serializer.validated_data['request_token'],
            )
        except password_reset.ResetNotReady:
            raise ResetNotReadyResponse()
        return Response(_enrolment_body(user))
