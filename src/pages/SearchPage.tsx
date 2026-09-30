import { useSearchParams } from 'react-router-dom'
import { items } from '@/data/items'

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const category = params.get('category') ?? ''

  const categories = [...new Set(items.map((i) => i.category))].sort()

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const q = query.trim().toLowerCase()
  const results = items.filter(
    (item) =>
      (!category || item.category === category) &&
      (!q || item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)),
  )

  return (
    <section>
      <h1>Recherche</h1>

      <div className="search__bar">
        <input
          type="search"
          className="input"
          placeholder="Rechercher un projet…"
          value={query}
          onChange={(e) => updateParam('q', e.target.value)}
          autoFocus
        />
        <select className="input" value={category} onChange={(e) => updateParam('category', e.target.value)}>
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <p className="muted">
        {results.length} résultat{results.length > 1 ? 's' : ''}
      </p>

      <ul className="results">
        {results.map((item) => (
          <li key={item.id} className="card">
            <div className="results__head">
              <strong>{item.title}</strong>
              <span className={`badge badge--${item.status.replace(' ', '-')}`}>{item.status}</span>
            </div>
            <p>{item.description}</p>
            <span className="muted">{item.category}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
