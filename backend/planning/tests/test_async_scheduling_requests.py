"""Stage 1 durable, nonblocking scheduling-request boundary."""

from datetime import date
from unittest.mock import patch

import pytest
from django.db import transaction

from planning.models import SchedulingState
from planning.services import scheduling


pytestmark = pytest.mark.django_db


def test_initial_request_creates_a_pending_revision(user):
    result = scheduling.request_reconcile(user)

    state = SchedulingState.objects.get(user=user)

    assert result['requested_revision'] == 1
    assert result['applied_revision'] == 0
    assert result['pending'] is True
    assert result['mode'] == 'minimal'
    assert result['freshness'] == {
        'requested_revision': 1,
        'applied_revision': 0,
        'pending': True,
    }
    assert state.scheduling_revision == 1
    assert state.applied_scheduling_revision == 0


def test_repeated_requests_advance_the_revision(user):
    scheduling.request_reconcile(user)
    result = scheduling.request_reconcile(user)

    state = SchedulingState.objects.get(user=user)

    assert result['requested_revision'] == 2
    assert state.scheduling_revision == 2


def test_request_does_not_advance_the_applied_revision(user):
    SchedulingState.objects.create(
        user=user,
        scheduling_revision=4,
        applied_scheduling_revision=4,
    )

    scheduling.request_reconcile(user)

    state = SchedulingState.objects.get(user=user)
    assert state.scheduling_revision == 5
    assert state.applied_scheduling_revision == 4


def test_request_rolls_back_with_its_enclosing_mutation(user):
    with pytest.raises(RuntimeError):
        with transaction.atomic():
            scheduling.request_reconcile(user)
            raise RuntimeError('rollback canonical mutation')

    assert not SchedulingState.objects.filter(user=user).exists()


def test_multiple_requests_coalesce_to_the_latest_revision(user):
    first = scheduling.request_reconcile(user)
    second = scheduling.request_reconcile(user)

    state = SchedulingState.objects.get(user=user)

    assert first['requested_revision'] == 1
    assert second['requested_revision'] == 2
    assert state.scheduling_revision == 2
    assert state.applied_scheduling_revision == 0
    assert second['pending'] is True


def test_global_intent_survives_a_subsequent_minimal_request(user):
    scheduling.request_reconcile(user, mode='global')
    result = scheduling.request_reconcile(user, mode='minimal')

    state = SchedulingState.objects.get(user=user)

    assert result['mode'] == 'global'
    assert state.pending_scheduling_mode == 'global'
    assert state.scheduling_revision == 2


def test_request_never_invokes_scheduling_engines(user):
    with (
        patch.object(scheduling, 'schedule') as schedule,
        patch.object(scheduling, '_legacy_schedule') as legacy_schedule,
        patch('planning.services.scheduler_v1.run_scheduler_v1') as v1_schedule,
    ):
        scheduling.request_reconcile(user, today=date(2026, 10, 27))

    schedule.assert_not_called()
    legacy_schedule.assert_not_called()
    v1_schedule.assert_not_called()


def test_existing_synchronous_reconcile_behaviour_remains_unchanged(user):
    result = scheduling.reconcile(user, today=date(2026, 10, 27))

    state = SchedulingState.objects.get(user=user)

    assert result['scheduler'] == {
        'configured': False,
        'flavour': None,
    }
    assert state.scheduling_revision == 1
    assert state.applied_scheduling_revision == 1
