"""Payload shapes for the planning API.

Every relation a client is allowed to name goes through
UserScopedPrimaryKeyRelatedField. Filtering a viewset's queryset stops a user
reading someone else's rows, but does nothing about a payload that references
a foreign primary key, which is how a stolen parent or tag would otherwise
leak its title back through the response (FR-03).
"""

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from core.serializers import UserScopedPrimaryKeyRelatedField
from planning.models import (
    AssignmentDetail,
    ItemType,
    PlanningItem,
    PlanningItemTag,
    SchedulingState,
    Tag,
    Timezone,
)


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('A tag needs a name.')
        user = self.context['request'].user
        clash = Tag.objects.filter(user=user, name__iexact=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('You already have a tag with this name.')
        return value


class TimezoneSerializer(serializers.ModelSerializer):
    """FR-13. Overlapping ranges are allowed, so only the ordering is checked."""

    class Meta:
        model = Timezone
        fields = ['id', 'title', 'start_date', 'end_date']

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        if start and end and end < start:
            raise serializers.ValidationError(
                {'end_date': 'A timezone cannot end before it starts.'}
            )
        return attrs


class AssignmentDetailSerializer(serializers.ModelSerializer):
    """FR-14. mark_achieved stays nullable: unmarked is not zero."""

    class Meta:
        model = AssignmentDetail
        fields = ['weight_percent', 'mark_achieved', 'submission_url', 'marks_position']


class TimelineNavigationItemSerializer(serializers.ModelSerializer):
    """Small canonical item index used by Timeline search/navigation.

    Deliberately independent of the visible date window and DRF list
    pagination.  It exposes canonical facts only; no scheduler assumptions.
    """

    parent = serializers.IntegerField(
        source='parent_id',
        allow_null=True,
        read_only=True,
    )
    tags = TagSerializer(
        many=True,
        read_only=True,
    )

    class Meta:
        model = PlanningItem
        fields = [
            'id',
            'parent',
            'item_type',
            'title',
            'description',
            'start_date',
            'due_date',
            'scheduled_date',
            'completed_display_date',
            'manual_requested_date',
            'duration_category',
            'is_completed',
            'tags',
        ]


class PlanningItemSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    tag_ids = UserScopedPrimaryKeyRelatedField(
        many=True, queryset=Tag.objects.all(), source='tags', required=False,
        write_only=True,
    )
    parent = UserScopedPrimaryKeyRelatedField(
        queryset=PlanningItem.objects.all(), required=False, allow_null=True
    )
    assignment_detail = AssignmentDetailSerializer(required=False, allow_null=True)
    has_deadline = serializers.BooleanField(read_only=True)

    class Meta:
        model = PlanningItem
        fields = [
            'id', 'parent', 'item_type', 'title', 'description', 'sibling_order',
            'start_date', 'due_date', 'scheduled_date', 'execution_rank',
            'completed_display_date', 'manual_requested_date',
            'duration_category', 'percent_completed',
            'priority_position', 'is_completed', 'has_deadline',
            'canvas_object_type', 'canvas_object_id',
            'tags', 'tag_ids', 'assignment_detail',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'priority_position', 'scheduled_date', 'execution_rank',
            'completed_display_date', 'manual_requested_date',
            'percent_completed', 'canvas_object_type',
            'canvas_object_id', 'created_at', 'updated_at',
        ]

    def validate(self, attrs):
        item_type = attrs.get('item_type', getattr(self.instance, 'item_type', None))
        if attrs.get('assignment_detail') and item_type != ItemType.ASSIGNMENT:
            raise serializers.ValidationError({
                'assignment_detail': 'Only an assignment can carry assignment detail.'
            })

        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        due = attrs.get('due_date', getattr(self.instance, 'due_date', None))
        if start and due and due < start:
            raise serializers.ValidationError(
                {'due_date': 'A due date cannot fall before the start date.'}
            )
        return attrs

    def validate_parent(self, value):
        """FR-06. The service owns the rule; this only surfaces it as a 400."""
        from django.core.exceptions import ValidationError as DjangoValidationError

        from planning.services import hierarchy

        instance = self.instance or PlanningItem(
            user=self.context['request'].user,
            item_type=self.initial_data.get('item_type', ItemType.TASK),
            title='',
        )
        try:
            hierarchy.validate_parent(instance, value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages)
        return value

    def create(self, validated_data):
        from planning.services import domain_commands
        detail = validated_data.pop('assignment_detail', None)
        tags = validated_data.pop('tags', None)
        user = validated_data.pop('user')
        item = domain_commands.create_item(user, **validated_data)

        if detail:
            AssignmentDetail.objects.create(planning_item=item, **detail)
        if tags:
            self._set_tags(item, tags)

        return item

    def update(self, instance, validated_data):
        from django.db import transaction
        from planning.services import domain_commands
        detail = validated_data.pop('assignment_detail', serializers.empty)
        tags = validated_data.pop('tags', serializers.empty)
        validated_data.pop('user', None)
        with transaction.atomic():
            instance = domain_commands.update_item(instance, validated_data)
            if detail is not serializers.empty:
                self._set_detail(instance, detail)
            if tags is not serializers.empty:
                self._set_tags(instance, tags)
        return instance

    def _set_detail(self, item, detail):
        if detail is None:
            AssignmentDetail.objects.filter(planning_item=item).delete()
            return
        AssignmentDetail.objects.update_or_create(planning_item=item, defaults=detail)

    def _set_tags(self, item, tags):
        """Rewrite the junction rows rather than using the m2m manager, so the
        explicit through model stays the single way rows are created."""
        PlanningItemTag.objects.filter(planning_item=item).delete()
        PlanningItemTag.objects.bulk_create(
            [PlanningItemTag(planning_item=item, tag=tag) for tag in tags]
        )


class PlanningItemTreeSerializer(serializers.ModelSerializer):
    """A Text View node (FR-06). ``children`` is filled in by the view, which
    already has the whole tree in memory."""

    tags = TagSerializer(many=True, read_only=True)
    assignment_detail = AssignmentDetailSerializer(read_only=True)
    depth = serializers.IntegerField(read_only=True)
    children = serializers.SerializerMethodField()

    #: Recursive, so the schema describes children as a list of nodes rather
    #: than trying to expand the nesting forever.
    _children_schema = {'type': 'array', 'items': {'type': 'object'}}

    class Meta:
        model = PlanningItem
        fields = [
            'id', 'parent', 'item_type', 'title', 'description', 'depth',
            'sibling_order', 'start_date', 'due_date', 'scheduled_date',
            'duration_category', 'priority_position', 'is_completed',
            'tags', 'assignment_detail', 'children',
        ]

    @extend_schema_field(_children_schema)
    def get_children(self, item):
        return PlanningItemTreeSerializer(
            getattr(item, 'child_nodes', []), many=True, context=self.context
        ).data


class RootRefSerializer(serializers.ModelSerializer):
    """The root an item hangs from, for grouping in the Priority and Timeline
    views."""

    class Meta:
        model = PlanningItem
        fields = ['id', 'title', 'item_type']


class PriorityRowSerializer(serializers.Serializer):
    """One row of the Priority View (FR-09)."""

    position = serializers.IntegerField(source='priority_position')
    item_id = serializers.IntegerField(source='id')
    title = serializers.CharField()
    item_type = serializers.CharField()
    duration_category = serializers.CharField(allow_null=True)
    due_date = serializers.DateField(allow_null=True)
    scheduled_date = serializers.DateField(allow_null=True)
    root = RootRefSerializer()


class ReorderSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    new_position = serializers.IntegerField()


class MoveSerializer(serializers.Serializer):
    parent_id = UserScopedPrimaryKeyRelatedField(
        queryset=PlanningItem.objects.all(), allow_null=True
    )
    sibling_order = serializers.IntegerField(required=False, min_value=1)
    adopt_child_ids = UserScopedPrimaryKeyRelatedField(
        queryset=PlanningItem.objects.all(),
        many=True,
        required=False,
    )

    def validate_adopt_child_ids(self, value):
        ids = [item.pk for item in value]

        if len(ids) != len(set(ids)):
            raise serializers.ValidationError(
                'Each adopted child may appear only once.'
            )

        return value


class CompleteSerializer(serializers.Serializer):
    completed = serializers.BooleanField(default=True)
    reschedule = serializers.BooleanField(default=True)


class FocusCandidateSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    title = serializers.CharField()
    duration_category = serializers.CharField(
        allow_null=True,
    )
    focus_bucket = serializers.CharField()
    scheduled_date = serializers.DateField(
        allow_null=True,
    )
    priority_position = serializers.IntegerField(
        allow_null=True,
    )
    execution_rank = serializers.IntegerField(
        allow_null=True,
    )
    is_current = serializers.BooleanField()
    hierarchy_path = serializers.ListField(
        child=serializers.CharField(),
    )
    description = serializers.CharField(
        allow_blank=True,
        allow_null=True,
    )
    start_date = serializers.DateField(
        allow_null=True,
    )
    due_date = serializers.DateField(
        allow_null=True,
    )
    manual_requested_date = serializers.DateField(
        allow_null=True,
    )
    manual_requested_order = serializers.IntegerField(
        allow_null=True,
    )
    percent_completed = serializers.FloatField()


class FocusProjectionSerializer(serializers.Serializer):
    today = serializers.DateField()
    groups = serializers.DictField()
    candidates = FocusCandidateSerializer(
        many=True,
    )
    current_item_id = serializers.IntegerField(
        allow_null=True,
    )


class FocusCurrentSerializer(serializers.Serializer):
    item_id = serializers.IntegerField(
        allow_null=True,
    )


class FocusReprioritiseSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    new_position = serializers.IntegerField(
        min_value=1,
    )




class FocusAnchorSerializer(serializers.Serializer):
    """Explicit Focus date + within-day execution-order intent."""

    item_id = serializers.IntegerField()
    date = serializers.DateField()
    order = serializers.IntegerField(min_value=1)

    change_deadline = serializers.BooleanField(
        default=False,
    )
    change_release = serializers.BooleanField(
        default=False,
    )
    allow_overload = serializers.BooleanField(
        default=False,
    )
    acknowledge_dependency_block = serializers.BooleanField(
        default=False,
    )

    dissolve_dependencies = serializers.BooleanField(
        default=False,
    )



class FocusAnchorBatchChangeSerializer(
    FocusAnchorSerializer
):
    """One staged Focus queue placement."""


class FocusAnchorBatchSerializer(
    serializers.Serializer
):
    """One atomic staged Focus queue Apply."""

    changes = FocusAnchorBatchChangeSerializer(
        many=True,
        allow_empty=False,
    )


class FocusDoTodaySerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    change_deadline = serializers.BooleanField(
        default=False,
    )
    change_release = serializers.BooleanField(
        default=False,
    )
    allow_overload = serializers.BooleanField(
        default=False,
    )
    acknowledge_dependency_block = serializers.BooleanField(
        default=False,
    )


class SchedulerAllocationProjectionSerializer(serializers.Serializer):
    """One persisted disposable split-session projection."""

    percentage = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
    )
    scheduled_date = serializers.DateField()
    execution_rank = serializers.IntegerField()


