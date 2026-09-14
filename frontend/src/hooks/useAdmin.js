import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getAdminStats, listAdminUsers, lockUser, unlockUser } from '../api/admin'

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getAdminStats,
  })
}

export function useAdminUsers(params) {
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => listAdminUsers(params),
  })
}

export function useLockUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: lockUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })
}

export function useUnlockUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: unlockUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin'] })
    },
  })
}
