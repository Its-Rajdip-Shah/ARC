import { useEffect, useRef } from 'react'
import { LogOut, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { logout } from '../../api/auth'
import { queryClient } from '../../lib/queryClient'
import { useAuthStore } from '../../stores/authStore'

const menuItems = [
  { label: 'Account', dialog: 'account' },
  { label: 'Canvas settings', dialog: 'settings' },
  { label: 'Sync', dialog: 'sync' },
  { label: 'Planner', to: '/planner' },
  { label: 'Priority', to: '/priority' },
  { label: 'Timeline', to: '/timeline' },
  { label: 'Focus', to: '/focus' },
  { label: 'Marks', to: '/marks' },
]

export default function NavigationDrawer({ isOpen, onClose, onOpenDialog }) {
  const navigate = useNavigate()
  const location = useLocation()
  const refreshToken = useAuthStore((state) => state.refreshToken)
  const closeRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return undefined
    closeRef.current?.focus()
    function onEscape(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onEscape)
    return () => document.removeEventListener('keydown', onEscape)
  }, [isOpen, onClose])

  if (!isOpen) return null

  async function handleLogout() {
    try {
      if (refreshToken) await logout(refreshToken)
    } catch {
      // An expired/blacklisted token must not prevent local sign-out.
    }
    useAuthStore.getState().clearSession()
    queryClient.clear()
    onClose()
    navigate('/login', { replace: true })
  }

  function choose(item) {
    onClose()
    if (item.dialog) onOpenDialog(item.dialog)
    else navigate(item.to)
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40"
      />
      <aside
        aria-label="Student navigation"
        className="fixed right-0 top-0 z-50 flex h-dvh w-[min(300px,85vw)] flex-col overflow-y-auto bg-arc-surface px-7 pb-8 pt-6 text-arc-text shadow-xl"
      >
        <button
          ref={closeRef}
          type="button"
          aria-label="Close navigation menu"
          onClick={onClose}
          className="ml-auto rounded-lg p-2 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-arc-blue-light"
        >
          <X size={24} strokeWidth={1.5} />
        </button>
        <nav aria-label="Student pages" className="mt-12 flex flex-col gap-3 text-base">
          {menuItems.map((item) => {
            const active = item.to === location.pathname
            return (
              <button
                key={item.label}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => choose(item)}
                className={`rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-arc-blue-light ${active ? 'bg-arc-blue font-semibold' : ''}`}
              >
                {item.label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={handleLogout}
            className="mt-5 flex items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-arc-blue-light"
          >
            <LogOut size={17} strokeWidth={1.5} />
            Logout
          </button>
        </nav>
      </aside>
    </>
  )
}
