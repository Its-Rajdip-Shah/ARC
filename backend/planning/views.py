"""The planning API: Text View, Priority View, Timeline, Overdue and Marks.

Every viewset here is user-scoped through core.mixins.UserScopedMixin, so a
cross-user identifier falls out of the queryset and surfaces as 404 rather
than 403 (FR-03). The business rules live in planning/services and are only
called from here.
"""

from collections import Counter
from datetime import datetime, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.shortcuts import get_object_or_404
from planning.services.calendar_dates import user_local_date
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
from planning.models import (
    AssignmentDetail,
    DurationCategory,
    ItemType,
    PlanningDependency,
    PlanningItem,
    SchedulerAllocation,
    SchedulingOverload,
    SchedulingState,
    Tag,
    Timezone,
)
from planning.serializers import (
    AssignmentDetailSerializer,
    ScheduleMoveSerializer,
    ScheduleAnchorSerializer,
    ScheduleResultSerializer,
    ScheduleReplaceSerializer,
    ScheduleOverloadSerializer,
    SchedulerRuntimeSerializer,
    SchedulerSettingsSerializer,
    SchedulerSettingsUpdateSerializer,
    StudyPlanEditSerializer,
    StudyPlanRequestSerializer,
    CompleteSerializer,
    FocusCurrentSerializer,
    FocusAnchorSerializer,
    FocusAnchorBatchSerializer,
    FocusDoTodaySerializer,
    FocusProjectionSerializer,
    FocusReprioritiseSerializer,
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
    TimelineNavigationItemSerializer,
    TimezoneSerializer,
)
from planning.services import dependencies, focus, hierarchy, leaf_order_sync, overdue, priority, progress, scheduling
from planning.services.study_plan import load_plan, present, request_plan, save_edited_plan
from planning.services import deletion, history, lifecycle
from planning.services.focus_buckets import focus_bucket_key


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
        for pk, title, item_type in PlanningItem.objects.visible().filter(user=user).values_list(
            'id', 'title', 'item_type'
        )
    }
    return {pk: meta[queries.root_of(parents, pk)] for pk in meta}