class TimelineItemSerializer(serializers.ModelSerializer):
    """A dated item on the Timeline (FR-10, FR-11)."""

    tags = TagSerializer(many=True, read_only=True)
    overdue = serializers.SerializerMethodField()
    submission_url = serializers.CharField(source='assignment_detail.submission_url', read_only=True, allow_null=True, default=None)
    hierarchy_path = serializers.SerializerMethodField()
    has_children = serializers.SerializerMethodField()
    allocations = serializers.SerializerMethodField()

    class Meta:
        model = PlanningItem
        fields = [
            'id', 'parent', 'title', 'description', 'item_type', 'start_date', 'due_date',
            'scheduled_date', 'execution_rank', 'completed_display_date',
            'manual_requested_date', 'manual_requested_order',
            'duration_category',
            'is_completed', 'priority_position', 'tags', 'overdue', 'submission_url',
            'hierarchy_path', 'has_children', 'allocations',
        ]

    @extend_schema_field(serializers.BooleanField())
    def get_overdue(self, item):
        from django.utils import timezone
        return bool(not item.is_completed and item.due_date and item.due_date < timezone.localdate())

    @extend_schema_field(serializers.ListField(child=serializers.DictField()))
    def get_hierarchy_path(self, item):
        return self.context.get('paths', {}).get(item.pk, [])

    @extend_schema_field(serializers.BooleanField())
    def get_has_children(self, item):
        return bool(getattr(item, 'has_children', False))

    @extend_schema_field(
        SchedulerAllocationProjectionSerializer(many=True)
    )
    def get_allocations(self, item):
        return self.context.get(
            'allocations_by_item',
            {},
        ).get(
            item.pk,
            [],
        )


