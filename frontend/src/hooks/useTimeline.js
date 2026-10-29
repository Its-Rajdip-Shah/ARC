import { useQuery } from '@tanstack/react-query'
import { getTimeline } from '../api/planning'

export function useTimeline(params) {
  return useQuery({
    queryKey: ['planning', 'timeline', params],
    queryFn: () => getTimeline(params),
    refetchInterval: (query) => query.state.data?.scheduler?.freshness?.pending ? 1500 : false,
    refetchIntervalInBackground: true,
  })
}
