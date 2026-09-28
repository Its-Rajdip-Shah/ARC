import {
  useQuery,
} from '@tanstack/react-query'

import {
  getTimelineNavigation,
} from '../api/planning'

export function useTimelineUniverse() {
  return useQuery({
    queryKey: [
      'planning',
      'timeline-universe',
    ],

    queryFn:
      getTimelineNavigation,
  })
}
