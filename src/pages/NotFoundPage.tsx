import { Link } from 'react-router-dom'

// Sert aussi d'errorElement, donc hors du Layout : elle porte sa propre marge
export default function NotFoundPage() {
  return (
    <section className="shell">
      <div className="empty mt-12">
        <p className="display m-0 text-6xl font-extrabold text-[#2B0B45]">404</p>
        <p className="mt-3">This page doesn’t exist.</p>
        <Link to="/" className="btn btn--primary mt-2">
          Back to home
        </Link>
      </div>
    </section>
  )
}
