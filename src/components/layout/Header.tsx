import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Accueil' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/search', label: 'Recherche' },
  { to: '/about', label: 'À propos' },
]

export default function Header() {
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
        </nav>
      </div>
    </header>
  )
}
