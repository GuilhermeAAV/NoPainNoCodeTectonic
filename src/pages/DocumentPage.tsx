import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import ScoreLedger from '@/components/documents/ScoreLedger'
import TrustChart from '@/components/documents/TrustChart'
import { useAuth } from '@/context/AuthContext'
import {
  downloadDocument,
  getDocument,
  minScoreFor,
  getScoreHistory,
  hasValidated,
  recordDocumentView,
  validateDocument,
} from '@/services/documents'
import type { KnowledgeDocument, ScoreEvent } from '@/types'
import { clearanceLabel, readerLevel } from '@/utils/clearance'
import {
  MAX_VALIDATION_GAIN,
  clearanceNeededFor,
  docCode,
  formatBytes,
  formatDelta,
  validationGain,
} from '@/utils/trust'

// Une consultation par document et par session (évite le double appel de StrictMode et les rechargements)
const viewed = new Set<string>()

export default function DocumentPage() {
  const { id = '' } = useParams()
  // Recherche d'origine (?q=…) transmise par SearchPage, pour revenir aux mêmes résultats
  const backSearch = (useLocation().state as { search?: string } | null)?.search ?? ''
  const { user, loading: authLoading } = useAuth()
  const [doc, setDoc] = useState<KnowledgeDocument | null>(null)
  const [history, setHistory] = useState<ScoreEvent[]>([])
  const [validated, setValidated] = useState(false)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [busy, setBusy] = useState<'download' | 'validate' | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  const load = async () => {
    const [d, h, v] = await Promise.all([getDocument(id), getScoreHistory(id), hasValidated(id)])
    setDoc(d)
    setHistory(h)
    setValidated(v)
    setStatus(d ? 'ready' : 'missing')
  }

  useEffect(() => {
    if (!user) return
    setStatus('loading')
    // Un document hors de portée est refusé par les règles : on l'affiche comme introuvable
    load().catch(() => setStatus('missing'))
    if (!viewed.has(id)) {
      viewed.add(id)
      recordDocumentView(id).catch(() => viewed.delete(id))
    }
  }, [user, id])

  if (authLoading) return <p className="muted">Chargement…</p>
  if (!user)
    return (
      <p className="empty">
        <Link to="/login">Connectez-vous</Link> pour consulter ce document.
      </p>
    )
  if (status === 'loading') return <p className="muted">Chargement…</p>
  if (status === 'missing' || !doc)
    return (
      <section>
        <h1>Document introuvable</h1>
        <p className="empty">
          Ce document n'existe pas ou dépasse votre niveau d'accréditation. <Link to="/search">Retour aux documents</Link>
        </p>
      </section>
    )

  const level = readerLevel(user)
  const gain = validationGain(level, doc.score)
  const isAuthor = doc.authorId === user.id
  const s = doc.signals

  const handleDownload = async () => {
    setBusy('download')
    setMessage(null)
    try {
      await downloadDocument(doc)
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const handleValidate = async () => {
    setBusy('validate')
    setMessage(null)
    try {
      const res = await validateDocument(doc.id)
      await load()
      setMessage({
        kind: 'success',
        text: `Document validé : ${formatDelta(res.delta)} point${Math.abs(res.delta) > 1 ? 's' : ''}, confiance ${res.score}/100.`,
      })
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const stats = [
    { label: 'Consultations', value: s.views },
    { label: 'Validations', value: s.expertValidations },
    { label: 'Utilisations réussies', value: s.successfulUses },
    { label: 'Sources concordantes', value: s.confirmations },
    { label: 'Contradictions', value: s.contradictions },
    { label: 'Volatilité', value: doc.volatility, unit: '/100' },
  ]

  return (
    <article className="docpage">
      <Link to={`/search${backSearch}`} className="docpage__back">
        ← Retour aux documents
      </Link>

      <header className="docpage__head">
        <p className="mono muted">
          {docCode(doc.id)} · {doc.category} · version {doc.version}
        </p>
        <h1>{doc.title}</h1>
        <p className="lead">{doc.description}</p>
        {doc.tags.length > 0 && (
          <ul className="tags">
            {doc.tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}
        {(doc.reviewRequested || doc.conflictsWith.length > 0) && (
          <p className="notice">
            {doc.reviewRequested && 'Une révision par un expert a été demandée. '}
            {doc.conflictsWith.length > 0 &&
              `En conflit avec ${doc.conflictsWith.length} autre${doc.conflictsWith.length > 1 ? 's' : ''} document${doc.conflictsWith.length > 1 ? 's' : ''}.`}
          </p>
        )}
      </header>

      <section className="card trust" aria-labelledby="trust-title">
        <div className="trust__score">
          <h2 id="trust-title">Score de confiance</h2>
          <p>
            <span className="trust__value">{doc.score}</span>
            <span className="muted">/100</span>
            {doc.delta !== 0 && (
              <span className={`trust__delta ${doc.delta > 0 ? 'trust__delta--up' : 'trust__delta--down'}`}>
                {doc.delta > 0 ? '▲' : '▼'} {formatDelta(doc.delta)}
              </span>
            )}
          </p>
          <div className="meter" style={{ '--value': `${doc.score}%` } as CSSProperties}>
            <span className="meter__fill" />
          </div>
          <p className="muted">
            Visible à partir du niveau {clearanceNeededFor(doc.score)} · dernière variation le{' '}
            {new Date(doc.lastScoredAt).toLocaleDateString('fr-FR')}
          </p>
        </div>
        <ul className="stats docpage__stats">
          {stats.map((st) => (
            <li key={st.label} className="stat">
              <span className="stat__label">{st.label}</span>
              <span className="stat__value">
                {st.value}
                {st.unit && <span className="muted">{st.unit}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card" aria-labelledby="chart-title">
        <h2 id="chart-title">Cotation de la confiance</h2>
        <TrustChart events={history} readerFloor={user.role === 'admin' ? 0 : minScoreFor(user.clearance)} />
      </section>

      <section className="card" aria-labelledby="ledger-title">
        <h2 id="ledger-title">Journal des mouvements</h2>
        <ScoreLedger events={history} fileName={doc.fileName} />
      </section>

      <div className="dashboard__grid">
        <section className="card">
          <h2>Fichier</h2>
          <dl className="meta">
            <dt>Nom</dt>
            <dd>{doc.fileName}</dd>
            <dt>Taille</dt>
            <dd>{formatBytes(doc.sizeBytes)}</dd>
            <dt>Type</dt>
            <dd className="mono">{doc.mimeType}</dd>
            <dt>Créé le</dt>
            <dd>{new Date(doc.createdAt).toLocaleDateString('fr-FR')}</dd>
            <dt>Mis à jour</dt>
            <dd>{new Date(doc.updatedAt).toLocaleDateString('fr-FR')}</dd>
            <dt>SHA-256</dt>
            <dd className="mono" title={doc.sha256}>
              {doc.sha256.slice(0, 16)}…
            </dd>
          </dl>
        </section>
      </div>

      <section className="card docpage__actions" aria-labelledby="actions-title">
        <h2 id="actions-title">Utiliser ce document</h2>
        <div className="actions">
          <button type="button" className="btn btn--secondary" onClick={handleDownload} disabled={busy !== null}>
            {busy === 'download' ? 'Téléchargement…' : 'Télécharger'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleValidate}
            disabled={busy !== null || validated || isAuthor}
          >
            {validated ? 'Document validé ✓' : busy === 'validate' ? 'Validation…' : 'Valider le document'}
          </button>
        </div>
        <p className="muted">
          {isAuthor
            ? 'Vous êtes l’auteur de ce document : vous ne pouvez pas le valider.'
            : validated
              ? 'Vous avez déjà validé ce document.'
              : `Avec votre niveau ${level} (${user.role === 'admin' ? 'Admin' : clearanceLabel(level)}), votre validation ajoutera ${formatDelta(gain)} point${gain > 1 ? 's' : ''} de confiance.`}
        </p>
        {message && <p className={message.kind === 'error' ? 'form__error' : 'form__success'}>{message.text}</p>}
        <details className="formula">
          <summary>Comment le gain est-il calculé ?</summary>
          <p>
            <code className="mono">
              gain = {MAX_VALIDATION_GAIN} × (niveau ÷ 100)² × (100 − score) ÷ 100
            </code>
            , arrondi, au moins 1 point.
          </p>
          <p>
            Le poids grandit avec le carré de l'accréditation : un Expert (100) pèse 4 fois un Senior (50) et 25 fois un
            Confirmé (20). Plus le document est déjà fiable, plus les derniers points sont durs à gagner. Chaque personne
            ne valide un document qu'une fois.
          </p>
        </details>
      </section>
    </article>
  )
}
