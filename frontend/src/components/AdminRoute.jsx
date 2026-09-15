import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

/**
 * FR-15: the staff console is a separate surface. A student session, even a
 * valid one, must not render privileged views. Django's /admin/ is never
 * referenced; this gate only looks at the JWT user's is_admin flag.
 */
export default function AdminRoute() {
  const location = useLocation()
  const accessToken = useAuthStore((state) => state.accessToken)
  const user = useAuthStore((state) => state.user)

  if (!accessToken) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 text-slate-400">
        Restoring your staff session…
      </div>
    )
  }

  if (!user.is_admin) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
