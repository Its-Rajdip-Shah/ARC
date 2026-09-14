import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  deleteCanvasConnection,
  getCanvasConnection,
  listSyncLogs,
  saveCanvasConnection,
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
    },
  })
}

export function useDeleteCanvasConnection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteCanvasConnection,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['canvas', 'connection'] })
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canvas'] })
      queryClient.invalidateQueries({ queryKey: ['planning'] })
    },
  })
}