class OverdueEntrySerializer(serializers.Serializer):
    """One Recent or Backlog row (FR-12)."""

    item = TimelineItemSerializer()
    days_overdue = serializers.IntegerField()
    hierarchy_path = serializers.ListField(child=serializers.CharField())


class MarkRowSerializer(serializers.Serializer):
    """One assessment in the Marks View (FR-14)."""

    id = serializers.IntegerField()
    title = serializers.CharField()
    weight_percent = serializers.DecimalField(max_digits=5, decimal_places=2, allow_null=True)
    mark_achieved = serializers.DecimalField(max_digits=6, decimal_places=2, allow_null=True)
    submission_url = serializers.CharField(allow_null=True)
    marks_position = serializers.IntegerField(allow_null=True)
    due_date = serializers.DateField(allow_null=True)


class MarkGroupSerializer(serializers.Serializer):
    root = RootRefSerializer()
    assessments = MarkRowSerializer(many=True)
    total_weight = serializers.DecimalField(max_digits=7, decimal_places=2)
    total_marks = serializers.DecimalField(max_digits=7, decimal_places=2)
    unmarked_count = serializers.IntegerField()


class MarksReorderSerializer(serializers.Serializer):
    ordered_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


class ScheduleMoveSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    date = serializers.DateField()
    allow_overload = serializers.BooleanField(default=False)


