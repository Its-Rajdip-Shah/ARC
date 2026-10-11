from datetime import timedelta

import pytest
from django.utils import timezone

from planning.models import (
    DurationCategory,
    FocusState,
    PlanningDependency,
    PlanningItem,
    SchedulingOverload,
)
from planning.services import scheduling


pytestmark = pytest.mark.django_db


def test_focus_get_does_not_trigger_scheduler(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    item = make_item(
        user,
        'Scheduled task',
        duration_category=DurationCategory.UNDER_20_MINUTES,
    )

    PlanningItem.objects.filter(
        pk=item.pk,
    ).update(
        scheduled_date=timezone.localdate(),
        execution_rank=1,
    )

    def forbidden(*args, **kwargs):
        raise AssertionError(
            'Focus GET must not schedule'
        )

    monkeypatch.setattr(
        scheduling,
        'schedule',
        forbidden,
    )

    response = api_for(user).get(
        '/api/planning/focus/',
    )

    assert response.status_code == 200
    assert response.data['today'] == timezone.localdate().isoformat()
    assert set(response.data['groups']) == set(
        DurationCategory.values
    )
    assert response.data['candidates'][0]['title'] == 'Scheduled task'


def test_current_focus_persists_outside_planning_item(
    api_for,
    user,
    make_item,
):
    item = make_item(
        user,
        'Current task',
    )

    PlanningItem.objects.filter(
        pk=item.pk,
    ).update(
        scheduled_date=timezone.localdate(),
        execution_rank=1,
    )

    before = list(
        PlanningItem.objects.filter(
            pk=item.pk,
        ).values(
            'priority_position',
            'start_date',
            'due_date',
            'manual_requested_date',
            'duration_category',
        )
    )[0]

    response = api_for(user).post(
        '/api/planning/focus/current/',
        {
            'item_id':
                item.pk,
        },
        format='json',
    )

    assert response.status_code == 200
    assert response.data['current_item_id'] == item.pk

    assert FocusState.objects.get(
        user=user,
    ).current_item_id == item.pk

    after = list(
        PlanningItem.objects.filter(
            pk=item.pk,
        ).values(
            'priority_position',
            'start_date',
            'due_date',
            'manual_requested_date',
            'duration_category',
        )
    )[0]

    assert after == before


def test_clear_current_focus(
    api_for,
    user,
    make_item,
):
    item = make_item(
        user,
        'Current task',
    )

    FocusState.objects.create(
        user=user,
        current_item=item,
    )

    response = api_for(user).post(
        '/api/planning/focus/current/',
        {
            'item_id': None,
        },
        format='json',
    )

    assert response.status_code == 200
    assert FocusState.objects.get(
        user=user,
    ).current_item_id is None


@pytest.mark.parametrize(
    'path,payload',
    [
        (
            '/api/planning/focus/current/',
            lambda pk: {
                'item_id': pk,
            },
        ),
        (
            '/api/planning/focus/do-today/',
            lambda pk: {
                'item_id': pk,
            },
        ),
        (
            '/api/planning/focus/automatic/',
            lambda pk: {
                'item_id': pk,
            },
        ),
        (
            '/api/planning/focus/reprioritise/',
            lambda pk: {
                'item_id': pk,
                'new_position': 1,
            },
        ),
    ],
)
def test_focus_write_routes_hide_foreign_ids(
    api_for,
    user,
    other_user,
    make_item,
    path,
    payload,
):
    item = make_item(
        user,
        'Private task',
    )

    response = api_for(other_user).post(
        path,
        payload(item.pk),
        format='json',
    )

    assert response.status_code == 404


def test_focus_projection_contains_hierarchy_path(
    api_for,
    user,
    make_item,
):
    root = make_item(
        user,
        'UNI',
    )

    child = make_item(
        user,
        'Assignment',
        parent=root,
    )

    PlanningItem.objects.filter(
        pk=child.pk,
    ).update(
        scheduled_date=timezone.localdate(),
        execution_rank=1,
    )

    response = api_for(user).get(
        '/api/planning/focus/',
    )

    row = next(
        candidate
        for candidate in response.data['candidates']
        if candidate['item_id'] == child.pk
    )

    assert row['hierarchy_path'] == [
        'UNI',
        'Assignment',
    ]


def test_do_today_and_return_to_automatic_share_anchor_boundary(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    item = make_item(
        user,
        'Promote me',
    )

    monkeypatch.setattr(
        scheduling,
        'schedule',
        lambda user: {
            'conflicts': [],
            'scheduler': {},
        },
    )

    promote = api_for(user).post(
        '/api/planning/focus/do-today/',
        {
            'item_id':
                item.pk,
        },
        format='json',
    )

    assert promote.status_code == 200

    item.refresh_from_db()
    assert item.manual_requested_date == timezone.localdate()

    automatic = api_for(user).post(
        '/api/planning/focus/automatic/',
        {
            'item_id':
                item.pk,
        },
        format='json',
    )

    assert automatic.status_code == 200

    item.refresh_from_db()
    assert item.manual_requested_date is None



def test_focus_projection_orders_date_then_execution_rank(
    api_for,
    user,
    make_item,
):
    today = timezone.localdate()

    today_second = make_item(
        user,
        'Today second',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    tomorrow_first = make_item(
        user,
        'Tomorrow first',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    today_first = make_item(
        user,
        'Today first',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    PlanningItem.objects.filter(
        pk=today_second.pk,
    ).update(
        scheduled_date=today,
        execution_rank=2,
    )

    PlanningItem.objects.filter(
        pk=tomorrow_first.pk,
    ).update(
        scheduled_date=today + timedelta(days=1),
        execution_rank=1,
    )

    PlanningItem.objects.filter(
        pk=today_first.pk,
    ).update(
        scheduled_date=today,
        execution_rank=1,
    )

    response = api_for(user).get(
        '/api/planning/focus/',
    )

    assert response.status_code == 200

    relevant = [
        row['title']
        for row in response.data['candidates']
        if row['item_id'] in {
            today_first.pk,
            today_second.pk,
            tomorrow_first.pk,
        }
    ]

    assert relevant == [
        'Today first',
        'Today second',
        'Tomorrow first',
    ]



def test_focus_fast_completion_commits_without_global_reschedule(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    item = make_item(
        user,
        'Fast Focus completion',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    PlanningItem.objects.filter(
        pk=item.pk,
    ).update(
        scheduled_date=timezone.localdate(),
        execution_rank=1,
    )

    item.refresh_from_db()

    FocusState.objects.update_or_create(
        user=user,
        defaults={
            'current_item': item,
        },
    )

    def forbidden_schedule(*args, **kwargs):
        raise AssertionError(
            'Focus fast completion must not run global scheduler'
        )

    monkeypatch.setattr(
        scheduling,
        'schedule',
        forbidden_schedule,
    )

    response = api_for(user).post(
        f'/api/planning/items/{item.pk}/complete/',
        {
            'completed': True,
            'reschedule': False,
        },
        format='json',
    )

    assert response.status_code == 200, response.data

    item.refresh_from_db()

    assert item.is_completed is True
    assert item.scheduled_date is None
    assert item.execution_rank is None
    assert item.priority_position is None

    assert (
        FocusState.objects
        .get(user=user)
        .current_item_id
        is None
    )



def test_focus_anchor_persists_date_and_manual_order(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    item = make_item(
        user,
        'Ordered Focus anchor',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    target = timezone.localdate()

    called = {}

    original_schedule = scheduling.schedule

    def fake_schedule(schedule_user, today=None):
        called['user_id'] = schedule_user.pk

        PlanningItem.objects.filter(
            pk=item.pk,
        ).update(
            scheduled_date=target,
            execution_rank=2,
        )

        return {
            'changed_ids': [item.pk],
            'conflicts': [],
            'scheduler': {},
        }

    monkeypatch.setattr(
        scheduling,
        'schedule',
        fake_schedule,
    )

    response = api_for(user).post(
        '/api/planning/focus/anchor/',
        {
            'item_id': item.pk,
            'date': target.isoformat(),
            'order': 2,
        },
        format='json',
    )

    assert response.status_code == 200, response.data

    item.refresh_from_db()

    assert called['user_id'] == user.pk
    assert item.manual_requested_date == target
    assert item.manual_requested_order == 2

    # Disposable scheduler result remains distinct from canonical intent.
    assert item.execution_rank == 2


def test_timeline_date_anchor_clears_prior_focus_order(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    item = make_item(
        user,
        'Timeline date-only anchor',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    today = timezone.localdate()

    PlanningItem.objects.filter(
        pk=item.pk,
    ).update(
        manual_requested_date=today,
        manual_requested_order=3,
    )

    monkeypatch.setattr(
        scheduling,
        'schedule',
        lambda *args, **kwargs: {
            'changed_ids': [],
            'conflicts': [],
            'scheduler': {},
        },
    )

    response = api_for(user).post(
        '/api/planning/timeline/anchor/',
        {
            'item_id': item.pk,
            'date': today.isoformat(),
        },
        format='json',
    )

    assert response.status_code == 200, response.data

    item.refresh_from_db()

    assert item.manual_requested_date == today
    assert item.manual_requested_order is None


def test_return_to_automatic_clears_focus_anchor_order(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    item = make_item(
        user,
        'Automatic Focus item',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    today = timezone.localdate()

    PlanningItem.objects.filter(
        pk=item.pk,
    ).update(
        manual_requested_date=today,
        manual_requested_order=2,
    )

    monkeypatch.setattr(
        scheduling,
        'schedule',
        lambda *args, **kwargs: {
            'changed_ids': [],
            'conflicts': [],
            'scheduler': {},
        },
    )

    response = api_for(user).post(
        '/api/planning/focus/automatic/',
        {
            'item_id': item.pk,
        },
        format='json',
    )

    assert response.status_code == 200, response.data

    item.refresh_from_db()

    assert item.manual_requested_date is None
    assert item.manual_requested_order is None



def test_focus_anchor_batch_schedules_once_and_records_one_action(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    today = timezone.localdate()

    first = make_item(
        user,
        'Batch first',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    second = make_item(
        user,
        'Batch second',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    PlanningItem.objects.filter(
        pk__in=[
            first.pk,
            second.pk,
        ],
    ).update(
        scheduled_date=today,
    )

    calls = []

    def fake_schedule(
        schedule_user,
        today=None,
        **kwargs,
    ):
        calls.append(
            schedule_user.pk
        )

        items = list(
            PlanningItem.objects
            .filter(
                pk__in=[
                    first.pk,
                    second.pk,
                ],
            )
            .order_by(
                'manual_requested_order',
                'pk',
            )
        )

        for rank, item in enumerate(
            items,
            start=1,
        ):
            PlanningItem.objects.filter(
                pk=item.pk,
            ).update(
                scheduled_date=
                    item.manual_requested_date,
                execution_rank=
                    rank,
            )

        return {
            'changed_ids': [
                first.pk,
                second.pk,
            ],
            'conflicts': [],
            'scheduler': {},
        }

    monkeypatch.setattr(
        scheduling,
        'schedule',
        fake_schedule,
    )

    response = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        first.pk,
                    'date':
                        today.isoformat(),
                    'order':
                        2,
                },
                {
                    'item_id':
                        second.pk,
                    'date':
                        today.isoformat(),
                    'order':
                        1,
                },
            ],
        },
        format='json',
    )

    assert response.status_code == 200, response.data

    assert calls == [
        user.pk,
    ]

    first.refresh_from_db()
    second.refresh_from_db()

    assert (
        first.manual_requested_date
        == today
    )

    assert (
        first.manual_requested_order
        == 2
    )

    assert (
        second.manual_requested_date
        == today
    )

    assert (
        second.manual_requested_order
        == 1
    )

    assert response.data[
        'can_undo'
    ] is True


def test_focus_anchor_batch_undo_restores_manual_intent(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    today = timezone.localdate()

    item = make_item(
        user,
        'Undo batch anchor',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    PlanningItem.objects.filter(
        pk=item.pk,
    ).update(
        scheduled_date=today,
        execution_rank=1,
    )

    monkeypatch.setattr(
        scheduling,
        'schedule',
        lambda *args, **kwargs: {
            'changed_ids': [
                item.pk,
            ],
            'conflicts': [],
            'scheduler': {},
        },
    )

    response = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        item.pk,
                    'date':
                        today.isoformat(),
                    'order':
                        1,
                },
            ],
        },
        format='json',
    )

    assert response.status_code == 200, response.data

    item.refresh_from_db()

    assert (
        item.manual_requested_order
        == 1
    )

    undo = api_for(user).post(
        '/api/planning/items/undo/',
        {},
        format='json',
    )

    assert undo.status_code == 200

    item.refresh_from_db()

    assert (
        item.manual_requested_date
        is None
    )

    assert (
        item.manual_requested_order
        is None
    )


def test_focus_anchor_batch_rejects_duplicate_manual_slot(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    today = timezone.localdate()

    first = make_item(
        user,
        'Duplicate one',
    )

    second = make_item(
        user,
        'Duplicate two',
    )

    calls = []

    monkeypatch.setattr(
        scheduling,
        'schedule',
        lambda *args, **kwargs: (
            calls.append(True)
            or {
                'changed_ids': [],
                'conflicts': [],
                'scheduler': {},
            }
        ),
    )

    response = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        first.pk,
                    'date':
                        today.isoformat(),
                    'order':
                        1,
                },
                {
                    'item_id':
                        second.pk,
                    'date':
                        today.isoformat(),
                    'order':
                        1,
                },
            ],
        },
        format='json',
    )

    assert response.status_code == 409
    assert calls == []


def test_focus_anchor_batch_does_not_mutate_priority(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    today = timezone.localdate()

    item = make_item(
        user,
        'Priority isolation',
    )

    before = (
        PlanningItem.objects
        .get(
            pk=item.pk
        )
        .priority_position
    )

    monkeypatch.setattr(
        scheduling,
        'schedule',
        lambda *args, **kwargs: {
            'changed_ids': [
                item.pk,
            ],
            'conflicts': [],
            'scheduler': {},
        },
    )

    response = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        item.pk,
                    'date':
                        today.isoformat(),
                    'order':
                        1,
                },
            ],
        },
        format='json',
    )

    assert response.status_code == 200

    item.refresh_from_db()

    assert (
        item.priority_position
        == before
    )



def test_focus_anchor_batch_allows_same_order_across_buckets(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    today = timezone.localdate()

    quick = make_item(
        user,
        'Quick local one',
        duration_category=DurationCategory.UNDER_20_MINUTES,
    )

    side = make_item(
        user,
        'Side local one',
        duration_category=DurationCategory.UNDER_1_HOUR,
    )

    boss = make_item(
        user,
        'Boss local one',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    calls = []

    def fake_schedule(
        schedule_user,
        today=None,
        **kwargs,
    ):
        calls.append(
            schedule_user.pk
        )

        return {
            'changed_ids': [
                quick.pk,
                side.pk,
                boss.pk,
            ],
            'conflicts': [],
            'scheduler': {},
        }

    monkeypatch.setattr(
        scheduling,
        'schedule',
        fake_schedule,
    )

    response = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        quick.pk,
                    'date':
                        today.isoformat(),
                    'order':
                        1,
                },
                {
                    'item_id':
                        side.pk,
                    'date':
                        today.isoformat(),
                    'order':
                        1,
                },
                {
                    'item_id':
                        boss.pk,
                    'date':
                        today.isoformat(),
                    'order':
                        1,
                },
            ],
        },
        format='json',
    )

    assert response.status_code == 200, response.data
    assert calls == [
        user.pk,
    ]

    quick.refresh_from_db()
    side.refresh_from_db()
    boss.refresh_from_db()

    assert quick.manual_requested_order == 1
    assert side.manual_requested_order == 1
    assert boss.manual_requested_order == 1


def test_focus_anchor_batch_rejects_same_order_inside_same_bucket(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    today = timezone.localdate()

    boss_a = make_item(
        user,
        'Boss A',
        duration_category=DurationCategory.UNDER_4_HOURS,
    )

    boss_b = make_item(
        user,
        'Boss B',
        duration_category=DurationCategory.OVER_16_HOURS,
    )

    calls = []

    monkeypatch.setattr(
        scheduling,
        'schedule',
        lambda *args, **kwargs: (
            calls.append(True)
            or {
                'changed_ids': [],
                'conflicts': [],
                'scheduler': {},
            }
        ),
    )

    response = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        boss_a.pk,
                    'date':
                        today.isoformat(),
                    'order':
                        1,
                },
                {
                    'item_id':
                        boss_b.pk,
                    'date':
                        today.isoformat(),
                    'order':
                        1,
                },
            ],
        },
        format='json',
    )

    assert response.status_code == 409
    assert calls == []



