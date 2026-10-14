import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import {
  rescheduleTimeline,
} from '../../api/planning'
import {
  useSchedulerSettings,
} from '../../hooks/useSchedulerSettings'
import SchedulerRunButton from '../timeline/SchedulerRunButton'


export default function FocusSchedulerMascot({ className = 'focus-scheduler-mascot' }) {
  const queryClient =
    useQueryClient()

  const settings =
    useSchedulerSettings()

  const schedulerMutationCount =
    useIsMutating({
      mutationKey: [
        'planning',
        'scheduler',
      ],
    })

  const reschedule =
    useMutation({
      mutationKey: [
        'planning',
        'scheduler',
        'reschedule',
      ],

      mutationFn:
        rescheduleTimeline,

      async onSuccess() {
        await queryClient.invalidateQueries({
          queryKey: [
            'planning',
          ],
        })
      },
    })

  const flavour =
    settings.data?.flavour
    ?? null

  const runtime = {
    configured:
      flavour != null,

    flavour,
  }

  const schedulerBusy =
    schedulerMutationCount > 0

  const actions = {
    busy:
      schedulerBusy,

    schedulerBusy,

    run(type) {
      if (
        type
        !== 'reschedule'
      ) {
        return Promise.reject(
          new Error(
            'Unsupported scheduler action',
          ),
        )
      }

      return reschedule.mutateAsync()
    },
  }

  return (
    <div className={className}>
      <SchedulerRunButton
        runtime={runtime}
        actions={actions}
      />
    </div>
  )
}
