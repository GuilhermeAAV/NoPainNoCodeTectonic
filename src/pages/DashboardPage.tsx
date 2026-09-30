import { Link } from 'react-router-dom'
import { items } from '@/data/items'
import type { ItemStatus } from '@/types'

const statuses: ItemStatus[] = ['actif', 'en pause', 'terminé']

export default function DashboardPage() {
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
      <h1>Dashboard</h1>

      <div className="stats">
        <div className="card stat">
          <span className="stat__label">Total</span>
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
          <h2>Par catégorie</h2>
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
          <h2>Activité récente</h2>
          <ul className="list">
            {recent.map((item) => (
              <li key={item.id} className="list__item">
                <div>
                  <strong>{item.title}</strong>
                  <div className="muted">{item.category}</div>
                </div>
                <span className="muted">{new Date(item.updatedAt).toLocaleDateString('fr-FR')}</span>
              </li>
            ))}
          </ul>
          <Link to="/search">Tout voir →</Link>
        </div>
      </div>
    </section>
  )
}
