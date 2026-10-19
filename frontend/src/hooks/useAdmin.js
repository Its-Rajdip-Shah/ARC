import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approvePasswordReset, getAdminStats, listAdminUsers, listPasswordResets, lockUser, unlockUser } from '../api/admin'

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

export function usePasswordResets() {
  return useQuery({
    queryKey: ['admin', 'password-resets'],
    queryFn: listPasswordResets,
    refetchInterval: 4000,
  })
}

export function useApprovePasswordReset() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: approvePasswordReset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'password-resets'] })
    },
  })
}