def test_focus_batch_dependency_decision_can_dissolve_and_undo(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    today = timezone.localdate()

    prerequisite = make_item(
        user,
        'Prerequisite A',
        duration_category=
            DurationCategory.UNDER_20_MINUTES,
    )

    dependent = make_item(
        user,
        'Dependent B',
        duration_category=
            DurationCategory.UNDER_20_MINUTES,
    )

    PlanningDependency.objects.create(
        prerequisite=prerequisite,
        dependent=dependent,
    )

    PlanningItem.objects.filter(
        pk=dependent.pk,
    ).update(
        scheduled_date=today,
        execution_rank=2,
    )

    monkeypatch.setattr(
        scheduling,
        'schedule',
        lambda *args, **kwargs: {
            'changed_ids': [
                dependent.pk,
            ],
            'conflicts': [],
            'scheduler': {},
        },
    )

    conflict = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        dependent.pk,

                    'date':
                        today.isoformat(),

                    'order':
                        1,
                },
            ],
        },
        format='json',
    )

    assert conflict.status_code == 409

    assert conflict.data[
        'conflicts'
    ][0][
        'code'
    ] == 'blocked_dependency'

    assert conflict.data[
        'conflicts'
    ][0][
        'prerequisites'
    ][0][
        'title'
    ] == 'Prerequisite A'

    accepted = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        dependent.pk,

                    'date':
                        today.isoformat(),

                    'order':
                        1,

                    'dissolve_dependencies':
                        True,
                },
            ],
        },
        format='json',
    )

    assert accepted.status_code == 200, accepted.data

    assert not PlanningDependency.objects.filter(
        prerequisite=prerequisite,
        dependent=dependent,
    ).exists()

    undo = api_for(user).post(
        '/api/planning/items/undo/',
        {},
        format='json',
    )

    assert undo.status_code == 200

    assert PlanningDependency.objects.filter(
        prerequisite=prerequisite,
        dependent=dependent,
    ).exists()


