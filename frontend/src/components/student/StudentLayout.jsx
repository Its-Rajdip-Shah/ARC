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
  settings: 'Canvas settings',
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
          'radial-gradient(ellipse 56% 42% at 14% 10%, rgba(72, 91, 161, .12), transparent 72%), radial-gradient(ellipse 52% 46% at 48% 12%, rgba(76, 83, 151, .15), transparent 74%), radial-gradient(ellipse 58% 48% at 88% 30%, rgba(79, 97, 164, .10), transparent 76%), radial-gradient(ellipse 50% 44% at 20% 84%, rgba(57, 76, 139, .08), transparent 76%), radial-gradient(ellipse 54% 46% at 78% 80%, rgba(56, 73, 132, .10), transparent 76%), var(--color-arc-bg)',
      }}
    >
      <header className="student-header pointer-events-none fixed left-0 right-0 top-0 z-30 bg-transparent">
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
