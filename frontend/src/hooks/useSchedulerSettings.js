import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSchedulerSettings,
  rescheduleTimeline,
  updateSchedulerSettings,
} from '../api/planning'

export async function saveSchedulerFlavour(
  flavour,
) {
  /*
   * Persist first. The scheduler endpoint then reads the newly stored
   * production flavour from the backend.
   */
  const saved =
    await updateSchedulerSettings({
      flavour,
    })

  if (
    flavour != null
  ) {
    await rescheduleTimeline()
  }

  return saved
}


export function useSchedulerSettings() {
  const client = useQueryClient()

  const query = useQuery({
    queryKey: ['planning', 'scheduler-settings'],
    queryFn: getSchedulerSettings,
  })

  const mutation = useMutation({
    mutationKey: [
      'planning',
      'scheduler-settings',
      'update',
    ],

    mutationFn:
      saveSchedulerFlavour,

    onSuccess: () => {
      /*
       * The setting mutation owns both save + optional reschedule, so refresh
       * all affected planning projections once the whole operation settles.
       */
      void client.invalidateQueries({
        queryKey: [
          'planning',
          'scheduler-settings',
        ],
      })

      void client.invalidateQueries({
        queryKey: [
          'planning',
          'timeline',
        ],
      })

      void client.invalidateQueries({
        queryKey: [
          'planning',
          'timeline-universe',
        ],
      })
    },
  })

  return {
    ...query,
    saving: mutation.isPending,
    saveError: mutation.error,
    setFlavour: (flavour) => mutation.mutateAsync(flavour),
  }
}
