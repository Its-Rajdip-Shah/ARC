import { LogOut, X } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useAuthStore } from '../../stores/authStore'

const menuItems = [
  { label: 'Account', to: '/settings' },
  { label: 'Settings', to: '/settings' },
  { label: 'Marks' },
  { label: 'Planner', to: '/planner' },
  { label: 'Timeline', to: '/timeline' },
]

export default function NavigationDrawer({ isOpen, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const clearSession = useAuthStore((state) => state.clearSession)

  if (!isOpen) {
    return null
  }

  function handleLogout() {
    clearSession()
    onClose()
    navigate('/login', { replace: true })
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close navigation menu"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/20"
      />

      <aside
        aria-label="Student navigation"
        className="
          fixed right-0 top-0 z-50
          h-screen w-[146px]
          bg-arc-surface
          text-arc-text
        "
      >
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={onClose}
          className="
            absolute right-[36px] top-[20px]
            flex h-6 w-6 items-center justify-center
            text-white
            transition-opacity hover:opacity-70
          "
        >
          <X size={24} strokeWidth={1.5} />
        </button>

        <nav
          aria-label="Student pages"
          className="
            absolute left-[36px] top-[40%]
            flex flex-col gap-[12px]
            text-[15px] leading-5
          "
        >
          {menuItems.map((item) => {
            const isActive = item.to
              ? location.pathname.startsWith(item.to)
              : false

            return (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  if (!item.to) return
                  navigate(item.to)
                  onClose()
                }}
                className={`
                  w-fit whitespace-nowrap text-left
                  transition-opacity hover:opacity-70
                  ${isActive ? 'font-bold' : 'font-normal'}
                `}
              >
                {item.label}
              </button>
            )
          })}

          <button
            type="button"
            onClick={handleLogout}
            className="
              mt-[12px] flex w-fit items-center gap-2
              whitespace-nowrap text-left
              font-normal
              transition-opacity hover:opacity-70
            "
          >
            <LogOut size={15} strokeWidth={1.5} />
            <span>Logout</span>
          </button>
        </nav>
      </aside>
    </>
  )
}
