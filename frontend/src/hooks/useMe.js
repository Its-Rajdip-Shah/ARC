import { useQuery } from '@tanstack/react-query'
import { getMe } from '../api/auth'
import { useAuthStore } from '../stores/authStore'

export function useMe(options = {}) {
  const accessToken = useAuthStore((state) => state.accessToken)
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    enabled: Boolean(accessToken) && options.enabled !== false,
    ...options,
  })
}
