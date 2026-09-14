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
    mutationFn: reorderPriority,
    onSuccess: (data) => {
      queryClient.setQueryData(['planning', 'priority'], data)
    },
  })
}
