import { useEffect, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import Logo from '@/components/ui/Logo'
import { countOpenRequests } from '@/services/reviews'
import { clearanceLabel } from '@/utils/clearance'

const links = [
  { to: '/', label: 'Home' },
  { to: '/search', label: 'Documents' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/about', label: 'About' },
]

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D3077F]'

// Onglets façon sélecteur segmenté du tableau de bord : l'onglet actif est une pastille blanche
const tab = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-semibold no-underline transition-all ${FOCUS} ${
    isActive
      ? 'bg-white text-[#2B0B45] shadow-[0_1px_3px_rgba(43,11,69,0.15)] hover:text-[#2B0B45]'
      : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
  }`

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [openRequests, setOpenRequests] = useState(0)

  // Demandes de revue en attente : rechargées à chaque navigation et après une réponse (RequestsPage)
  useEffect(() => {
    if (!user) return setOpenRequests(0)
    const refresh = () => countOpenRequests(user.id).then(setOpenRequests).catch(() => setOpenRequests(0))
    refresh()
    window.addEventListener('review-requests-changed', refresh)
    return () => window.removeEventListener('review-requests-changed', refresh)
  }, [user, pathname])

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const initials = user ? `${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase() : ''

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/75 backdrop-blur-xl">
      <div className="shell flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-3.5">
        <NavLink to="/" className={`flex items-center gap-3 rounded-xl no-underline ${FOCUS}`} aria-label="DocExchange, home">
          <Logo />
          <span>
            <span className="display block text-xl font-extrabold leading-none text-[#2B0B45]">DocExchange</span>
            <span className="mt-1 block text-xs text-slate-500">Internal knowledge, rated by trust</span>
          </span>
        </NavLink>

        <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto rounded-2xl bg-slate-200/50 p-1 md:order-none md:mx-0 md:w-auto">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end className={tab}>
              {link.label}
            </NavLink>
          ))}
          {user && (
            <NavLink to="/requests" className={tab}>
              Requests
              {openRequests > 0 && (
                <span
                  className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-[#D3077F] px-1.5 text-[11px] font-bold leading-5 text-white"
                  aria-label={`${openRequests} open`}
                >
                  {openRequests}
                </span>
              )}
            </NavLink>
          )}
          {user?.role === 'admin' && (
            <NavLink to="/admin/profiles" className={tab}>
              Profiles
            </NavLink>
          )}
        </nav>

        {user ? (
          <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
            <div className="hidden text-right sm:block">
              <p className="m-0 text-sm font-semibold leading-none text-slate-900">
                {user.firstName} {user.lastName}
              </p>
              <p className="m-0 mt-1 text-xs text-slate-500">
                {user.role === 'admin' ? 'Admin' : `${clearanceLabel(user.clearance)} · level ${user.clearance}`}
              </p>
            </div>
            <span
              className="grid size-9 place-items-center rounded-full text-xs font-bold text-white ring-2 ring-white"
              style={{ background: 'linear-gradient(135deg,#D3077F,#6D28D9)' }}
              aria-hidden="true"
            >
              {initials}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className={`grid size-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#D3077F] ${FOCUS}`}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        ) : (
          <NavLink to="/login" className="btn btn--primary">
            Sign in
          </NavLink>
        )}
      </div>
    </header>
  )
}
