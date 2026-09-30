import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import GradeBadge from '@/components/expertise/GradeBadge'
import { recommendExperts } from '@/services/documents'
import { requestReview } from '@/services/reviews'
import type { RecommendedExpert, ReviewStatus } from '@/types'
import { clearanceLabel } from '@/utils/clearance'
import { GRADES, domainInfo, type DomainId } from '@/utils/expertise'

interface Props {
  documentId: string
  domain: DomainId
  score: number
}

const maxPoints = GRADES[0].min

// Une demande ouverte ne peut pas être renvoyée ; refusée ou annulée, elle peut l'être
const OPEN: (ReviewStatus | null)[] = ['pending', 'accepted']
const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Review requested ✓',
  accepted: 'Review accepted ✓',
  declined: 'Declined · ask again',
  cancelled: 'Request review',
  done: 'Reviewed ✓',
}

/** Profils viables (les mieux notés du domaine, capables de lire et valider le document) à qui demander une revue */
export default function ExpertRecommendations({ documentId, domain, score }: Props) {
  const [experts, setExperts] = useState<RecommendedExpert[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState<string | null>(null)
  const info = domainInfo(domain)

  useEffect(() => {
    setExperts(null)
    setError(null)
    recommendExperts(documentId)
      .then((res) => setExperts(res.experts))
      .catch((err: Error) => setError(err.message))
  }, [documentId, score])

  const markRequested = (ids: string[]) =>
    setExperts((list) => list?.map((e) => (ids.includes(e.id) ? { ...e, requestStatus: 'pending' } : e)) ?? null)

  const send = async (targets: RecommendedExpert[], key: string) => {
    setSending(key)
    setError(null)
    setSuccess(null)
    const results = await Promise.allSettled(targets.map((e) => requestReview(documentId, e.id, message)))
    const sent = targets.filter((_, i) => results[i].status === 'fulfilled')
    const failed = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
    markRequested(sent.map((e) => e.id))
    if (sent.length)
      setSuccess(`Review request sent to ${sent.map((e) => `${e.firstName} ${e.lastName}`).join(', ')}.`)
    if (failed) setError((failed.reason as Error).message)
    setSending(null)
  }

  const requestable = experts?.filter((e) => !OPEN.includes(e.requestStatus) && e.requestStatus !== 'done') ?? []

  return (
    <section className="card experts" aria-labelledby="experts-title">
      <div className="experts__head">
        <h2 id="experts-title">Unreliable source · recommended reviewers</h2>
        <p className="muted">
          Low trust score for a <strong>{info.label}</strong> document. These profiles ({info.expert.toLowerCase()}) have
          the best grades in the domain and can open and validate it. They’ll find your request in their{' '}
          <Link to="/requests">Requests</Link> area.
        </p>
      </div>

      {!error && experts === null && <p className="muted">Finding experts…</p>}
      {experts?.length === 0 && (
        <p className="empty">No profile graded D or better in {info.label} can validate this document yet.</p>
      )}
      {experts && experts.length > 0 && (
        <>
          <ol className="experts__list">
            {experts.map((e) => {
              const open = OPEN.includes(e.requestStatus) || e.requestStatus === 'done'
              return (
                <li key={e.id} className="expert">
                  <GradeBadge grade={e.grade} domain={info.label} size="large" />
                  <div className="expert__who">
                    <span className="expert__name">
                      {e.firstName} {e.lastName}
                    </span>
                    <span className="muted">
                      {e.role === 'admin' ? 'Admin' : clearanceLabel(e.clearance)} · level {e.clearance}
                    </span>
                  </div>
                  <div className="expert__stats">
                    <span className="bars__track">
                      <span className="bars__fill" style={{ width: `${Math.min(100, (e.points / maxPoints) * 100)}%` }} />
                    </span>
                    <span className="muted">
                      {e.validations} validation{e.validations === 1 ? '' : 's'} · {e.points} pts
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--small expert__action"
                    onClick={() => send([e], e.id)}
                    disabled={open || sending !== null}
                  >
                    {sending === e.id ? 'Sending…' : e.requestStatus ? STATUS_LABELS[e.requestStatus] : 'Request review'}
                  </button>
                </li>
              )
            })}
          </ol>

          {requestable.length > 0 && (
            <div className="experts__request">
              <label className="field">
                <span>Note for the reviewers (optional)</span>
                <textarea
                  className="input"
                  rows={2}
                  maxLength={500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What should they check? e.g. “Is this still in line with the current policy?”"
                />
              </label>
              {requestable.length > 1 && (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => send(requestable, 'all')}
                  disabled={sending !== null}
                >
                  {sending === 'all' ? 'Sending…' : `Request review from all ${requestable.length}`}
                </button>
              )}
            </div>
          )}
        </>
      )}
      {error && <p className="form__error">{error}</p>}
      {success && <p className="form__success">{success}</p>}
    </section>
  )
}
