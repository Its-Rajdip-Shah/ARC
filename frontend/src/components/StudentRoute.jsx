import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function StudentRoute() {
  const location = useLocation()

  const accessToken = useAuthStore((state) => state.accessToken)
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const user = useAuthStore((state) => state.user)

  // A persisted refresh token represents an existing student session.
  // SessionHydrator is responsible for restoring the short-lived access token.
  if (!accessToken && !refreshToken) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (user?.is_admin) {
    return <Navigate to="/admin" replace />
  }

  return <Outlet />
}
