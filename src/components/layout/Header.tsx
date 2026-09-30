import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import Logo from '@/components/ui/Logo'

const links = [
  { to: '/', label: 'Accueil' },
  { to: '/search', label: 'Documents' },
  { to: '/dashboard', label: 'Tableau de bord' },
  { to: '/about', label: 'À propos' },
]

export default function Header() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  return (
    <header className="header">
      <div className="container header__inner">
        <NavLink to="/" className="header__brand" aria-label="DocExchange, accueil">
          <Logo />
          <span>
            Doc<span className="header__brand-x">Exchange</span>
          </span>
        </NavLink>
        <nav className="header__nav">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end>
              {link.label}
            </NavLink>
          ))}
          {user?.role === 'admin' && <NavLink to="/admin/profiles">Profils</NavLink>}
          {user ? (
            <button type="button" className="header__logout" onClick={handleLogout}>
              Déconnexion
            </button>
          ) : (
            <NavLink to="/login" className="header__login">
              Connexion
            </NavLink>
          )}
        </nav>
      </div>
      <div className="header__lining tint" aria-hidden="true" />
    </header>
  )
}
