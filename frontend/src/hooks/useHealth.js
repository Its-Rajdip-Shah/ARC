import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../api/auth'

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  })
}
