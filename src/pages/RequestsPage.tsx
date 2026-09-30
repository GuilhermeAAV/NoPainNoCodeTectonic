import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import GradeBadge from '@/components/expertise/GradeBadge'
import { useAuth } from '@/context/AuthContext'
import { OPEN_STATUSES, listReceivedRequests, listSentRequests, respondReviewRequest } from '@/services/reviews'
import type { ReviewRequest, ReviewStatus } from '@/types'
import { domainInfo } from '@/utils/expertise'
import { docCode, formatDelta } from '@/utils/trust'

type Tab = 'received' | 'sent'

const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  done: 'Reviewed',
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Zone « Requests » : demandes de revue reçues en tant qu'expert, et celles que l'on a envoyées */
export default function RequestsPage() {
  const { user, loading: authLoading } = useAuth()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'sent' ? 'sent' : 'received'
  const [received, setReceived] = useState<ReviewRequest[] | null>(null)
  const [sent, setSent] = useState<ReviewRequest[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = async (uid: string) => {
    const [r, s] = await Promise.all([listReceivedRequests(uid), listSentRequests(uid)])
    setReceived(r)
    setSent(s)
  }

  useEffect(() => {
    if (user) load(user.id).catch((err: Error) => setError(err.message))
  }, [user])

  if (authLoading) return <p className="muted">Loading…</p>
  if (!user)
    return (
      <p className="empty">
        <Link to="/login">Sign in</Link> to see your review requests.
      </p>
    )

  const respond = async (r: ReviewRequest, action: 'accept' | 'decline' | 'cancel') => {
    setBusy(r.id)
    setError(null)
    try {
      await respondReviewRequest(r.id, action)
      await load(user.id)
      // Le compteur de l'en-tête se met à jour à la prochaine navigation ; on le prévient tout de suite
      window.dispatchEvent(new Event('review-requests-changed'))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const list = tab === 'received' ? received : sent
  const openReceived = received?.filter((r) => OPEN_STATUSES.includes(r.status)).length ?? 0

  return (
    <section className="requests">
      <header>
        <h1>Requests</h1>
        <p className="lead">
          Review requests for unreliable documents. You’re asked because of your grade in the document’s domain: open it,
          check it and validate it to close the request.
        </p>
      </header>

      <div className="segmented" role="group" aria-label="Requests">
        <button type="button" aria-pressed={tab === 'received'} onClick={() => setParams({}, { replace: true })}>
          Received{openReceived > 0 && ` · ${openReceived} open`}
        </button>
        <button type="button" aria-pressed={tab === 'sent'} onClick={() => setParams({ tab: 'sent' }, { replace: true })}>
          Sent{sent && sent.length > 0 && ` · ${sent.length}`}
        </button>
      </div>

      {error && <p className="form__error">{error}</p>}
      {list === null && !error && <p className="muted">Loading…</p>}
      {list?.length === 0 && (
        <p className="empty">
          {tab === 'received'
            ? 'No review requests yet. Validate documents in your domains to raise your grades and get recommended.'
            : 'You haven’t requested any review. Open a low-trust document to ask a recommended expert.'}
        </p>
      )}

      {list && list.length > 0 && (
        <ul className="requests__list">
          {list.map((r) => {
            const domain = domainInfo(r.domain)
            const open = OPEN_STATUSES.includes(r.status)
            return (
              <li key={r.id} className={`request ${open ? '' : 'request--closed'}`}>
                <div className="request__head">
                  <span className={`status status--${r.status}`}>{STATUS_LABELS[r.status]}</span>
                  <span className="mono muted">
                    {docCode(r.documentId)} · {formatDate(r.createdAt)}
                  </span>
                </div>
                <Link to={`/documents/${r.documentId}`} className="request__title">
                  {r.documentTitle}
                </Link>
                <p className="request__meta">
                  <span className="domain-chip">
                    <span>{domain.label}</span>
                    <span className="muted">trust {r.documentScore}/100 when requested</span>
                  </span>
                </p>
                <p className="request__who">
                  {tab === 'received' ? (
                    <>
                      Requested by <strong>{r.requesterName}</strong> · you’re graded{' '}
                      <GradeBadge grade={r.expertGrade} domain={domain.label} /> in {domain.label}
                    </>
                  ) : (
                    <>
                      Sent to <strong>{r.expertName}</strong> <GradeBadge grade={r.expertGrade} domain={domain.label} />
                    </>
                  )}
                </p>
                {r.message && <blockquote className="request__message">{r.message}</blockquote>}
                {r.status === 'done' && r.validationDelta !== undefined && (
                  <p className="form__success">Validated: {formatDelta(r.validationDelta)} trust points.</p>
                )}

                <div className="actions">
                  {tab === 'received' && open && (
                    <Link to={`/documents/${r.documentId}`} className="btn btn--primary btn--small">
                      Review document
                    </Link>
                  )}
                  {tab === 'received' && r.status === 'pending' && (
                    <button
                      type="button"
                      className="btn btn--secondary btn--small"
                      onClick={() => respond(r, 'accept')}
                      disabled={busy !== null}
                    >
                      Accept
                    </button>
                  )}
                  {tab === 'received' && open && (
                    <button
                      type="button"
                      className="btn btn--secondary btn--small"
                      onClick={() => respond(r, 'decline')}
                      disabled={busy !== null}
                    >
                      Decline
                    </button>
                  )}
                  {tab === 'sent' && open && (
                    <button
                      type="button"
                      className="btn btn--secondary btn--small"
                      onClick={() => respond(r, 'cancel')}
                      disabled={busy !== null}
                    >
                      Cancel request
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