def ensure_scheduled(user):
    """Re-evaluate current capacity and eligibility; same-day changes matter."""
    return scheduling.daily_schedule(user, user_local_date(user))


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

    @action(detail=True, methods=['get'])
    def dependency_graph(self, request, pk=None):
        """Return the visible dependency component containing this item.

        Dependency edges are deliberately traversed independently of the
        planning hierarchy.  The two bulk queries avoid a request/query per
        graph hop and the user filters are a second isolation boundary beyond
        ``get_object``'s scoped queryset.
        """
        item = self.get_object()
        edges = list(
            PlanningDependency.objects.filter(
                prerequisite__user=request.user,
                dependent__user=request.user,
                prerequisite__is_deleted=False,
                dependent__is_deleted=False,
            ).values_list('prerequisite_id', 'dependent_id')
        )
        neighbours = {}
        for prerequisite_id, dependent_id in edges:
            neighbours.setdefault(prerequisite_id, set()).add(dependent_id)
            neighbours.setdefault(dependent_id, set()).add(prerequisite_id)

        component = {item.pk}
        frontier = [item.pk]
        while frontier:
            current = frontier.pop()
            for neighbour in neighbours.get(current, ()):
                if neighbour not in component:
                    component.add(neighbour)
                    frontier.append(neighbour)

        component_edges = [
            {'prerequisite_id': prerequisite_id, 'dependent_id': dependent_id}
            for prerequisite_id, dependent_id in edges
            if prerequisite_id in component and dependent_id in component
        ]
        # Fetch the user's visible hierarchy once. The graph stays a
        # dependency component; this map supplies real parent ancestry with
        # no query per ancestor.
        item_rows = list(
            PlanningItem.objects.visible().filter(user=request.user).values(
                'id', 'parent_id', 'title', 'description', 'item_type'
            )
        )
        items_by_id = {row['id']: row for row in item_rows}

        def ancestry_for(item_id):
            ancestry = []
            seen = {item_id}
            parent_id = items_by_id.get(item_id, {}).get('parent_id')
            while parent_id and parent_id not in seen:
                seen.add(parent_id)
                parent = items_by_id.get(parent_id)
                # Deleted or inaccessible parents must not leak through this endpoint.
                if parent is None:
                    break
                ancestry.append({'id': parent['id'], 'title': parent['title']})
                parent_id = parent['parent_id']
            return list(reversed(ancestry))

        nodes = [
            {
                'id': row['id'],
                'title': row['title'],
                # The persisted field is nullable for legacy items, whereas
                # the graph's presentation contract is always text.
                'description': row['description'] or '',
                'item_type': row['item_type'],
                'ancestry': ancestry_for(row['id']),
            }
            for row in item_rows
            if row['id'] in component
        ]
        return Response({
            'task_id': item.pk,
            'nodes': nodes,
            'edges': sorted(
                component_edges,
                key=lambda edge: (edge['prerequisite_id'], edge['dependent_id']),
            ),
        })

    @action(detail=True, methods=['get', 'post', 'delete'])
    @transaction.atomic
    def prerequisites(self, request, pk=None):
        """Independent dependency edits; every mutation uses the canonical service."""
        if request.method != 'GET':
            priority._lock(request.user)
        item = self.get_object()
        if request.method != 'GET':
            payload = serializers.Serializer(data=request.data)
            payload.fields['prerequisite_id'] = serializers.IntegerField(min_value=1)
            payload.is_valid(raise_exception=True)
            prerequisite = get_object_or_404(
                PlanningItem.objects.filter(user=request.user, is_deleted=False),
                pk=payload.validated_data['prerequisite_id'],
            )
            present = dependencies.prerequisites_for(item).filter(pk=prerequisite.pk).exists()
            requested_present = request.method == 'POST'
            if present != requested_present:
                try:
                    operation = dependencies.add if requested_present else dependencies.remove
                    operation(prerequisite, item)
                except DjangoValidationError as exc:
                    raise _as_400(exc)
                state = {'prerequisite_id': prerequisite.pk, 'dependent_id': item.pk}
                history.record_checkpoint(
                    request.user, 'UPDATE',
                    {'dependency': {**state, 'present': present}},
                    {'dependency': {**state, 'present': requested_present}},
                )
        prerequisites = dependencies.prerequisites_for(item).filter(
            user=request.user, is_deleted=False,
        )
        return Response(self.get_serializer(prerequisites, many=True).data)

    def get_queryset(self):
        queryset = (
            super()
            .get_queryset()
            .visible()
            # IsOwner reads ``item.user`` after get_object(). Loading the
            # owner with the detail row preserves that isolation backstop
            # without issuing a separate query for every detail action.
            .select_related('assignment_detail', 'parent', 'user')
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

    @transaction.atomic
    def perform_create(self, serializer):
        # Creating an item may change the global priority ordering.
        priority_before = history.capture_priority(self.request.user, include_unpositioned=True)

        items_before = history.capture_items(self.request.user, PlanningItem.objects.filter(user=self.request.user).values_list("pk", flat=True))
        instance = serializer.save(user=self.request.user)

        item_after = history.capture_items(
            self.request.user,
            PlanningItem.objects.filter(user=self.request.user).values_list("pk", flat=True),
        )
        priority_after = history.capture_priority(self.request.user, include_unpositioned=True)

        history.record_checkpoint(
            self.request.user,
            'CREATE',
            {
                'delete_ids': [instance.pk],
                'items': items_before,
                'priority': priority_before,
            },
            {
                'items': item_after,
                'priority': priority_after,
            },
        )

    @transaction.atomic
    def perform_update(self, serializer):
        instance = serializer.instance

        before = history.capture_items(
            self.request.user,
            PlanningItem.objects.filter(user=self.request.user).values_list("pk", flat=True),
        )

        updated = serializer.save()

        after = history.capture_items(
            self.request.user,
            PlanningItem.objects.filter(user=self.request.user).values_list("pk", flat=True),
        )

        history.record_checkpoint(
            self.request.user,
            'UPDATE',
            {'items': before},
            {'items': after},
        )

    @transaction.atomic
    def perform_destroy(self, instance):
        parent = instance.parent
        parent_id = instance.parent_id
        user = instance.user

        # Resolve the complete subtree BEFORE hiding anything.
        subtree_ids = [
            instance.pk,
            *queries.descendant_ids(user.pk, instance.pk),
        ]

        siblings_before = history.capture_siblings(user, parent_id)
        priority_before = history.capture_priority(user, include_unpositioned=True)

        # HTTP DELETE crosses the same validated lifecycle boundary as every
        # other ARC caller.  The service owns dependency suspension, durable
        # restoration context, priority/frontier reconciliation and scheduling.
        deletion.delete_subtree(instance)

        siblings_after = history.capture_siblings(user, parent_id)
        priority_after = history.capture_priority(user, include_unpositioned=True)

        history.record_checkpoint(
            user,
            'DELETE',
            {
                'soft_delete': {
                    'ids': subtree_ids,
                    'value': False,
                },
                'siblings': siblings_before,
                'priority': priority_before,
            },
            {
                'soft_delete': {
                    'ids': subtree_ids,
                    'value': True,
                },
                'siblings': siblings_after,
                'priority': priority_after,
            },
        )

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
    @transaction.atomic
    def move(self, request, pk=None):
        """FR-06: atomically move one subtree and optionally adopt following branches."""
        item = self.get_object()
        serializer = MoveSerializer(
            data=request.data,
            context={'request': request},
        )
        serializer.is_valid(raise_exception=True)

        priority_before = history.capture_priority(
            request.user,
            include_unpositioned=True,
        )

        old_parent_id = item.parent_id
        new_parent = serializer.validated_data['parent_id']
        new_parent_id = (
            new_parent.pk
            if new_parent is not None
            else None
        )

        adopt_children = list(
            serializer.validated_data.get(
                'adopt_child_ids',
                [],
            )
        )

        if any(
            child.pk == item.pk
            for child in adopt_children
        ):
            raise ValidationError({
                'adopt_child_ids':
                    'An item cannot adopt itself.',
            })

        affected_parent_ids = {
            old_parent_id,
            new_parent_id,
            item.pk,
            *(
                child.parent_id
                for child in adopt_children
            ),
        }

        siblings_before = []
        for parent_id in affected_parent_ids:
            siblings_before.extend(
                history.capture_siblings(
                    request.user,
                    parent_id,
                )
            )

        try:
            hierarchy.set_parent(
                item,
                new_parent,
                reconcile=False,
            )

            order = serializer.validated_data.get(
                'sibling_order'
            )

            if order is not None:
                item = hierarchy.set_sibling_order(
                    item,
                    order,
                )

            item.refresh_from_db()

            # Adopt following branch roots in the exact order supplied by
            # the frontend projection. Existing children remain before them.
            for child in adopt_children:
                child.refresh_from_db()

                if child.parent_id == item.pk:
                    continue

                hierarchy.set_parent(
                    child,
                    item,
                    reconcile=False,
                )

        except DjangoValidationError as exc:
            raise _as_400(exc)

        leaf_order_sync.from_planner(item)
        lifecycle.finish(request.user)
        item.refresh_from_db()

        siblings_after = []
        for parent_id in affected_parent_ids:
            siblings_after.extend(
                history.capture_siblings(
                    request.user,
                    parent_id,
                )
            )

        before = {
            'siblings':
                siblings_before,
        }

        after = {
            'siblings':
                siblings_after,
        }

        priority_after = history.capture_priority(
            request.user,
            include_unpositioned=True,
        )

        if priority_before != priority_after:
            before['priority'] = priority_before
            after['priority'] = priority_after

        history.record_checkpoint(
            request.user,
            'MOVE',
            before,
            after,
        )

        return Response(
            self.get_serializer(
                item,
            ).data
        )

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
    @transaction.atomic
    def complete(self, request, pk=None):
        """FR-08: completing a parent completes everything beneath it."""
        item = self.get_object()
        serializer = CompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data['completed']:
            affected_ids = [
                item.pk,
                *queries.descendant_ids(request.user.pk, item.pk),
            ]
        else:
            affected_ids = [item.pk]

        items_before = history.capture_items(
            request.user,
            affected_ids,
        )
        priority_before = history.capture_priority(request.user, include_unpositioned=True)

        completed = serializer.validated_data[
            'completed'
        ]

        reschedule = serializer.validated_data[
            'reschedule'
        ]

        if completed:
            if reschedule:
                affected = hierarchy.complete_subtree(
                    item,
                )
            else:
                # Focus fast-path:
                #
                # Completion itself is canonical and must be committed
                # immediately, but Focus does not need to synchronously run
                # the expensive global optimiser before acknowledging the
                # user's checkbox action.
                #
                # Preserve everybody else's disposable schedule. Remove only
                # proposal state belonging to work that just became complete.
                affected = hierarchy.complete_subtree(
                    item,
                    reconcile=False,
                )

                lifecycle.validate_graph(
                    request.user,
                )

                priority.reconcile(
                    request.user,
                )

                PlanningItem.objects.filter(
                    user=request.user,
                    pk__in=affected,
                ).update(
                    scheduled_date=None,
                    execution_rank=None,
                )

                SchedulerAllocation.objects.filter(
                    item__user=request.user,
                    item_id__in=affected,
                ).delete()

                focus.reconcile_current(
                    request.user,
                )
        else:
            # Splittable work carries canonical confirmed progress.
            # Its inverse is DUR-009's local progress reversal rather than
            # bypassing hierarchy.reopen's invariant.
            latest_segment = (
                item.progress_segments
                .order_by(
                    '-completed_at',
                    '-pk',
                )
                .first()
            )

            if (
                item.percent_completed
                and latest_segment
            ):
                progress.reopen_segment(
                    latest_segment,
                )
            else:
                hierarchy.reopen(
                    item,
                )

            affected = [
                item.pk,
            ]

        items_after = history.capture_items(
            request.user,
            affected_ids,
        )
        priority_after = history.capture_priority(request.user, include_unpositioned=True)

        history.record_checkpoint(
            request.user,
            'COMPLETE',
            {
                'items': items_before,
                'priority': priority_before,
            },
            {
                'items': items_after,
                'priority': priority_after,
            },
        )

        item.refresh_from_db()
        return Response({
            'item': self.get_serializer(item).data,
            'affected_ids': affected,
        })

    @action(detail=False, methods=['get'], url_path='history-status')
    def history_status(self, request):
        return Response(history.history_status(request.user))

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def undo(self, request):
        entry = history.undo(request.user)

        if entry is None:
            return Response({
                'changed': False,
                **history.history_status(request.user),
            })

        return Response({
            'changed': True,
            'action_type': entry.action_type,
            **history.history_status(request.user),
        })

    @action(detail=False, methods=['post'])
    @transaction.atomic
    def redo(self, request):
        entry = history.redo(request.user)

        if entry is None:
            return Response({
                'changed': False,
                **history.history_status(request.user),
            })

        return Response({
            'changed': True,
            'action_type': entry.action_type,
            **history.history_status(request.user),
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
    @transaction.atomic
    def post(self, request):
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        before = {
            'priority': history.capture_priority(request.user),
            'leaf_siblings': history.capture_leaf_order(request.user),
        }

        try:
            priority.reorder(
                request.user,
                serializer.validated_data['item_id'],
                serializer.validated_data['new_position'],
            )
            leaf_order_sync.from_priority(request.user)
            scheduling.reconcile(request.user)
        except DjangoValidationError as exc:
            raise _as_400(exc)

        after = {
            'priority': history.capture_priority(request.user),
            'leaf_siblings': history.capture_leaf_order(request.user),
        }

        history.record_checkpoint(
            request.user,
            'PRIORITY',
            before,
            after,
        )

        items = list(priority.ordered(request.user))

        # Return the authoritative global priority order.
        return Response(_priority_rows(request.user, items))


def _focus_projection(user):
    projection = focus.build(
        user,
        today=user_local_date(user),
    )

    parents = queries.parent_map(
        user.pk,
    )

    candidate_ids = [
        candidate.item_id
        for candidate in projection['candidates']
    ]

    residual_children = (
        PlanningItem.objects
        .visible()
        .filter(
            user=user,
            parent_id=OuterRef("pk"),
        )
    )

    candidate_items = {
        item.pk: item
        for item in (
            PlanningItem.objects
            .for_user(user)
            .filter(
                pk__in=candidate_ids,
            )
            .annotate(
                is_residual=Exists(
                    residual_children,
                ),
            )
        )
    }

    titles = dict(
        PlanningItem.objects
        .for_user(user)
        .values_list(
            'pk',
            'title',
        )
    )

    def serialize_candidate(candidate):
        item = candidate_items[
            candidate.item_id
        ]

        ancestors = [
            titles[item_id]
            for item_id in reversed(
                queries.ancestor_chain(
                    parents,
                    candidate.item_id,
                )
            )
            if item_id in titles
        ]

        return {
            'item_id': candidate.item_id,
            'title': candidate.title,
            'duration_category':
                candidate.duration_category,
            'focus_bucket':
                focus_bucket_key(
                    candidate.duration_category,
                    is_residual=bool(
                        item.is_residual
                    ),
                ),
            'scheduled_date':
                candidate.scheduled_date,
            'priority_position':
                candidate.priority_position,
            'execution_rank':
                candidate.execution_rank,
            'is_current':
                candidate.is_current,
            'hierarchy_path':
                ancestors + [candidate.title],
            'description':
                item.description,
            'start_date':
                item.start_date,
            'due_date':
                item.due_date,
            'manual_requested_date':
                item.manual_requested_date,
            'manual_anchor_origin_date':
                item.manual_anchor_origin_date,
            'manual_requested_order':
                item.manual_requested_order,
            'percent_completed':
                float(
                    item.percent_completed
                    or 0
                ),
        }

    candidates = [
        serialize_candidate(candidate)
        for candidate in projection['candidates']
    ]

    by_id = {
        candidate['item_id']: candidate
        for candidate in candidates
    }

    groups = {
        value: [
            by_id[candidate.item_id]
            for candidate in projection['groups'].get(
                value,
                [],
            )
        ]
        for value in DurationCategory.values
    }

    return FocusProjectionSerializer({
        'today':
            projection['today'],
        'groups':
            groups,
        'candidates':
            candidates,
        'current_item_id':
            projection['current_item_id'],
    }).data


class FocusView(APIView):
    """Read-only projection over already-scheduled ARC work."""

    @extend_schema(
        responses=FocusProjectionSerializer,
    )
    def get(self, request):
        return Response(
            _focus_projection(
                request.user,
            )
        )


class FocusCurrentView(APIView):
    """Set or clear convenience-only current Focus."""

    @extend_schema(
        request=FocusCurrentSerializer,
        responses=FocusProjectionSerializer,
    )
    def post(self, request):
        serializer = FocusCurrentSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        item_id = serializer.validated_data[
            'item_id'
        ]

        if item_id is None:
            focus.clear_current(
                request.user,
            )
        else:
            item = (
                PlanningItem.objects
                .for_user(request.user)
                .filter(
                    pk=item_id,
                    is_deleted=False,
                )
                .first()
            )

            if item is None:
                return Response(
                    {
                        'detail':
                            'Planning item not found.',
                    },
                    status=404,
                )

            focus.set_current(
                request.user,
                item,
            )

        return Response(
            _focus_projection(
                request.user,
            )
        )


class FocusReprioritiseView(APIView):
    """Explicit canonical global-priority mutation from Focus."""

    @extend_schema(
        request=FocusReprioritiseSerializer,
        responses=FocusProjectionSerializer,
    )
    @transaction.atomic
    def post(self, request):
        serializer = FocusReprioritiseSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        data = serializer.validated_data

        item = (
            PlanningItem.objects
            .for_user(request.user)
            .filter(
                pk=data['item_id'],
                is_deleted=False,
            )
            .first()
        )

        if item is None:
            return Response(
                {
                    'detail':
                        'Planning item not found.',
                },
                status=404,
            )

        before = {
            'priority':
                history.capture_priority(
                    request.user,
                ),
            'leaf_siblings':
                history.capture_leaf_order(
                    request.user,
                ),
        }

        try:
            focus.reprioritise(
                request.user,
                item,
                data['new_position'],
                reconcile=False,
            )
            leaf_order_sync.from_priority(
                request.user,
            )
            scheduling.reconcile(
                request.user,
            )
        except DjangoValidationError as exc:
            raise _as_400(exc)

        after = {
            'priority':
                history.capture_priority(
                    request.user,
                ),
            'leaf_siblings':
                history.capture_leaf_order(
                    request.user,
                ),
        }

        history.record_checkpoint(
            request.user,
            'PRIORITY',
            before,
            after,
        )

        return Response(
            _focus_projection(
                request.user,
            )
        )


class TimelineNavigationView(APIView):
    """Global Timeline task index.

    Search, anchor navigation and conflict labels must not depend on the
    currently visible date window or generic list pagination.
    """

    @extend_schema(
        responses=TimelineNavigationItemSerializer(many=True),
    )
    def get(self, request):
        items = (
            PlanningItem.objects
            .for_user(request.user)
            .actionable()
            .select_related('parent')
            .prefetch_related('tags')
            .order_by('id')
        )

        return Response(
            TimelineNavigationItemSerializer(
                items,
                many=True,
            ).data
        )


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
                'conflicts': serializers.ListField(child=serializers.DictField()),
                'scheduler': SchedulerRuntimeSerializer(),
                'capacities': serializers.DictField(child=serializers.IntegerField()),
                'overload': serializers.ListField(child=serializers.DictField()),
                'overload_dates': serializers.ListField(
                    child=serializers.DateField(),
                ),
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
        today = user_local_date(request.user)
        start = _date_param(request, 'from', today - timedelta(days=7))
        end = _date_param(request, 'to', today + timedelta(days=28))
        if end < start:
            raise ValidationError({'to': 'The end of the range precedes its start.'})
        schedule_result = ensure_scheduled(request.user)

        items = list(
            PlanningItem.objects.for_user(request.user)
            .actionable()
            .in_window(start, end)
            .annotate(
                has_children=Exists(
                    PlanningItem.objects.filter(parent_id=OuterRef('pk'))
                ),
                has_unfinished_children=Exists(
                    PlanningItem.objects.for_user(request.user).filter(
                        parent_id=OuterRef('pk'),
                        is_completed=False,
                    )
                ),
            )
            # Factual date overlap must not turn structural work into an
            # execution card. Keep completed history and residual parents.
            .exclude(
                is_completed=False,
                has_unfinished_children=True,
            )
            .select_related('assignment_detail')
            .prefetch_related('tags')
            .order_by('id')
        )

        roots = _root_lookup(request.user)
        grouped = {}
        for item in items:
            root = roots[item.pk]
            grouped.setdefault(root['id'], (root, []))[1].append(item)

        parents = queries.parent_map(request.user.pk)
        meta = dict(PlanningItem.objects.for_user(request.user).values_list('pk', 'title'))
        paths = {item.pk: [{'id': pk, 'title': meta[pk]} for pk in reversed(queries.ancestor_chain(parents, item.pk))]
                 for item in items}
        allocations_by_item = {}

        for row in (
            SchedulerAllocation.objects
            .filter(
                item__user=request.user,
                scheduled_date__range=(start, end),
            )
            .order_by(
                'scheduled_date',
                'execution_rank',
                'id',
            )
            .values(
                'item_id',
                'percentage',
                'scheduled_date',
                'execution_rank',
            )
        ):
            allocations_by_item.setdefault(
                row['item_id'],
                [],
            ).append({
                'percentage': row['percentage'],
                'scheduled_date': row['scheduled_date'],
                'execution_rank': row['execution_rank'],
            })

        groups = []
        for root, members in grouped.values():
            members.sort(key=lambda i: (i.scheduled_date is None, i.scheduled_date or end,
                                       i.priority_position is None, i.priority_position or 0, i.pk))
            groups.append({
                'root': root,
                'items': TimelineItemSerializer(
                    members,
                    many=True,
                    context={
                        'paths': paths,
                        'allocations_by_item': allocations_by_item,
                    },
                ).data,
            })
        groups.sort(key=lambda group: group['root']['title'])

        zones = Timezone.objects.filter(
            user=request.user, start_date__lte=end, end_date__gte=start
        )

        return Response({
            'range': {'from': start.isoformat(), 'to': end.isoformat()},
            'timezones': TimezoneSerializer(zones, many=True).data,
            'groups': groups,
            'conflicts': schedule_result['conflicts'],
            'scheduler': schedule_result['scheduler'],
            'capacities': scheduling.capacities(request.user),
            'overload': list(SchedulingOverload.objects.filter(
                user=request.user, date__range=(start, end),
            ).order_by('date').values('date', 'allowed')),
            'overload_dates': [
                day.isoformat()
                for day in (
                    SchedulingOverload.objects
                    .filter(
                        user=request.user,
                        allowed=True,
                    )
                    .order_by('date')
                    .values_list(
                        'date',
                        flat=True,
                    )
                )
            ],
        })


class OverdueView(APIView):
    """GET /api/planning/overdue/: derived deadline and anchor misses."""

    @extend_schema(
        responses=inline_serializer(
            'OverdueResponse',
            {
                'deadline_overdue': OverdueEntrySerializer(many=True),
                'anchor_overdue': OverdueEntrySerializer(many=True),
            },
        ),
        description='Incomplete deadline misses and missed manual-anchor commitments.',
    )
    def get(self, request):
        buckets = overdue.classify_v3(request.user, user_local_date(request.user))
        return Response({
            'deadline_overdue': OverdueEntrySerializer(buckets['deadline_overdue'], many=True).data,
            'anchor_overdue': OverdueEntrySerializer(buckets['anchor_overdue'], many=True).data,
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


class StudyPlanView(APIView):
    """Suggest a study plan for the signed-in student.

    The model call stays in this process. A failure returns the last saved
    plan when there is one, and never writes planner rows.
    """

    def get(self, request):
        return Response(present(request.user, load_plan(request.user)))

    def post(self, request):
        serializer = StudyPlanRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = present(request.user, request_plan(
            request.user,
            data['availability'],
            data.get('notes', ''),
        ))
        status = 200 if result['plan'] is not None else 502
        return Response(result, status=status)

    def patch(self, request):
        serializer = StudyPlanEditSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = present(request.user, save_edited_plan(
                request.user,
                serializer.validated_data['sessions'],
            ))
        except ValueError as exc:
            raise ValidationError({'sessions': str(exc)}) from exc
        return Response(result)


class SchedulerSettingsView(APIView):
    """Read or explicitly choose the user's scheduler V1 flavour."""

    @extend_schema(
        responses=SchedulerSettingsSerializer,
        description=(
            "Return the user's scheduler flavour. "
            "flavour=null means V1 has not been explicitly enabled."
        ),
    )
    def get(self, request):
        state, _ = SchedulingState.objects.get_or_create(
            user=request.user,
        )

        return Response({
            'flavour': state.scheduler_flavour,
            'configured': state.scheduler_flavour is not None,
        })

    @extend_schema(
        request=SchedulerSettingsUpdateSerializer,
        responses=SchedulerSettingsSerializer,
        description=(
            "Choose lock-in or monk. Sending flavour=null clears the "
            "selection and returns the user to the unconfigured state."
        ),
    )
    def put(self, request):
        serializer = SchedulerSettingsUpdateSerializer(
            data=request.data,
        )
        serializer.is_valid(raise_exception=True)

        state, _ = SchedulingState.objects.get_or_create(
            user=request.user,
        )

        state.scheduler_flavour = serializer.validated_data[
            'flavour'
        ]

        # The previous disposable result belongs to the previous flavour
        # selection (or to the previously configured state).  Force the next
        # scheduling boundary to generate a fresh V1 result.
        state.scheduler_runtime = {}

        state.save(
            update_fields=[
                'scheduler_flavour',
                'scheduler_runtime',
            ]
        )

        return Response({
            'flavour': state.scheduler_flavour,
            'configured': state.scheduler_flavour is not None,
        })


def _schedule_anchor_response(user, data):
    item = (
        PlanningItem.objects
        .for_user(user)
        .filter(
            pk=data['item_id'],
            is_deleted=False,
        )
        .first()
    )

    if item is None:
        return Response(
            {
                'detail':
                    'Planning item not found.',
            },
            status=404,
        )

    if data.get('remove', False):
        item = scheduling.remove_anchor(
            item,
        )

        return Response({
            'item_id':
                item.pk,
            'manual_requested_date':
                None,
            'manual_anchor_origin_date':
                None,
            'manual_requested_order':
                None,
            'scheduled_date':
                item.scheduled_date,
            'start_date':
                item.start_date,
            'due_date':
                item.due_date,
            'removed':
                True,
        })

    day = data['date']

    if day < user_local_date(user):
        return Response(
            {
                'conflicts': [
                    {
                        'item_id':
                            item.pk,
                        'code':
                            'past_date',
                    },
                ],
                'decisions': [],
            },
            status=409,
        )

    conflicts = []
    decisions = []

    if (
        item.due_date
        and day > item.due_date
        and not data.get(
            'change_deadline',
            False,
        )
    ):
        conflicts.append({
            'item_id':
                item.pk,
            'code':
                'after_deadline',
            'original_date': item.due_date,
            'proposed_date': day,
        })

        decisions.append({
            'code':
                'change_deadline',
            'label': (
                'Move the deadline to the anchor '
                'date and continue'
            ),
        })

    if (
        item.start_date
        and day < item.start_date
        and not data.get(
            'change_release',
            False,
        )
    ):
        conflicts.append({
            'item_id':
                item.pk,
            'code':
                'before_release',
            'original_date': item.start_date,
            'proposed_date': day,
        })

        decisions.append({
            'code':
                'change_release',
            'label': (
                'Move the release date to the anchor '
                'date and continue'
            ),
        })

    if (
        dependencies.is_blocked(item)
        and not data.get(
            'acknowledge_dependency_block',
            False,
        )
    ):
        conflicts.append({
            'item_id':
                item.pk,
            'code':
                'blocked_dependency',
        })

        decisions.append({
            'code':
                'acknowledge_dependency_block',
            'label': (
                'Keep this as future date intent '
                'while the dependency is blocked'
            ),
        })

    if conflicts:
        return Response(
            {
                'conflicts':
                    conflicts,
                'decisions':
                    decisions,
            },
            status=409,
        )

    try:
        item = scheduling.set_anchor(
            item,
            day,
            order=data.get(
                'order',
            ),
            change_deadline=data.get(
                'change_deadline',
                False,
            ),
            change_release=data.get(
                'change_release',
                False,
            ),
            allow_overload=data.get(
                'allow_overload',
                False,
            ),
        )

    except DjangoValidationError as exc:
        messages = getattr(
            exc,
            'messages',
            [str(exc)],
        )

        if any(
            'overload'
            in str(message).lower()
            for message in messages
        ):
            return Response(
                {
                    'conflicts': [
                        {
                            'item_id':
                                item.pk,
                            'code':
                                'capacity_exceeded',
                        },
                    ],
                    'decisions': [
                        {
                            'code':
                                'allow_overload',
                            'label': (
                                'Allow overload on this '
                                'date and continue'
                            ),
                        },
                    ],
                },
                status=409,
            )

        raise _as_400(exc)

    return Response({
        'item_id':
            item.pk,
        'manual_requested_date':
            item.manual_requested_date,
        'manual_anchor_origin_date':
            item.manual_anchor_origin_date,
        'manual_requested_order':
            item.manual_requested_order,
        'scheduled_date':
            item.scheduled_date,
        'start_date':
            item.start_date,
        'due_date':
            item.due_date,
        'removed':
            False,
    })


class ScheduleAnchorView(APIView):
    """Existing Timeline explicit anchor/unanchor boundary."""

    @extend_schema(
        request=ScheduleAnchorSerializer,
    )
    def post(self, request):
        serializer = ScheduleAnchorSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        return _schedule_anchor_response(
            request.user,
            serializer.validated_data,
        )




class FocusAnchorView(APIView):
    """Explicit Focus date + within-day order anchor."""

    @extend_schema(
        request=FocusAnchorSerializer,
    )
    def post(self, request):
        serializer = FocusAnchorSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        return _schedule_anchor_response(
            request.user,
            serializer.validated_data,
        )



class FocusAnchorBatchView(APIView):
    """Atomically apply coalesced Focus placement intent."""

    @extend_schema(
        request=FocusAnchorBatchSerializer,
    )
    @transaction.atomic
    def post(self, request):
        serializer = FocusAnchorBatchSerializer(
            data=request.data,
        )

        serializer.is_valid(
            raise_exception=True,
        )

        changes = serializer.validated_data[
            "changes"
        ]

        today = user_local_date(request.user)

        item_ids = [
            change[
                "item_id"
            ]
            for change in changes
        ]

        items = {
            item.pk: item
            for item in (
                PlanningItem.objects
                .for_user(
                    request.user
                )
                .filter(
                    pk__in=item_ids,
                )
            )
        }

        conflicts = []
        decisions = []

        for change in changes:
            item = items.get(
                change[
                    "item_id"
                ]
            )

            if item is None:
                raise ValidationError({
                    "item_id":
                        "Choose a planning item."
                })

            day = change[
                "date"
            ]

            if change.get("order_only") and item.manual_requested_date != day:
                conflicts.append({"item_id": item.pk, "code": "anchor_changed"})
                continue

            if day < today:
                conflicts.append({
                    "item_id":
                        item.pk,

                    "item_title":
                        item.title,

                    "code":
                        "past_date",
                })

                continue

            if (
                item.due_date
                and day > item.due_date
                and not change.get(
                    "change_deadline",
                    False,
                )
            ):
                conflicts.append({
                    "item_id":
                        item.pk,

                    "item_title":
                        item.title,

                    "code":
                        "after_deadline",

                    "current_date":
                        item.due_date,

                    "requested_date":
                        day,
                })

                decisions.append({
                    "item_id":
                        item.pk,

                    "code":
                        "change_deadline",

                    "label":
                        "Move deadline and continue",
                })

            if (
                item.start_date
                and day < item.start_date
                and not change.get(
                    "change_release",
                    False,
                )
            ):
                conflicts.append({
                    "item_id":
                        item.pk,

                    "item_title":
                        item.title,

                    "code":
                        "before_release",

                    "current_date":
                        item.start_date,

                    "requested_date":
                        day,
                })

                decisions.append({
                    "item_id":
                        item.pk,

                    "code":
                        "change_release",

                    "label":
                        "Move release date and continue",
                })

            blocking = list(
                dependencies.blocking_edges(
                    item
                )
            )

            if (
                blocking
                and not change.get(
                    "dissolve_dependencies",
                    False,
                )
            ):
                conflicts.append({
                    "item_id":
                        item.pk,

                    "item_title":
                        item.title,

                    "code":
                        "blocked_dependency",

                    "prerequisites": [
                        {
                            "item_id":
                                edge.prerequisite_id,

                            "title":
                                edge.prerequisite.title,
                        }
                        for edge
                        in blocking
                    ],
                })

                decisions.append({
                    "item_id":
                        item.pk,

                    "code":
                        "dissolve_dependencies",

                    "label": (
                        "Dissolve dependency and continue"
                        if len(blocking) == 1
                        else
                        "Dissolve dependencies and continue"
                    ),
                })

        capacity_conflicts = (
            scheduling
            .focus_capacity_conflicts(
                request.user,
                changes,
            )
        )

        conflicts.extend(
            capacity_conflicts
        )

        decisions.extend([
            {
                "item_id":
                    conflict[
                        "item_id"
                    ],

                "code":
                    "allow_overload",

                "label":
                    "Allow overload and continue",
            }
            for conflict
            in capacity_conflicts
        ])

        if conflicts:
            return Response(
                {
                    "conflicts":
                        conflicts,

                    "decisions":
                        decisions,
                },
                status=409,
            )

        try:
            result = (
                scheduling.set_anchor_batch(
                    request.user,
                    changes,
                    expected_queue=serializer.validated_data.get("expected_queue"),
                )
            )

        except scheduling.SchedulingConflict as exc:
            capacity_item_ids = {
                conflict.get(
                    "item_id"
                )
                for conflict
                in exc.conflicts
                if (
                    conflict.get(
                        "code"
                    )
                    == "capacity_exceeded"
                )
            }

            return Response(
                {
                    "conflicts":
                        exc.conflicts,

                    "decisions": [
                        {
                            "item_id":
                                item_id,

                            "code":
                                "allow_overload",

                            "label":
                                "Allow overload and continue",
                        }
                        for item_id
                        in capacity_item_ids
                        if item_id is not None
                    ],
                },
                status=409,
            )

        except DjangoValidationError as exc:
            raise _as_400(
                exc
            )

        return Response({
            "changed_ids":
                result.get(
                    "changed_ids",
                    [],
                ),

            "conflicts":
                result.get(
                    "conflicts",
                    [],
                ),

            "scheduler":
                result.get(
                    "scheduler",
                    {},
                ),

            "focus":
                _focus_projection(
                    request.user
                ),

            **history.history_status(
                request.user
            ),
        })


class FocusDoTodayView(APIView):
    """Explicit Focus promotion using Timeline anchor semantics."""

    @extend_schema(
        request=FocusDoTodaySerializer,
    )
    def post(self, request):
        serializer = FocusDoTodaySerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        return _schedule_anchor_response(
            request.user,
            {
                **serializer.validated_data,
                'date':
                    user_local_date(request.user),
                'remove':
                    False,
            },
        )


class FocusAutomaticView(APIView):
    """Remove explicit date intent and return item to scheduler control."""

    @extend_schema(
        request=FocusCurrentSerializer,
    )
    def post(self, request):
        serializer = FocusCurrentSerializer(
            data=request.data,
        )
        serializer.is_valid(
            raise_exception=True,
        )

        item_id = serializer.validated_data[
            'item_id'
        ]

        if item_id is None:
            raise ValidationError({
                'item_id':
                    'Choose a planning item.',
            })

        return _schedule_anchor_response(
            request.user,
            {
                'item_id':
                    item_id,
                'remove':
                    True,
            },
        )


class ScheduleMoveView(APIView):
    @extend_schema(request=ScheduleMoveSerializer, responses={200: ScheduleResultSerializer, 409: ScheduleResultSerializer})
    def post(self, request):
        serializer = ScheduleMoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = scheduling.move_to_date(request.user, data['item_id'], data['date'], allow_overload=data['allow_overload'])
        except scheduling.SchedulingConflict as exc:
            return Response({'conflicts': exc.conflicts}, status=409)
        return Response(result)


class ScheduleReplaceView(APIView):
    @extend_schema(request=ScheduleReplaceSerializer, responses={200: ScheduleResultSerializer, 409: ScheduleResultSerializer})
    def post(self, request):
        serializer = ScheduleReplaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = scheduling.replace(request.user, **serializer.validated_data)
        except scheduling.SchedulingConflict as exc:
            return Response({'conflicts': exc.conflicts}, status=409)
        return Response(result)


class ScheduleOverloadView(APIView):
    @extend_schema(request=ScheduleOverloadSerializer, responses={200: ScheduleResultSerializer, 409: ScheduleResultSerializer})
    def post(self, request):
        serializer = ScheduleOverloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = scheduling.configure(request.user, day=data['date'], overloaded=data['allowed'])
        except scheduling.SchedulingConflict as exc:
            return Response({'conflicts': exc.conflicts}, status=409)
        return Response(result)


class ScheduleRescheduleView(APIView):
    @extend_schema(request=None, responses=ScheduleResultSerializer)
    def post(self, request):
        return Response(scheduling.reschedule(request.user))
