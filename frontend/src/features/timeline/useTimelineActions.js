import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { completeItem, getHistoryStatus, undoPlanningAction, redoPlanningAction, updateTimelineCapacity, updateTimelineOverload, rescheduleTimeline } from '../../api/planning'

export default function useTimelineActions() {
  const client = useQueryClient()
  const history = useQuery({ queryKey: ['planning', 'history'], queryFn: getHistoryStatus })
  const mutation = useMutation({
    mutationKey: ['planning', 'timeline', 'mutation'],
    mutationFn: ({ type, payload }) => {
      switch (type) {
        case 'reschedule': return rescheduleTimeline()
        case 'complete': return completeItem(payload.id, { completed: payload.completed })
        case 'undo': return undoPlanningAction()
        case 'redo': return redoPlanningAction()
        case 'capacity': return updateTimelineCapacity(payload)
        case 'overload': return updateTimelineOverload(payload)
        default: throw new Error('Unknown Timeline action')
      }
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ['planning'] }),
  })
  const detail = mutation.error?.response?.data
  const error = detail?.conflicts?.map((c) => (c.item_id ? 'Item ' + c.item_id + ': ' : '') + c.code.replaceAll('_', ' ')).join('; ')
    || (detail ? Object.entries(detail).map(([key, value]) => key + ': ' + String(value)).join('; ') : mutation.error?.message)
  return { history, busy: mutation.isPending, error, run: (type, payload) => mutation.mutateAsync({ type, payload }) }
}
