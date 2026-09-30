import { useEffect, useState, type CSSProperties } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import ScoreLedger from '@/components/documents/ScoreLedger'
import TrustChart from '@/components/documents/TrustChart'
import ExpertRecommendations from '@/components/expertise/ExpertRecommendations'
import GradeBadge from '@/components/expertise/GradeBadge'
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
import { getExpertise } from '@/services/expertise'
import { OPEN_STATUSES, getReviewRequest } from '@/services/reviews'
import type { DomainScore, KnowledgeDocument, ReviewRequest, ScoreEvent } from '@/types'
import { clearanceLabel, readerLevel } from '@/utils/clearance'
import { GRADES, LOW_SCORE_THRESHOLD, domainInfo, domainPoints, gradeFor, pointsToNextGrade } from '@/utils/expertise'
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
  const [myDomain, setMyDomain] = useState<DomainScore | null>(null)
  const [review, setReview] = useState<ReviewRequest | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [busy, setBusy] = useState<'download' | 'validate' | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  const load = async () => {
    const [d, h, v, x, r] = await Promise.all([
      getDocument(id),
      getScoreHistory(id),
      hasValidated(id),
      user ? getExpertise(user.id).catch(() => null) : null,
      user ? getReviewRequest(id, user.id) : null,
    ])
    setReview(r)
    setDoc(d)
    setHistory(h)
    setValidated(v)
    setMyDomain(d ? (x?.domains[d.domain] ?? null) : null)
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

  if (authLoading) return <p className="muted">Loading…</p>
  if (!user)
    return (
      <p className="empty">
        <Link to="/login">Sign in</Link> to view this document.
      </p>
    )
  if (status === 'loading') return <p className="muted">Loading…</p>
  if (status === 'missing' || !doc)
    return (
      <section>
        <h1>Document not found</h1>
        <p className="empty">
          This document doesn’t exist or is above your clearance level. <Link to="/search">Back to documents</Link>
        </p>
      </section>
    )

  const level = readerLevel(user)
  const gain = validationGain(level, doc.score)
  const isAuthor = doc.authorId === user.id
  const s = doc.signals
  const domain = domainInfo(doc.domain)
  const myPoints = myDomain?.points ?? 0
  const myValidations = myDomain?.validations ?? 0
  const pointsGain = domainPoints(level)
  const nextGrade = pointsToNextGrade(myPoints)
  const needsExperts = doc.score < LOW_SCORE_THRESHOLD || doc.reviewRequested

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
      const promoted = res.grade !== res.previousGrade ? ` You’re now graded ${res.grade} in ${domain.label}!` : ''
      setMessage({
        kind: 'success',
        text:
          `Document validated: ${formatDelta(res.delta)} point${Math.abs(res.delta) === 1 ? '' : 's'}, trust ${res.score}/100. ` +
          `${domain.label} expertise: ${formatDelta(res.domainPoints)} pts.${promoted}` +
          (res.reviewClosed ? ' The review request is closed.' : ''),
      })
    } catch (err) {
      setMessage({ kind: 'error', text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const stats = [
    { label: 'Views', value: s.views },
    { label: 'Validations', value: s.expertValidations },
    { label: 'Successful uses', value: s.successfulUses },
    { label: 'Confirming sources', value: s.confirmations },
    { label: 'Contradictions', value: s.contradictions },
    { label: 'Volatility', value: doc.volatility, unit: '/100' },
  ]

  return (
    <article className="docpage">
      <Link to={`/search${backSearch}`} className="docpage__back">
        ← Back to documents
      </Link>

      <header className="docpage__head">
        <p className="mono muted">
          {docCode(doc.id)} · {doc.category} · version {doc.version}
        </p>
        <p className="domain-chip">
          <span>{domain.label}</span>
          <span className="muted">Reviewed by: {domain.expert.toLowerCase()}</span>
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
            {doc.reviewRequested && 'Expert review requested. '}
            {doc.conflictsWith.length > 0 &&
              `Conflicting with ${doc.conflictsWith.length} other document${doc.conflictsWith.length === 1 ? '' : 's'}.`}
          </p>
        )}
      </header>

      <section className="card trust" aria-labelledby="trust-title">
        <div className="trust__score">
          <h2 id="trust-title">Trust score</h2>
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
            Visible from level {clearanceNeededFor(doc.score)} · last changed{' '}
            {new Date(doc.lastScoredAt).toLocaleDateString('en-GB')}
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

      {review && OPEN_STATUSES.includes(review.status) && (
        <p className="notice review-banner">
          <strong>{review.requesterName}</strong> asked you to review this document
          {review.message && <> : “{review.message}”</>}. Check it, then validate it below to close the request.{' '}
          <Link to="/requests">See all requests</Link>
        </p>
      )}

      {needsExperts && <ExpertRecommendations documentId={doc.id} domain={doc.domain} score={doc.score} />}

      <section className="card" aria-labelledby="chart-title">
        <h2 id="chart-title">Trust chart</h2>
        <TrustChart events={history} readerFloor={user.role === 'admin' ? 0 : minScoreFor(user.clearance)} />
      </section>

      <section className="card" aria-labelledby="ledger-title">
        <h2 id="ledger-title">Score history</h2>
        <ScoreLedger events={history} fileName={doc.fileName} />
      </section>

      <div className="dashboard__grid">
        <section className="card">
          <h2>File</h2>
          <dl className="meta">
            <dt>Name</dt>
            <dd>{doc.fileName}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(doc.sizeBytes)}</dd>
            <dt>Type</dt>
            <dd className="mono">{doc.mimeType}</dd>
            <dt>Created</dt>
            <dd>{new Date(doc.createdAt).toLocaleDateString('en-GB')}</dd>
            <dt>Updated</dt>
            <dd>{new Date(doc.updatedAt).toLocaleDateString('en-GB')}</dd>
            <dt>SHA-256</dt>
            <dd className="mono" title={doc.sha256}>
              {doc.sha256.slice(0, 16)}…
            </dd>
          </dl>
        </section>
      </div>

      <section className="card docpage__actions" aria-labelledby="actions-title">
        <h2 id="actions-title">Use this document</h2>
        <div className="actions">
          <button type="button" className="btn btn--secondary" onClick={handleDownload} disabled={busy !== null}>
            {busy === 'download' ? 'Downloading…' : 'Download'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={handleValidate}
            disabled={busy !== null || validated || isAuthor}
          >
            {validated ? 'Document validated ✓' : busy === 'validate' ? 'Validating…' : 'Validate document'}
          </button>
        </div>
        <p className="muted">
          {isAuthor
            ? 'You wrote this document, so you can’t validate it.'
            : validated
              ? 'You’ve already validated this document.'
              : `At your level ${level} (${user.role === 'admin' ? 'Admin' : clearanceLabel(level)}), your validation adds ${formatDelta(gain)} trust point${gain === 1 ? '' : 's'} and ${formatDelta(pointsGain)} pts to your ${domain.label} expertise.`}
        </p>
        <p className="my-grade">
          <GradeBadge grade={gradeFor(myPoints)} domain={domain.label} />
          <span>
            Your {domain.label} grade: {myPoints} pts, {myValidations} validation{myValidations === 1 ? '' : 's'}
            {nextGrade && <span className="muted"> · {nextGrade.missing} pts to {nextGrade.grade}</span>}
          </span>
        </p>
        {message && <p className={message.kind === 'error' ? 'form__error' : 'form__success'}>{message.text}</p>}
        <details className="formula">
          <summary>How is the gain calculated?</summary>
          <p>
            <code className="mono">
              gain = {MAX_VALIDATION_GAIN} × (level ÷ 100)² × (100 − score) ÷ 100
            </code>
            , rounded, minimum 1 point.
          </p>
          <p>
            The weight grows with the square of the clearance level: an Expert (100) counts 4 times as much as a Senior
            (50) and 25 times as much as an Intermediate (20). The more trusted a document already is, the harder the
            last points are to earn. Each person can validate a document only once.
          </p>
          <p>
            Each validation also earns <code className="mono">level ÷ 10</code> expertise points (minimum 1) in the
            document’s domain. Grades:{' '}
            {[...GRADES]
              .reverse()
              .map((g) => `${g.grade} from ${g.min} pts`)
              .join(', ')}
            . Documents below {LOW_SCORE_THRESHOLD}/100 recommend the best-graded profiles in their domain.
          </p>
        </details>
      </section>
    </article>
  )
}
