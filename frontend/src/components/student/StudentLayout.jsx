import { useState } from 'react'
import arcLogo from '../../assets/brand/arc-logo.svg'
import { Outlet, useLocation } from 'react-router-dom'
import HamburgerButton from './HamburgerButton'
import NavigationDrawer from './NavigationDrawer'
import StudentViewNav from './StudentViewNav'

export default function StudentLayout() {
  const pathname = useLocation().pathname
  const isTimeline = pathname === '/timeline'
  const isFocus = pathname === '/focus'
  const isPriority = pathname === '/priority'
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)

  function toggleNavigation() {
    setIsNavigationOpen((isOpen) => !isOpen)
  }

  function closeNavigation() {
    setIsNavigationOpen(false)
  }

  return (
    <div
      className="relative min-h-screen overflow-x-clip bg-arc-bg text-arc-text"
      style={{
        background:
          'radial-gradient(circle at 48% 14%, rgba(76,83,151,.18), transparent 34%), radial-gradient(circle at 86% 72%, rgba(56,73,132,.10), transparent 33%), var(--color-arc-bg)',
      }}
    >
      <header
        className={`pointer-events-none fixed ${isFocus || isPriority ? 'left-0' : 'left-arc-sidebar'} right-0 top-0 z-30 bg-arc-bg ${isPriority ? 'h-24 md:h-14' : isTimeline ? 'h-14' : 'h-20'}`}
      >
        {isPriority && <img src={arcLogo} alt="ARC" className="absolute left-5 top-5 h-auto w-[92px]" />}
        <div
          className={`
            pointer-events-auto absolute
            left-1/2 top-4 -translate-x-1/2
            ${isPriority ? 'priority-view-nav' : ''}
          `}
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
