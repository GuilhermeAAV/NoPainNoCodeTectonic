import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { items } from '@/data/items'
import type { ItemStatus } from '@/types'
import { canRead, docRef, readerLevel } from '@/utils/clearance'

const statuses: ItemStatus[] = ['diffusé', 'en relecture', 'archivé']

export default function DashboardPage() {
  const { user } = useAuth()
  const level = readerLevel(user)

  const byCategory = Object.entries(
    items.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])
  const max = Math.max(...byCategory.map(([, count]) => count))

  const recent = [...items].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)

  return (
    <section>
      <h1>Tableau de bord</h1>

      <div className="stats">
        <div className="card stat">
          <span className="stat__label">Documents</span>
          <span className="stat__value">{items.length}</span>
        </div>
        {statuses.map((status) => (
          <div key={status} className="card stat">
            <span className="stat__label">{status}</span>
            <span className="stat__value">{items.filter((i) => i.status === status).length}</span>
          </div>
        ))}
      </div>

      <div className="dashboard__grid">
        <div className="card">
          <h2>Par service</h2>
          <ul className="bars">
            {byCategory.map(([category, count]) => (
              <li key={category} className="bars__row">
                <span className="bars__label">{category}</span>
                <span className="bars__track">
                  <span className="bars__fill" style={{ width: `${(count / max) * 100}%` }} />
                </span>
                <span className="bars__count">{count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card">
          <h2>Derniers échanges</h2>
          <ul className="list">
            {recent.map((item) => (
              <li key={item.id} className="list__item">
                <div>
                  {canRead(level, item) ? <strong>{item.title}</strong> : <strong className="sealed-text">Pli scellé</strong>}
                  <div className="muted">
                    <span className="mono">{docRef(item.id)}</span> · {item.category}
                  </div>
                </div>
                <span className="muted mono">{new Date(item.updatedAt).toLocaleDateString('fr-FR')}</span>
              </li>
            ))}
          </ul>
          <Link to="/search">Voir tous les documents →</Link>
        </div>
      </div>
    </section>
  )
}
