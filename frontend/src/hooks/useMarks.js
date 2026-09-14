import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMarks, reorderMarks } from '../api/planning'

export function useMarks() {
  return useQuery({
    queryKey: ['planning', 'marks'],
    queryFn: getMarks,
  })
}

export function useReorderMarks() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: reorderMarks,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning', 'marks'] })
    },
  })
}
