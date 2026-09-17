import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import HamburgerButton from './HamburgerButton'
import NavigationDrawer from './NavigationDrawer'
import StudentViewNav from './StudentViewNav'

export default function StudentLayout() {
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)

  function toggleNavigation() {
    setIsNavigationOpen((isOpen) => !isOpen)
  }

  function closeNavigation() {
    setIsNavigationOpen(false)
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-arc-bg text-arc-text">
      <header
        className="
          pointer-events-none fixed
          left-arc-sidebar right-0 top-0 z-30 h-20
          bg-arc-bg
        "
      >
        <div
          className="
            pointer-events-auto absolute
            left-1/2 top-4 -translate-x-1/2
          "
        >
          <StudentViewNav />
        </div>

        <div className="pointer-events-auto absolute right-5 top-4">
          <HamburgerButton
            isOpen={isNavigationOpen}
            onClick={toggleNavigation}
          />
        </div>
      </header>

      <NavigationDrawer
        isOpen={isNavigationOpen}
        onClose={closeNavigation}
      />

      <main className="min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
