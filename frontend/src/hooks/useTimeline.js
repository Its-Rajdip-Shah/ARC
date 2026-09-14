import { useQuery } from '@tanstack/react-query'
import { getTimeline } from '../api/planning'

export function useTimeline(params) {
  return useQuery({
    queryKey: ['planning', 'timeline', params],
    queryFn: () => getTimeline(params),
  })
}
