import { BrowserRouter, Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import SessionHydrator from './components/SessionHydrator'
import AdminLayout from './components/admin/AdminLayout'
import ConnectionStatus from './pages/ConnectionStatus'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'

export default function App() {
  return (
    <BrowserRouter>
      <SessionHydrator>
        <Routes>
          <Route path="/" element={<ConnectionStatus />} />
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
