import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

const links = [
  { to: '/', label: 'Accueil' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/search', label: 'Recherche' },
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
        <NavLink to="/" className="header__brand">
          Tectonic
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
            <NavLink to="/login">Connexion</NavLink>
          )}
        </nav>
      </div>
    </header>
  )
}
