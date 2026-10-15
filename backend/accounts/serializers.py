"""Request and response shapes for the authentication endpoints."""

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from planning.models import SchedulingState

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    """The account as the frontend sees it. Never exposes the TOTP secret."""

    mfa_enabled = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ['id', 'email', 'is_admin', 'is_locked', 'mfa_enabled', 'created_at', 'last_login', 'time_zone']
        read_only_fields = fields


class TimeZoneUpdateSerializer(serializers.Serializer):
    """Only the authenticated account's geographical timezone is writable."""

    time_zone = serializers.CharField(max_length=64, allow_null=True, trim_whitespace=False)

    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = set(data) - {'time_zone'}
            if unknown:
                raise serializers.ValidationError({key: 'This field is not writable.' for key in unknown})
        return super().to_internal_value(data)

    def validate_time_zone(self, value):
        if value is None:
            return None
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError):
            raise serializers.ValidationError('Enter a valid IANA timezone identifier.')
        return value


class RegisterSerializer(serializers.Serializer):
    """FR-01: a unique, well-formed email and a password that passes the
    configured validators."""

    email = serializers.EmailField(max_length=255)
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    scheduler_flavour = serializers.ChoiceField(
    choices=SchedulingState.SchedulerFlavour.choices,
    required=True,
    )

    def validate_email(self, value):
        value = User.objects.normalize_email(value)
        # An unfinished signup (no TOTP yet) may be submitted again. The view
        # checks the password before it reuses that row.
        existing = User.objects.filter(email__iexact=value).first()
        if existing is not None and existing.mfa_enabled:
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def validate_password(self, value):
        validate_password(value)
        return value


class MFAEnrolConfirmSerializer(serializers.Serializer):
    enrolment_token = serializers.CharField()
    code = serializers.CharField(min_length=6, max_length=6)


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})


class MFAVerifySerializer(serializers.Serializer):
    mfa_token = serializers.CharField()
    code = serializers.CharField(min_length=6, max_length=6)


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()
