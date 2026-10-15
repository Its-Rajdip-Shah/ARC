import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getMarks, reorderMarks, simulateMarks, updateAssignmentMark } from '../api/planning'

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

export function useSimulateMarks() {
  return useMutation({
    mutationFn: simulateMarks,
  })
}

export function useUpdateAssignmentMark() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ assessmentId, mark }) =>
      updateAssignmentMark(assessmentId, {
        mark_achieved: mark,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning', 'marks'] })
    },
  })
}