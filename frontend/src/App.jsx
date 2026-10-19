import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import SessionHydrator from './components/SessionHydrator'
import StudentRoute from './components/StudentRoute'
import AdminLayout from './components/admin/AdminLayout'
import StudentLayout from './components/student/StudentLayout'
import ConnectionStatus from './pages/ConnectionStatus'
import LandingPage from './pages/LandingPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import ForgotPasswordPage from './pages/student/ForgotPasswordPage'
import StudentLoginPage from './pages/student/StudentLoginPage'
import StudentRegisterPage from './pages/student/StudentRegisterPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import PlannerPage from './features/planner/PlannerPage'
import TimelinePage from './features/timeline/TimelinePage'
import FocusPage from './features/focus/FocusPage'
import SettingsPage from './pages/student/SettingsPage'
import MarksPage from './features/marks/MarksPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <BrowserRouter>
      <SessionHydrator>
        <Routes>
          <Route path="/" element={<LandingPage />} />

          <Route path="/login" element={<StudentLoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/register" element={<StudentRegisterPage />} />

          <Route element={<StudentRoute />}>
            <Route element={<StudentLayout />}>
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/priority" element={<PlannerPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/focus" element={<FocusPage />} />
              <Route path="/marks" element={<MarksPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          {import.meta.env.DEV && (
            <Route path="/dev/connection" element={<ConnectionStatus />} />
          )}

          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="users" element={<AdminUsersPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </SessionHydrator>
    </BrowserRouter>
  )
}
