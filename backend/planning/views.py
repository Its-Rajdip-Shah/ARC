"""The planning API: Text View, Priority View, Timeline, Overdue and Marks.

Every viewset here is user-scoped through core.mixins.UserScopedMixin, so a
cross-user identifier falls out of the queryset and surfaces as 404 rather
than 403 (FR-03). The business rules live in planning/services and are only
called from here.
"""

from datetime import datetime, timedelta
from decimal import Decimal

from django.core.cache import cache
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import (
    OpenApiParameter,
    extend_schema,
    extend_schema_view,
    inline_serializer,
)
from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.filters import SearchFilter
from rest_framework.response import Response
from rest_framework.views import APIView

from core.mixins import UserScopedMixin
from planning import queries
from planning.models import AssignmentDetail, ItemType, PlanningItem, Tag, Timezone
from planning.serializers import (
    AssignmentDetailSerializer,
    CompleteSerializer,
    MarkGroupSerializer,
    MarksReorderSerializer,
    MoveSerializer,
    OverdueEntrySerializer,
    PlanningItemSerializer,
    PlanningItemTreeSerializer,
    PriorityRowSerializer,
    ReorderSerializer,
    RootRefSerializer,
    TagSerializer,
    TimelineItemSerializer,
    TimezoneSerializer,
)
from planning.services import hierarchy, overdue, priority, scheduling

#: How long to trust that today's adaptive sweep has already run for a user.
ROLL_FORWARD_CACHE_SECONDS = 60 * 60 * 12


def _as_400(exc):
    """Re-raise a service-level Django ValidationError as a DRF 400."""
    return ValidationError({'detail': exc.messages})