class ScheduleAnchorSerializer(serializers.Serializer):
    """Explicit Timeline anchor command with user-authorised resolutions."""

    item_id = serializers.IntegerField()
    date = serializers.DateField(
        required=False,
        allow_null=True,
    )
    remove = serializers.BooleanField(default=False)
    change_deadline = serializers.BooleanField(default=False)
    change_release = serializers.BooleanField(default=False)
    allow_overload = serializers.BooleanField(default=False)
    acknowledge_dependency_block = serializers.BooleanField(
        default=False,
    )

    def validate(self, attrs):
        if not attrs.get('remove') and attrs.get('date') is None:
            raise serializers.ValidationError({
                'date': 'Choose an anchor date.',
            })

        return attrs


class ScheduleReplaceSerializer(serializers.Serializer):
    replacement_id = serializers.IntegerField()
    displaced_id = serializers.IntegerField()
    allow_overload = serializers.BooleanField(default=False)


class ScheduleOverloadSerializer(serializers.Serializer):
    date = serializers.DateField()
    allowed = serializers.BooleanField()



class SchedulerEngineAllocationSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    scheduled_date = serializers.DateField()
    hours = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
    )
    percentage = serializers.DecimalField(
        max_digits=5,
        decimal_places=2,
    )
    execution_rank = serializers.IntegerField()


class SchedulerEstimateSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    total_hours = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
    )
    source = serializers.CharField()


class SchedulerDayLoadSerializer(serializers.Serializer):
    scheduled_date = serializers.DateField()
    hours = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
    )
    status = serializers.CharField()


class SchedulerPeriodLoadSerializer(serializers.Serializer):
    period = serializers.CharField()
    hours = serializers.DecimalField(
        max_digits=12,
        decimal_places=4,
    )
    status = serializers.CharField()


class SchedulerDiagnosticSerializer(serializers.Serializer):
    code = serializers.CharField()
    detail = serializers.CharField()


class SchedulerRuntimeSerializer(serializers.Serializer):
    """Derived scheduler state returned to the frontend."""

    configured = serializers.BooleanField()
    flavour = serializers.CharField(
        allow_null=True,
    )

    engine_version = serializers.CharField(required=False)
    input_contract_version = serializers.CharField(required=False)
    output_contract_version = serializers.CharField(required=False)

    iterations = serializers.IntegerField(required=False)
    evaluations = serializers.IntegerField(required=False)
    termination_reason = serializers.CharField(required=False)

    compatibility_conflicts = serializers.ListField(
        child=serializers.DictField(),
        required=False,
    )
    engine_conflicts = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    diagnostics = SchedulerDiagnosticSerializer(
        many=True,
        required=False,
    )

    allocation_count = serializers.IntegerField(required=False)

    allocations = SchedulerEngineAllocationSerializer(
        many=True,
        required=False,
    )
    estimates = SchedulerEstimateSerializer(
        many=True,
        required=False,
    )
    daily_load = SchedulerDayLoadSerializer(
        many=True,
        required=False,
    )
    weekly_load = SchedulerPeriodLoadSerializer(
        many=True,
        required=False,
    )
    monthly_load = SchedulerPeriodLoadSerializer(
        many=True,
        required=False,
    )

    objective = serializers.DictField(required=False)


class ScheduleResultSerializer(serializers.Serializer):
    changed_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
    )
    conflicts = serializers.ListField(
        child=serializers.DictField(),
    )
    scheduler = SchedulerRuntimeSerializer(required=False)


class SchedulerSettingsSerializer(serializers.Serializer):
    """Frontend-facing scheduler configuration.

    ``null`` is a valid and deliberate state: the user has not chosen a V1
    scheduler flavour yet.
    """

    flavour = serializers.ChoiceField(
        choices=SchedulingState.SchedulerFlavour.choices,
        allow_null=True,
    )
    configured = serializers.BooleanField(read_only=True)


class SchedulerSettingsUpdateSerializer(serializers.Serializer):
    flavour = serializers.ChoiceField(
        choices=SchedulingState.SchedulerFlavour.choices,
        allow_null=True,
    )
