import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { listDocuments, minScoreFor, searchDocuments } from '@/services/documents'
import type { KnowledgeDocument, SearchResult } from '@/types'
import { readerLevel } from '@/utils/clearance'
import { docCode, formatDelta } from '@/utils/trust'

/** Une ligne de résultat : pertinence et raison seulement pour la recherche IA */
interface Row {
  id: string
  document: Pick<KnowledgeDocument, 'title' | 'description' | 'category' | 'score' | 'delta' | 'updatedAt'> &
    Partial<Pick<KnowledgeDocument, 'conflictsWith' | 'reviewRequested'>>
  relevance?: number
  reason?: string
}

const fromSearch = (r: SearchResult): Row => r
// Résultats IA gardés le temps de la session : revenir d'un document ne relance pas la recherche
const searchCache = new Map<string, Row[]>()

const fromList = (d: KnowledgeDocument): Row => ({ id: d.id, document: d })

export default function SearchPage() {
  const { user, loading: authLoading } = useAuth()
  const level = readerLevel(user)
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const [draft, setDraft] = useState(query)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => setDraft(query), [query])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    setError('')
    const load = query
      ? searchCache.has(query)
        ? Promise.resolve(searchCache.get(query)!)
        : searchDocuments(query).then((res) => {
            const found = res.results.map(fromSearch)
            searchCache.set(query, found)
            return found
          })
      : listDocuments(user).then((docs) => docs.map(fromList))
    load
      .then((next) => !cancelled && setRows(next))
      .catch((err: Error) => !cancelled && (setRows([]), setError(err.message)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [user, query])

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: key === 'category' })
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    updateParam('q', draft.trim())
  }

  if (authLoading) return <p className="muted">Chargement…</p>
  if (!user)
    return (
      <section>
        <h1>Documents</h1>
        <p className="empty">
          <Link to="/login">Connectez-vous</Link> pour rechercher parmi les documents de votre niveau.
        </p>
      </section>
    )

  const categories = [...new Set(rows.map((r) => r.document.category))].sort()
  const results = rows.filter((r) => !category || r.document.category === category)
  const floor = user.role === 'admin' ? 0 : minScoreFor(user.clearance)

  return (
    <section>
      <h1>Documents</h1>

      <form className="search__bar" onSubmit={handleSubmit} role="search">
        <input
          type="search"
          className="input"
          placeholder="Décrivez ce que vous cherchez, ex. « comment déployer en production »"
          aria-label="Rechercher un document"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={500}
          autoFocus
        />
        <button type="submit" className="btn btn--primary" disabled={loading}>
          Rechercher
        </button>
        <select
          className="input"
          aria-label="Filtrer par service"
          value={category}
          onChange={(e) => updateParam('category', e.target.value)}
        >
          <option value="">Tous les services</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </form>

      <p className="muted">
        {loading
          ? query
            ? 'Recherche des documents les plus pertinents…'
            : 'Chargement…'
          : `${results.length} document${results.length > 1 ? 's' : ''} ${
              query ? 'pertinents, du plus au moins pertinent' : 'accessibles, par confiance décroissante'
            }`}
        {' · '}votre niveau : {level}, confiance ≥ {floor}
        {query && !loading && (
          <>
            {' · '}
            <button type="button" className="link-button" onClick={() => updateParam('q', '')}>
              Effacer la recherche
            </button>
          </>
        )}
      </p>

      {error && <p className="form__error">{error}</p>}
      {!loading && !error && results.length === 0 && (
        <p className="empty">Aucun document ne correspond. Essayez de formuler votre besoin autrement.</p>
      )}

      <ol className="results" aria-busy={loading}>
        {results.map(({ id, document: d, relevance, reason }) => (
          <li key={id}>
            <Link to={`/documents/${id}`} state={{ search: location.search }} className="doc doc--link">
              <div className="doc__head mono">
                <span>{docCode(id)}</span>
                <span>
                  Confiance {d.score}
                  {d.delta !== 0 && ` (${formatDelta(d.delta)})`}
                </span>
              </div>
              <strong className="doc__title">{d.title}</strong>
              {relevance !== undefined && (
                <div className="relevance" aria-label={`Pertinence ${relevance} sur 100`}>
                  <span className="relevance__track">
                    <span className="relevance__fill" style={{ width: `${relevance}%` }} />
                  </span>
                  <span className="mono">Pertinence {relevance}</span>
                </div>
              )}
              <p>{reason ?? d.description}</p>
              <div className="doc__foot">
                <span className="muted">
                  {d.category} · {new Date(d.updatedAt).toLocaleDateString('fr-FR')}
                </span>
                {d.reviewRequested ? (
                  <span className="badge badge--en-relecture">révision demandée</span>
                ) : d.conflictsWith?.length ? (
                  <span className="badge badge--en-relecture">en conflit</span>
                ) : null}
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