def _date_param(request, name, default):
    raw = request.query_params.get(name)
    if not raw:
        return default
    try:
        return datetime.strptime(raw, '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError({name: 'Expected a date as YYYY-MM-DD.'})


def _root_lookup(user):
    """{item_id: root descriptor} for every item the user owns.

    The Priority, Timeline and Marks views all group rows under the root of
    their tree. Resolving that per row would be a query each; this loads the
    id/parent/title columns once and walks them in memory instead.
    """
    parents = queries.parent_map(user.pk)
    meta = {
        pk: {'id': pk, 'title': title, 'item_type': item_type}
        for pk, title, item_type in PlanningItem.objects.filter(user=user).values_list(
            'id', 'title', 'item_type'
        )
    }
    return {pk: meta[queries.root_of(parents, pk)] for pk in meta}


def ensure_scheduled(user):
    """Run the FR-11 sweep at most once a day per user.

    A scheduled job is the intended driver, but a deployment without one
    should still show sensible adaptive dates, so the first timeline read of
    the day catches up. The cache key keeps that cost off every other request.
    """
    today = timezone.localdate()
    key = f'arc:rolled:{user.pk}:{today.isoformat()}'
    if cache.get(key):
        return
    scheduling.roll_forward_adaptive(user, today)
    cache.set(key, True, ROLL_FORWARD_CACHE_SECONDS)


class TagViewSet(UserScopedMixin, viewsets.ModelViewSet):
    """FR-07, FR-08: /api/planning/tags/"""

    serializer_class = TagSerializer
    queryset = Tag.objects.all()


class TimezoneViewSet(UserScopedMixin, viewsets.ModelViewSet):
    """FR-13: /api/planning/timezones/"""

    serializer_class = TimezoneSerializer
    queryset = Timezone.objects.all()


class AssignmentDetailViewSet(UserScopedMixin, viewsets.ModelViewSet):
    """FR-14: direct edits to one assessment's weighting and mark.

    Keyed by planning_item_id, since AssignmentDetail shares its primary key
    with the item it describes.
    """

    serializer_class = AssignmentDetailSerializer
    queryset = AssignmentDetail.objects.select_related('planning_item')
    user_field = 'planning_item__user'
    http_method_names = ['get', 'put', 'patch', 'head', 'options']


@extend_schema_view(
    list=extend_schema(
        description='Flat list of planning items.',
        parameters=[
            OpenApiParameter('type', enum=[choice.value for choice in ItemType]),
            OpenApiParameter('completed', OpenApiTypes.BOOL),
            OpenApiParameter(
                'root', OpenApiTypes.INT,
                description="Restrict to one root's subtree, the root included.",
            ),
            OpenApiParameter('from', OpenApiTypes.DATE, description='Requires "to".'),
            OpenApiParameter('to', OpenApiTypes.DATE, description='Requires "from".'),
        ],
    )
)
class PlanningItemViewSet(UserScopedMixin, viewsets.ModelViewSet):
    """FR-06 to FR-08: /api/planning/items/"""

    serializer_class = PlanningItemSerializer
    queryset = PlanningItem.objects.all()
    filter_backends = [SearchFilter]
    search_fields = ['title', 'description', 'tags__name']

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .select_related('assignment_detail', 'parent')
            .prefetch_related('tags')
        )
        params = self.request.query_params

        if (item_type := params.get('type')):
            queryset = queryset.filter(item_type=item_type.upper())

        completed = params.get('completed')
        if completed is not None:
            if completed.lower() in {'true', '1'}:
                queryset = queryset.filter(is_completed=True)
            elif completed.lower() in {'false', '0'}:
                queryset = queryset.filter(is_completed=False)

        if (root := params.get('root')):
            # One root's whole subtree, the root included.
            try:
                root_id = int(root)
            except ValueError:
                raise ValidationError({'root': 'Expected a planning item id.'})
            ids = queries.descendant_ids(self.request.user.pk, root_id)
            queryset = queryset.filter(pk__in=[root_id] + ids)

        start, end = params.get('from'), params.get('to')
        if start and end:
            queryset = queryset.in_window(
                _date_param(self.request, 'from', None),
                _date_param(self.request, 'to', None),
            )

        return queryset.distinct()

    def perform_destroy(self, instance):
        parent = instance.parent
        user = instance.user
        # Give the priority slot up before the row disappears, so the
        # remaining order stays dense (FR-09).
        priority.release_position(instance)
        instance.delete()
        hierarchy.reindex_siblings(user, parent)

    @extend_schema(
        responses=PlanningItemTreeSerializer(many=True),
        description='The whole hierarchy for the Text View, nested, in display order.',
    )
    @action(detail=False, methods=['get'])
    def tree(self, request):
        """FR-06: the indented Text View.

        One recursive CTE fixes order and depth, then one ORM query loads the
        rows. Nesting them in memory avoids the query per node that walking
        children relation by relation would cost.
        """
        rows = queries.tree_rows(request.user.pk)
        if not rows:
            return Response([])

        items = {
            item.pk: item
            for item in PlanningItem.objects.filter(pk__in=[row[0] for row in rows])
            .select_related('assignment_detail')
            .prefetch_related('tags')
        }

        roots = []
        for item_id, depth in rows:
            item = items[item_id]
            item.depth = depth
            item.child_nodes = []
            if item.parent_id is None:
                roots.append(item)
            else:
                items[item.parent_id].child_nodes.append(item)

        return Response(
            PlanningItemTreeSerializer(roots, many=True, context={'request': request}).data
        )

    @extend_schema(request=MoveSerializer, responses=PlanningItemSerializer)
    @action(detail=True, methods=['post'])
    def move(self, request, pk=None):
        """FR-06: re-parent, refusing any move that would close a cycle."""
        item = self.get_object()
        serializer = MoveSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        try:
            hierarchy.set_parent(item, serializer.validated_data['parent_id'])
        except DjangoValidationError as exc:
            raise _as_400(exc)

        if (order := serializer.validated_data.get('sibling_order')):
            # Land on the requested position by numbering just below it, then
            # letting the reindex close the gaps.
            item.sibling_order = order
            item.save(update_fields=['sibling_order'])
            hierarchy.reindex_siblings(request.user, item.parent)

        item.refresh_from_db()
        return Response(self.get_serializer(item).data)

    @extend_schema(
        request=CompleteSerializer,
        responses=inline_serializer(
            'PlanningItemCompleteResponse',
            {
                'item': PlanningItemSerializer(),
                'affected_ids': serializers.ListField(child=serializers.IntegerField()),
            },
        ),
    )
    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """FR-08: completing a parent completes everything beneath it."""
        item = self.get_object()
        serializer = CompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data['completed']:
            affected = hierarchy.complete_subtree(item)
        else:
            hierarchy.reopen(item)
            affected = [item.pk]

        item.refresh_from_db()
        return Response({
            'item': self.get_serializer(item).data,
            'affected_ids': affected,
        })


