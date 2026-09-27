import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getPriorityOrder, reorderPriority } from '../api/planning'

export function usePriorityOrder() {
  return useQuery({
    queryKey: ['planning', 'priority'],
    queryFn: getPriorityOrder,
  })
}

export function useReorderPriority() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: ['planning', 'priority', 'reorder'],
    mutationFn: reorderPriority,
    onSuccess: async (data) => {
      // An older in-flight read must not overwrite the reorder response.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['planning', 'priority'] }),
        queryClient.cancelQueries({ queryKey: ['planning', 'tree'] }),
      ])
      queryClient.setQueryData(['planning', 'priority'], data)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['planning', 'history'] }),
        // Leaf sibling ordering is persisted by the backend, not inferred here.
        queryClient.invalidateQueries({ queryKey: ['planning', 'tree'], refetchType: 'all' }),
      ])
    },
  })
}
