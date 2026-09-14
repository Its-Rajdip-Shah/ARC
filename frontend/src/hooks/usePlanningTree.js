import { useQuery } from '@tanstack/react-query'
import { getPlanningTree } from '../api/planning'

export function usePlanningTree() {
  return useQuery({
    queryKey: ['planning', 'tree'],
    queryFn: getPlanningTree,
  })
}
