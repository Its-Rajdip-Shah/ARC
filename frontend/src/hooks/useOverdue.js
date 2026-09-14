import { useQuery } from '@tanstack/react-query'
import { getOverdue } from '../api/planning'

export function useOverdue() {
  return useQuery({
    queryKey: ['planning', 'overdue'],
    queryFn: getOverdue,
  })
}
