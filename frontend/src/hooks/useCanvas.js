import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteCanvasConnection,
  getCanvasConnection,
  getCanvasCourses,
  listSyncLogs,
  saveCanvasConnection,
  saveCanvasCourses,
  syncCanvas,
  testCanvasConnection,
} from '../api/canvas'

export function useCanvasConnection() {
  return useQuery({
    queryKey: ['canvas', 'connection'],
    queryFn: getCanvasConnection,
    retry: false,
  })
}

export function useSyncLogs() {
  return useQuery({
    queryKey: ['canvas', 'sync-logs'],
    queryFn: () => listSyncLogs(),
  })
}

export function useSaveCanvasConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveCanvasConnection,
    onSuccess: (data) => {
      queryClient.setQueryData(['canvas', 'connection'], data)
      queryClient.invalidateQueries({ queryKey: ['canvas', 'courses'] })
    },
  })
}

export function useDeleteCanvasConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteCanvasConnection,
    onSuccess: () => {
      queryClient.setQueryData(['canvas', 'connection'], null)
      queryClient.removeQueries({ queryKey: ['canvas', 'courses'] })
    },
  })
}

export function useTestCanvasConnection() {
  return useMutation({ mutationFn: testCanvasConnection })
}

export function useSyncCanvas() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: syncCanvas,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['canvas'] })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planning'] })
    },
  })
}

export function useCanvasCourses(enabled) {
  return useQuery({
    queryKey: ['canvas', 'courses'],
    queryFn: getCanvasCourses,
    enabled,
    retry: false,
  })
}

export function useSaveCanvasCourses() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveCanvasCourses,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canvas', 'courses'] })
    },
  })
}
