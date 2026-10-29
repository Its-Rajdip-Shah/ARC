"""Database-polled scheduler worker orchestration.

The state row is used only to discover a revision.  Capture and publication
take their own short transactions; engine execution is deliberately between
them, with no Django transaction or canonical user lock retained.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import F, Q
from django.utils import timezone

from planning.models import SchedulingState
from planning.services import async_scheduler, scheduling

logger = logging.getLogger(__name__)


def pending_user_ids(*, limit=20):
    """Return a bounded, lock-safe batch of due durable requests.

    ``skip_locked`` prevents discovery from waiting behind a short capture or
    publication transaction. It is a coordination optimisation, not a lease:
    publication freshness makes duplicate compute harmless after a crash.
    """
    now = timezone.now()
    with transaction.atomic():
        rows = (SchedulingState.objects.select_for_update(skip_locked=True)
                .filter(scheduling_revision__gt=F('applied_scheduling_revision'))
                .filter(Q(scheduler_retry_after__isnull=True) |
                        Q(scheduler_retry_after__lte=now))
                .order_by('scheduler_retry_after', 'pk')[:limit])
        return [(row.user_id, row.scheduling_revision) for row in rows]


def _record_failure(user_id, revision, exc):
    # Exponential but bounded delay. A newer request clears it, so a user
    # never has to wait for an old failure after changing canonical intent.
    with transaction.atomic():
        state = SchedulingState.objects.select_for_update().filter(user_id=user_id).first()
        if state is None or state.scheduling_revision != revision:
            return
        state.scheduler_failure_count += 1
        delay = min(300, 2 ** min(state.scheduler_failure_count, 8))
        state.scheduler_retry_after = timezone.now() + timedelta(seconds=delay)
        state.save(update_fields=['scheduler_failure_count', 'scheduler_retry_after'])
    logger.exception('scheduler_request_failed', extra={
        'user_id': user_id, 'revision': revision, 'retry_seconds': delay,
        'error_type': type(exc).__name__,
    })


def process_request(user_id, revision):
    """Process one revision; expected stale/duplicate races are successes."""
    user = get_user_model().objects.get(pk=user_id)
    try:
        # Flavour is a canonical choice captured with the request.  Legacy
        # users remain supported; importantly their old optimiser is executed
        # here, never in the HTTP mutation that queued the request.
        state = SchedulingState.objects.filter(user_id=user_id).only(
            'scheduler_flavour', 'scheduling_revision'
        ).first()
        if state is None or state.scheduling_revision != revision:
            return 'superseded'
        if state.scheduler_flavour is None:
            captured = async_scheduler.capture_legacy_request(user, revision)
            computed = async_scheduler.compute_legacy_request(captured)
            async_scheduler.publish_legacy_result(computed)
        else:
            captured = async_scheduler.capture_v1_request(user, revision)
            computed = async_scheduler.compute_v1_request(captured)
            async_scheduler.publish_v1_result(computed)
    except (scheduling.StaleSchedulingRevision,
            async_scheduler.SchedulingRevisionAlreadyApplied,
            async_scheduler.SchedulerFlavourChanged):
        logger.info('scheduler_request_superseded', extra={
            'user_id': user_id, 'revision': revision,
        })
        return 'superseded'
    except Exception as exc:
        _record_failure(user_id, revision, exc)
        return 'failed'

    logger.info('scheduler_request_published', extra={
        'user_id': user_id, 'revision': revision,
    })
    return 'published'


def run_once(*, limit=20):
    """Drain one currently-visible bounded batch, for tests and --once."""
    results = []
    for user_id, revision in pending_user_ids(limit=limit):
        results.append(process_request(user_id, revision))
    return results
