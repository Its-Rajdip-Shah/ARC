import { QueryClient } from '@tanstack/react-query'

function isClientError(error) {
  const status = error?.response?.status
  return typeof status === 'number' && status >= 400 && status < 500
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (isClientError(error)) return false
        return failureCount < 3
      },
    },
    mutations: {
      retry: false,
    },
  },
})
