import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

export default function RequireAdmin() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="muted">Chargement…</p>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}
