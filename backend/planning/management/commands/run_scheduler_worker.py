import logging
import signal
import time

from django.core.management.base import BaseCommand
from django.db import transaction

from planning.models import SchedulingState
from planning.services.calendar_dates import user_local_date
from planning.services import scheduling
from planning.services.scheduler_worker import run_once


class Command(BaseCommand):
    help = 'Run the durable PostgreSQL-backed ARC scheduler worker.'

    def add_arguments(self, parser):
        parser.add_argument('--once', action='store_true', help='Process one bounded batch then exit.')
        parser.add_argument('--poll-seconds', type=float, default=1.0)
        parser.add_argument('--batch-size', type=int, default=20)

    def handle(self, *args, **options):
        stopping = False

        def stop(signum, frame):
            nonlocal stopping
            stopping = True
            logging.getLogger(__name__).info('scheduler_worker_shutdown_requested', extra={'signal': signum})

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGINT, stop)
        poll = max(0.1, options['poll_seconds'])
        logger = logging.getLogger(__name__)
        next_maintenance_check = 0.0

        while not stopping:
            now = time.monotonic()

            if now >= next_maintenance_check:
                # Daily canonical maintenance is independent of HTTP reads.
                # Check each user's own calendar date, not the server date.
                # Each user's maintenance transaction is isolated so one
                # failure cannot prevent other users from progressing.
                for state in SchedulingState.objects.select_related(
                    'user'
                ).order_by('pk').iterator():
                    if stopping:
                        break

                    today = user_local_date(state.user)

                    if state.last_global_date == today:
                        continue

                    try:
                        with transaction.atomic():
                            # Recheck under the canonical user lock to avoid
                            # duplicate maintenance from concurrent workers.
                            from planning.services import priority

                            priority._lock(state.user)

                            current = SchedulingState.objects.get(
                                pk=state.pk
                            )

                            if current.last_global_date != today:
                                scheduling.daily_schedule(
                                    state.user,
                                    today=today,
                                )
                    except Exception:
                        logger.exception(
                            'scheduler_daily_maintenance_failed',
                            extra={'user_id': state.user_id},
                        )

                next_maintenance_check = time.monotonic() + 60.0

            results = run_once(
                limit=max(1, options['batch_size'])
            )

            if options['once']:
                return

            if not results:
                time.sleep(poll)