def _priority_rows(user, items):
    if not items:
        return []
    roots = _root_lookup(user)
    rows = [
        {
            'priority_position': item.priority_position,
            'id': item.pk,
            'title': item.title,
            'item_type': item.item_type,
            'duration_category': item.duration_category,
            'due_date': item.due_date,
            'scheduled_date': item.scheduled_date,
            'root': roots[item.pk],
        }
        for item in items
    ]
    return PriorityRowSerializer(rows, many=True).data


class PriorityView(APIView):
    """FR-09: GET /api/planning/priority/"""

    @extend_schema(responses=PriorityRowSerializer(many=True))
    def get(self, request):
        return Response(_priority_rows(request.user, list(priority.ordered(request.user))))


class PriorityReorderView(APIView):
    """FR-09: POST /api/planning/priority/reorder/"""

    @extend_schema(request=ReorderSerializer, responses=PriorityRowSerializer(many=True))
    def post(self, request):
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            items = priority.reorder(
                request.user,
                serializer.validated_data['item_id'],
                serializer.validated_data['new_position'],
            )
        except DjangoValidationError as exc:
            raise _as_400(exc)
        # The whole renumbered list comes back, so an optimistic client can
        # reconcile against it instead of guessing what moved.
        return Response(_priority_rows(request.user, items))


class TimelineView(APIView):
    """FR-10, FR-11, FR-13: GET /api/planning/timeline/?from=&to="""

    @extend_schema(
        parameters=[
            OpenApiParameter('from', OpenApiTypes.DATE, description='Defaults to 7 days ago.'),
            OpenApiParameter('to', OpenApiTypes.DATE, description='Defaults to 28 days ahead.'),
        ],
        responses=inline_serializer(
            'TimelineResponse',
            {
                'range': serializers.DictField(child=serializers.DateField()),
                'timezones': TimezoneSerializer(many=True),
                'groups': inline_serializer(
                    'TimelineGroup',
                    {
                        'root': RootRefSerializer(),
                        'items': TimelineItemSerializer(many=True),
                    },
                    many=True,
                ),
            },
        ),
    )
    def get(self, request):
        ensure_scheduled(request.user)

        today = timezone.localdate()
        start = _date_param(request, 'from', today - timedelta(days=7))
        end = _date_param(request, 'to', today + timedelta(days=28))
        if end < start:
            raise ValidationError({'to': 'The end of the range precedes its start.'})

        items = list(
            PlanningItem.objects.for_user(request.user)
            .actionable()
            .in_window(start, end)
            .order_by('id')
        )

        roots = _root_lookup(request.user)
        grouped = {}
        for item in items:
            root = roots[item.pk]
            grouped.setdefault(root['id'], (root, []))[1].append(item)

        groups = []
        for root, members in grouped.values():
            members.sort(key=lambda i: (i.due_date or i.scheduled_date, i.pk))
            groups.append({
                'root': root,
                'items': TimelineItemSerializer(members, many=True).data,
            })
        groups.sort(key=lambda group: group['root']['title'])

        zones = Timezone.objects.filter(
            user=request.user, start_date__lte=end, end_date__gte=start
        )

        return Response({
            'range': {'from': start.isoformat(), 'to': end.isoformat()},
            'timezones': TimezoneSerializer(zones, many=True).data,
            'groups': groups,
        })


