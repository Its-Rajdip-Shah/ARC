"""Permission classes shared across the ARC apps."""

from rest_framework.permissions import BasePermission


def _resolve_owner(obj, field):
    """Walk ``user`` or ``planning_item__user``-style ownership paths."""
    current = obj
    for part in field.replace('__', '.').split('.'):
        current = getattr(current, part, None)
        if current is None:
            return None
    return current


class IsOwner(BasePermission):
    """Allow access only to objects belonging to the requesting user.

    Queryset scoping (see core.mixins.UserScopedMixin) is the primary FR-03
    control; this is the object-level backstop for views that look objects up
    outside a scoped queryset.
    """

    message = 'You do not have access to this object.'

    owner_field = 'user'

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if obj == user:
            return True
        field = (
            getattr(view, 'owner_field', None)
            or getattr(view, 'user_field', None)
            or self.owner_field
        )
        return _resolve_owner(obj, field) == user


class IsAdminAccount(BasePermission):
    """Allow access only to accounts flagged as ARC administrators (FR-15, FR-16).

    This checks the ERD's ``is_admin`` column rather than Django's ``is_staff``.
    """

    message = 'Administrator permission is required.'

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'is_admin', False))