def test_focus_batch_deadline_returns_explicit_decision(
    api_for,
    user,
    make_item,
):
    today = timezone.localdate()

    item = make_item(
        user,
        'Deadline task',
        duration_category=
            DurationCategory.UNDER_1_HOUR,
        due_date=today,
    )

    response = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        item.pk,

                    'date':
                        (
                            today
                            + timedelta(
                                days=1,
                            )
                        ).isoformat(),

                    'order':
                        1,
                },
            ],
        },
        format='json',
    )

    assert response.status_code == 409

    assert response.data[
        'conflicts'
    ][0][
        'code'
    ] == 'after_deadline'

    assert response.data[
        'decisions'
    ][0][
        'code'
    ] == 'change_deadline'



def test_focus_batch_reprompts_capacity_after_previous_overload_permission(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    today = timezone.localdate()

    tomorrow = (
        today
        + timedelta(
            days=1,
        )
    )

    existing = [
        make_item(
            user,
            f'Existing {index}',
            duration_category=
                DurationCategory.UNDER_4_HOURS,
        )
        for index
        in range(
            1,
            4,
        )
    ]

    incoming = make_item(
        user,
        'Incoming fourth',
        duration_category=
            DurationCategory.UNDER_4_HOURS,
    )

    for index, item in enumerate(
        existing,
        start=1,
    ):
        PlanningItem.objects.filter(
            pk=item.pk,
        ).update(
            scheduled_date=today,
            execution_rank=index,
            manual_requested_date=today,
            manual_requested_order=index,
        )

    PlanningItem.objects.filter(
        pk=incoming.pk,
    ).update(
        scheduled_date=tomorrow,
        execution_rank=4,
        manual_requested_date=tomorrow,
        manual_requested_order=1,
    )

    SchedulingOverload.objects.create(
        user=user,
        date=today,
        allowed=True,
    )

    monkeypatch.setattr(
        scheduling,
        'schedule',
        lambda *args, **kwargs: {
            'changed_ids': [],
            'conflicts': [],
            'scheduler': {},
        },
    )

    response = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        incoming.pk,

                    'date':
                        today.isoformat(),

                    'order':
                        4,
                },
            ],
        },
        format='json',
    )

    assert response.status_code == 409

    conflict = (
        response.data[
            'conflicts'
        ][0]
    )

    assert (
        conflict[
            'code'
        ]
        == 'capacity_exceeded'
    )

    assert (
        conflict[
            'capacity_limit'
        ]
        == 3
    )

    assert (
        conflict[
            'resulting_count'
        ]
        == 4
    )

    assert (
        conflict[
            'over_by_count'
        ]
        == 1
    )

    assert (
        response.data[
            'decisions'
        ][0][
            'code'
        ]
        == 'allow_overload'
    )

    accepted = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        incoming.pk,

                    'date':
                        today.isoformat(),

                    'order':
                        4,

                    'allow_overload':
                        True,
                },
            ],
        },
        format='json',
    )

    assert (
        accepted.status_code
        == 200
    )


