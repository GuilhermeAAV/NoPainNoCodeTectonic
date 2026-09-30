import { createBrowserRouter } from 'react-router-dom'
import Layout from '@/components/layout/Layout'
import HomePage from '@/pages/HomePage'
import AboutPage from '@/pages/AboutPage'
import DashboardPage from '@/pages/DashboardPage'
import SearchPage from '@/pages/SearchPage'
import DocumentPage from '@/pages/DocumentPage'
import NotFoundPage from '@/pages/NotFoundPage'
import LoginPage from '@/pages/LoginPage'
import ProfilesPage from '@/pages/ProfilesPage'
import RequireAdmin from '@/components/auth/RequireAdmin'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <NotFoundPage />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'documents/:id', element: <DocumentPage /> },
      { path: 'about', element: <AboutPage /> },
      { path: 'login', element: <LoginPage /> },
      {
        element: <RequireAdmin />,
        children: [{ path: 'admin/profiles', element: <ProfilesPage /> }],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
