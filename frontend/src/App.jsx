import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import SessionHydrator from './components/SessionHydrator'
import StudentRoute from './components/StudentRoute'
import AdminLayout from './components/admin/AdminLayout'
import StudentLayout from './components/student/StudentLayout'
import ConnectionStatus from './pages/ConnectionStatus'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import StudentLoginPage from './pages/student/StudentLoginPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import PlannerPage from './features/planner/PlannerPage'
import TimelinePage from './features/timeline/TimelinePage'
import SettingsPage from './pages/student/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <SessionHydrator>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />

          <Route path="/login" element={<StudentLoginPage />} />

          <Route element={<StudentRoute />}>
            <Route element={<StudentLayout />}>
              <Route path="/planner" element={<PlannerPage />} />
              <Route path="/timeline" element={<TimelinePage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="/dev/connection" element={<ConnectionStatus />} />

          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="users" element={<AdminUsersPage />} />
            </Route>
          </Route>
        </Routes>
      </SessionHydrator>
    </BrowserRouter>
  )
}