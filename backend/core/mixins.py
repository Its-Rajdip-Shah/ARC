"""View mixins shared across the ARC apps."""

from rest_framework.permissions import IsAuthenticated

from core.permissions import IsOwner


class UserScopedMixin:
    """Restrict a viewset to the requesting user's own rows (FR-03).

    Cross-user identifiers fall out of the queryset and surface as 404 rather
    than 403, so the API never confirms that another user's object exists.

    Set ``user_field`` when the owning user is reached through a relation, for
    example ``user_field = 'planning_item__user'`` on AssignmentDetail.

    ``IsOwner`` is the object-level backstop if a view ever resolves an object
    outside ``get_queryset``.
    """

    user_field = 'user'
    permission_classes = [IsAuthenticated, IsOwner]

    def get_queryset(self):
        queryset = super().get_queryset()
        # drf-spectacular instantiates views without a real request.
        if getattr(self, 'swagger_fake_view', False):
            return queryset.none()
        user = getattr(self.request, 'user', None)
        if not (user and user.is_authenticated):
            return queryset.none()
        return queryset.filter(**{self.user_field: user})

    def perform_create(self, serializer):
        if self.user_field == 'user':
            serializer.save(user=self.request.user)
        else:
            serializer.save()
