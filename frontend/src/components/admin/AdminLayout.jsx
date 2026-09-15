import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { logout } from '../../api/auth'
import { queryClient } from '../../lib/queryClient'
import { useAuthStore } from '../../stores/authStore'

const NAV = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/users', label: 'Accounts', end: false },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const refreshToken = useAuthStore((state) => state.refreshToken)

  async function signOut() {
    try {
      if (refreshToken) await logout(refreshToken)
    } catch {
      // Blacklisting can fail on an already-rotated token; the local session
      // still has to go.
    }
    useAuthStore.getState().clearSession()
    queryClient.clear()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-xs font-medium tracking-[0.2em] text-emerald-400 uppercase">
              ARC · Staff console
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Account access and platform health. No planner contents, no system
              configuration.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm text-slate-300">{user?.email}</span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4 pb-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