def test_focus_batch_same_day_reorder_does_not_reprompt_capacity(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    today = timezone.localdate()

    items = [
        make_item(
            user,
            f'Item {index}',
            duration_category=
                DurationCategory.UNDER_4_HOURS,
        )
        for index
        in range(
            1,
            5,
        )
    ]

    for index, item in enumerate(
        items,
        start=1,
    ):
        PlanningItem.objects.filter(
            pk=item.pk,
        ).update(
            scheduled_date=today,
            execution_rank=index,
            manual_requested_date=today,
            manual_requested_order=index,
        )

    SchedulingOverload.objects.create(
        user=user,
        date=today,
        allowed=True,
    )

    monkeypatch.setattr(
        scheduling,
        'schedule',
        lambda *args, **kwargs: {
            'changed_ids': [],
            'conflicts': [],
            'scheduler': {},
        },
    )

    response = api_for(user).post(
        '/api/planning/focus/anchor/batch/',
        {
            'changes': [
                {
                    'item_id':
                        items[2].pk,

                    'date':
                        today.isoformat(),

                    'order':
                        4,
                },
                {
                    'item_id':
                        items[3].pk,

                    'date':
                        today.isoformat(),

                    'order':
                        3,
                },
            ],
        },
        format='json',
    )

    assert (
        response.status_code
        == 200
    )


def test_focus_reprioritise_runs_scheduler_once(
    api_for,
    user,
    make_item,
    monkeypatch,
):
    make_item(
        user,
        'First',
        duration_category=DurationCategory.UNDER_20_MINUTES,
        priority_position=1,
    )

    second = make_item(
        user,
        'Second',
        duration_category=DurationCategory.UNDER_20_MINUTES,
        priority_position=2,
    )

    calls = []
    real_schedule = scheduling.schedule

    def counted_schedule(*args, **kwargs):
        calls.append((args, kwargs))
        return real_schedule(*args, **kwargs)

    monkeypatch.setattr(
        scheduling,
        'schedule',
        counted_schedule,
    )

    response = api_for(user).post(
        '/api/planning/focus/reprioritise/',
        {
            'item_id': second.pk,
            'new_position': 1,
        },
        format='json',
    )

    assert response.status_code == 200, response.data
    assert len(calls) == 1



@pytest.mark.parametrize(
    "flavour",
    [
        "lock-in",
        "monk",
    ],
)
def test_focus_displaced_span_rank_edit_survives_real_scheduler_round_trip(
    api_for,
    user,
    make_item,
    flavour,
):
    """Rank edit anchors only the two rows whose local positions changed."""

    from planning.models import SchedulingState

    today = timezone.localdate()

    SchedulingState.objects.update_or_create(
        user=user,
        defaults={
            "scheduler_flavour": flavour,
        },
    )

    one = make_item(
        user,
        "Behavior 1",
        duration_category=DurationCategory.UNDER_1_HOUR,
        priority_position=1,
    )

    three = make_item(
        user,
        "Behavior 3",
        duration_category=DurationCategory.UNDER_1_HOUR,
        priority_position=2,
    )

    two = make_item(
        user,
        "Behavior 2",
        duration_category=DurationCategory.UNDER_1_HOUR,
        priority_position=3,
    )

    four = make_item(
        user,
        "Behavior 4",
        duration_category=DurationCategory.UNDER_1_HOUR,
        priority_position=4,
    )

    initial = [
        one,
        three,
        two,
        four,
    ]

    for rank, item in enumerate(
        initial,
        start=1,
    ):
        PlanningItem.objects.filter(
            pk=item.pk,
        ).update(
            scheduled_date=today,
            execution_rank=rank,
            manual_requested_date=None,
            manual_requested_order=None,
        )

    response = api_for(user).post(
        "/api/planning/focus/anchor/batch/",
        {
            "changes": [
                {
                    "item_id": two.pk,
                    "date": today.isoformat(),
                    "order": 2,
                },
                {
                    "item_id": three.pk,
                    "date": today.isoformat(),
                    "order": 3,
                },
            ],
        },
        format="json",
    )

    assert response.status_code == 200, response.data

    projection = api_for(user).get(
        "/api/planning/focus/",
    )

    actual = [
        row["item_id"]
        for row in projection.data["candidates"]
        if row["item_id"] in {
            one.pk,
            two.pk,
            three.pk,
            four.pk,
        }
    ]

    assert actual == [
        one.pk,
        two.pk,
        three.pk,
        four.pk,
    ]

    one.refresh_from_db()
    two.refresh_from_db()
    three.refresh_from_db()
    four.refresh_from_db()

    assert one.manual_requested_date is None
    assert one.manual_requested_order is None

    assert four.manual_requested_date is None
    assert four.manual_requested_order is None

    assert two.manual_requested_date == today
    assert two.manual_requested_order == 2

    assert three.manual_requested_date == today
    assert three.manual_requested_order == 3


@pytest.mark.parametrize(
    "flavour",
    [
        "lock-in",
        "monk",
    ],
)
def test_focus_displaced_span_arrow_move_survives_real_scheduler_round_trip(
    api_for,
    user,
    make_item,
    flavour,
):
    """Arrow action anchors moved row plus the sibling it displaced."""

    from planning.models import SchedulingState

    today = timezone.localdate()

    SchedulingState.objects.update_or_create(
        user=user,
        defaults={
            "scheduler_flavour": flavour,
        },
    )

    one = make_item(
        user,
        "Arrow 1",
        duration_category=DurationCategory.UNDER_1_HOUR,
        priority_position=1,
    )

    four = make_item(
        user,
        "Arrow 4",
        duration_category=DurationCategory.UNDER_1_HOUR,
        priority_position=2,
    )

    two = make_item(
        user,
        "Arrow 2",
        duration_category=DurationCategory.UNDER_1_HOUR,
        priority_position=3,
    )

    three = make_item(
        user,
        "Arrow 3",
        duration_category=DurationCategory.UNDER_1_HOUR,
        priority_position=4,
    )

    initial = [
        one,
        four,
        two,
        three,
    ]

    for rank, item in enumerate(
        initial,
        start=1,
    ):
        PlanningItem.objects.filter(
            pk=item.pk,
        ).update(
            scheduled_date=today,
            execution_rank=rank,
            manual_requested_date=None,
            manual_requested_order=None,
        )

    response = api_for(user).post(
        "/api/planning/focus/anchor/batch/",
        {
            "changes": [
                {
                    "item_id": three.pk,
                    "date": today.isoformat(),
                    "order": 3,
                },
                {
                    "item_id": two.pk,
                    "date": today.isoformat(),
                    "order": 4,
                },
            ],
        },
        format="json",
    )

    assert response.status_code == 200, response.data

    projection = api_for(user).get(
        "/api/planning/focus/",
    )

    actual = [
        row["item_id"]
        for row in projection.data["candidates"]
        if row["item_id"] in {
            one.pk,
            four.pk,
            two.pk,
            three.pk,
        }
    ]

    assert actual == [
        one.pk,
        four.pk,
        three.pk,
        two.pk,
    ]

    one.refresh_from_db()
    four.refresh_from_db()
    two.refresh_from_db()
    three.refresh_from_db()

    assert one.manual_requested_order is None
    assert four.manual_requested_order is None

    assert three.manual_requested_order == 3
    assert two.manual_requested_order == 4


def test_focus_projection_exposes_scheduler_canonical_bucket_for_residual(
    api_for,
    user,
    make_item,
):
    """
    A schedulable parent with only completed children is a residual task.

    Its raw duration may still be UNDER_4_HOURS, but canonical Focus/scheduler
    semantics place residual work in QUICK WINS.
    """

    today = timezone.localdate()

    residual = make_item(
        user,
        "Residual boss-looking task",
        duration_category=DurationCategory.UNDER_4_HOURS,
        priority_position=1,
    )

    completed_child = make_item(
        user,
        "Completed child",
        parent=residual,
        duration_category=DurationCategory.UNDER_1_HOUR,
    )

    PlanningItem.objects.filter(
        pk=completed_child.pk,
    ).update(
        is_completed=True,
        percent_completed=100,
    )

    PlanningItem.objects.filter(
        pk=residual.pk,
    ).update(
        scheduled_date=today,
        execution_rank=1,
    )

    boss = make_item(
        user,
        "Real boss task",
        duration_category=DurationCategory.UNDER_4_HOURS,
        priority_position=2,
    )

    PlanningItem.objects.filter(
        pk=boss.pk,
    ).update(
        scheduled_date=today,
        execution_rank=2,
    )

    response = api_for(user).get(
        "/api/planning/focus/",
    )

    assert response.status_code == 200

    rows = {
        row["item_id"]:
            row
        for row in response.data["candidates"]
    }

    assert (
        rows[
            residual.pk
        ]["duration_category"]
        == DurationCategory.UNDER_4_HOURS
    )

    assert (
        rows[
            residual.pk
        ]["focus_bucket"]
        == "quick"
    )

    assert (
        rows[
            boss.pk
        ]["focus_bucket"]
        == "boss"
    )


@pytest.mark.parametrize('flavour', [None, 'lock-in'])
@pytest.mark.parametrize('anchored', [False, True])
def test_single_drag_batch_preserves_other_anchor_facts_and_history(user, make_item, api_for, flavour, anchored):
    from datetime import date
    from freezegun import freeze_time
    from planning.models import SchedulingState
    from planning.services import history, scheduler_v1

    today = date(2026, 10, 1)
    with freeze_time('2026-10-01T12:00:00Z'):
        SchedulingState.objects.create(user=user, scheduler_flavour=flavour)
        others = [make_item(user, title, duration_category=DurationCategory.UNDER_4_HOURS,
                            manual_requested_date=today if anchored else None,
                            manual_requested_order=index if anchored else None,
                            manual_anchor_origin_date=today - timedelta(days=1) if anchored else None)
                  for index, title in enumerate(['A', 'B'], 1)]
        dragged = make_item(user, 'C', duration_category=DurationCategory.UNDER_4_HOURS)
        scheduling.daily_schedule(user, today=today)

        def anchor_facts(item):
            item.refresh_from_db()
            return item.manual_requested_date, item.manual_requested_order, item.manual_anchor_origin_date

        before = [anchor_facts(item) for item in others]
        client = api_for(user)
        if anchored:
            duplicate = client.post('/api/planning/focus/anchor/batch/', {'changes': [
                {'item_id': dragged.pk, 'date': today.isoformat(), 'order': 1},
            ]}, format='json')
            assert duplicate.status_code == 409
            assert any(row['code'] == 'anchor_order_taken' for row in duplicate.data['conflicts'])
            assert anchor_facts(dragged) == (None, None, None)
        order = 3 if anchored else 1
        response = client.post('/api/planning/focus/anchor/batch/', {'changes': [
            {'item_id': dragged.pk, 'date': today.isoformat(), 'order': order},
        ]}, format='json')
        assert response.status_code == 200, response.data
        assert anchor_facts(dragged) == (today, order, today)
        assert [anchor_facts(item) for item in others] == before
        saved = next(row for row in response.data['focus']['candidates'] if row['item_id'] == dragged.pk)
        assert saved['manual_requested_order'] == order
        request = scheduler_v1.build_scheduler_input(user, flavour='lock-in', today=today)
        slots = [(row.anchor_date, row.anchor_order) for row in request.tasks if row.anchor_date is not None]
        assert len(slots) == len(set(slots))
        history.undo(user)
        assert anchor_facts(dragged) == (None, None, None)
        assert [anchor_facts(item) for item in others] == before
        history.redo(user)
        assert anchor_facts(dragged) == (today, order, today)
        assert [anchor_facts(item) for item in others] == before
