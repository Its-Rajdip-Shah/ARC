import { useCallback, useState } from 'react'
import arcLogo from '../../assets/brand/arc-logo.svg'
import { Outlet, useLocation } from 'react-router-dom'
import HamburgerButton from './HamburgerButton'
import MarksPanel from './MarksPanel'
import NavigationDrawer from './NavigationDrawer'
import StudentDialog from './StudentDialog'
import StudentViewNav from './StudentViewNav'
import SettingsPage, { IntegrationPanel } from '../../pages/student/SettingsPage'
import './StudentLayout.css'

const dialogTitles = {
  account: 'Account',
  settings: 'Settings',
  marks: 'Marks',
  sync: 'Canvas Sync',
}

export default function StudentLayout() {
  const pathname = useLocation().pathname
  const isPriority = pathname === '/priority'
  const [isNavigationOpen, setIsNavigationOpen] = useState(false)
  const [dialog, setDialog] = useState(null)

  const closeNavigation = useCallback(() => setIsNavigationOpen(false), [])
  const closeDialog = useCallback(() => setDialog(null), [])

  function toggleNavigation() {
    setIsNavigationOpen((isOpen) => !isOpen)
  }

  return (
    <div
      className="relative min-h-screen overflow-x-clip bg-arc-bg text-arc-text"
      style={{
        background:
          'radial-gradient(circle at 48% 14%, rgba(76,83,151,.18), transparent 34%), radial-gradient(circle at 86% 72%, rgba(56,73,132,.10), transparent 33%), var(--color-arc-bg)',
      }}
    >
      <header className="student-header pointer-events-none fixed left-0 right-0 top-0 z-30 bg-arc-bg">
        {isPriority && <img src={arcLogo} alt="ARC" className="absolute left-5 top-5 h-auto w-[92px]" />}
        <div className="pointer-events-auto absolute right-5 top-4">
          <HamburgerButton
            isOpen={isNavigationOpen}
            onClick={toggleNavigation}
          />
        </div>
      </header>

      <div className="student-view-nav">
        <StudentViewNav />
      </div>

      <NavigationDrawer
        isOpen={isNavigationOpen}
        onClose={closeNavigation}
        onOpenDialog={setDialog}
      />

      <main className="min-h-screen">
        <Outlet />
      </main>

      {dialog && (
        <StudentDialog title={dialogTitles[dialog]} onClose={closeDialog}>
          {dialog === 'account' && <SettingsPage embedded initialTab="account" />}
          {dialog === 'settings' && <SettingsPage embedded initialTab="integration" />}
          {dialog === 'marks' && <MarksPanel />}
          {dialog === 'sync' && <IntegrationPanel />}
        </StudentDialog>
      )}
    </div>
  )
}