class OverdueView(APIView):
    """FR-12: GET /api/planning/overdue/"""

    @extend_schema(
        responses=inline_serializer(
            'OverdueResponse',
            {
                'recent': OverdueEntrySerializer(many=True),
                'backlog': OverdueEntrySerializer(many=True),
            },
        ),
        description='Missed fixed deadlines, split into Recent (within 7 days) and Backlog.',
    )
    def get(self, request):
        buckets = overdue.classify(request.user, timezone.localdate())
        return Response({
            'recent': OverdueEntrySerializer(buckets['recent'], many=True).data,
            'backlog': OverdueEntrySerializer(buckets['backlog'], many=True).data,
        })


class MarksView(APIView):
    """FR-14: GET /api/planning/marks/, grouped by academic subject."""

    @extend_schema(responses=MarkGroupSerializer(many=True))
    def get(self, request):
        assignments = list(
            PlanningItem.objects.for_user(request.user)
            .filter(item_type=ItemType.ASSIGNMENT)
            .select_related('assignment_detail')
            .order_by('id')
        )
        if not assignments:
            return Response([])

        roots = _root_lookup(request.user)
        grouped = {}
        for item in assignments:
            root = roots[item.pk]
            grouped.setdefault(root['id'], (root, []))[1].append(item)

        groups = []
        for root, members in grouped.values():
            rows = []
            total_weight = Decimal('0')
            total_marks = Decimal('0')
            unmarked = 0

            for item in members:
                detail = getattr(item, 'assignment_detail', None)
                weight = detail.weight_percent if detail else None
                mark = detail.mark_achieved if detail else None

                if weight is not None:
                    total_weight += weight
                if mark is None:
                    # FR-14: unmarked is not zero, so it must not pull the
                    # running total down.
                    unmarked += 1
                else:
                    total_marks += mark

                rows.append({
                    'id': item.pk,
                    'title': item.title,
                    'weight_percent': weight,
                    'mark_achieved': mark,
                    'submission_url': detail.submission_url if detail else None,
                    'marks_position': detail.marks_position if detail else None,
                    'due_date': item.due_date,
                })

            rows.sort(key=lambda row: (row['marks_position'] is None,
                                       row['marks_position'] or 0,
                                       row['id']))
            groups.append({
                'root': root,
                'assessments': rows,
                'total_weight': total_weight,
                'total_marks': total_marks,
                'unmarked_count': unmarked,
            })

        groups.sort(key=lambda group: group['root']['title'])
        return Response(MarkGroupSerializer(groups, many=True).data)


class MarksReorderView(APIView):
    """FR-14: POST /api/planning/marks/reorder/"""

    @extend_schema(
        request=MarksReorderSerializer,
        responses=inline_serializer(
            'MarksReorderResponse', {'reordered': serializers.IntegerField()}
        ),
    )
    def post(self, request):
        serializer = MarksReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ordered_ids = serializer.validated_data['ordered_ids']

        details = {
            detail.planning_item_id: detail
            for detail in AssignmentDetail.objects.filter(
                planning_item__user=request.user, planning_item_id__in=ordered_ids
            )
        }
        missing = set(ordered_ids) - set(details)
        if missing:
            raise ValidationError(
                {'ordered_ids': f'Not your assessments: {sorted(missing)}'}
            )

        with transaction.atomic():
            changed = []
            for position, item_id in enumerate(ordered_ids, start=1):
                detail = details[item_id]
                if detail.marks_position != position:
                    detail.marks_position = position
                    changed.append(detail)
            if changed:
                AssignmentDetail.objects.bulk_update(changed, ['marks_position'])

        return Response({'reordered': len(ordered_ids)})
