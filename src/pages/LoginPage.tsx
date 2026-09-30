import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import GradeBadge from '@/components/expertise/GradeBadge'
import Button from '@/components/ui/Button'
import { useAuth } from '@/context/AuthContext'
import demo from '@/data/demo-accounts.json'
import { domainInfo, domainPoints, gradeFor, type DomainId } from '@/utils/expertise'

// Comptes créés par scripts/seed-experts.mjs ; affichés en dev ou si VITE_SHOW_DEMO_ACCOUNTS=true
const SHOW_DEMO_ACCOUNTS = import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true'

/** Meilleure note de départ du compte, pour choisir un profil selon le domaine à tester */
function topGrade(account: (typeof demo.accounts)[number]) {
  const [domain, validations] = Object.entries(account.expertise).sort(([, a], [, b]) => b - a)[0] ?? []
  if (!domain) return null
  return { domain: domainInfo(domain as DomainId), grade: gradeFor(validations * domainPoints(account.clearance)) }
}

export default function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const homeFor = (role: string) => from ?? (role === 'admin' ? '/admin/profiles' : '/dashboard')

  if (loading) return <p className="muted">Loading…</p>
  if (user) return <Navigate to={homeFor(user.role)} replace />

  const signIn = async (address: string, secret: string) => {
    setError(null)
    setSubmitting(true)
    try {
      const profile = await login(address, secret)
      navigate(homeFor(profile.role), { replace: true })
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    signIn(email, password)
  }

  return (
    <section className="auth">
      <h1>Sign in</h1>
      <p className="muted">Your clearance level decides which documents you can open.</p>
      <form className="card form" onSubmit={handleSubmit}>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="form__error">{error}</p>}
        <Button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {SHOW_DEMO_ACCOUNTS && (
        <div className="card demo-accounts">
          <h2>Demo accounts</h2>
          <p className="muted">
            One click to sign in. Password for all: <code className="mono">{demo.password}</code>
          </p>
          <ul>
            {demo.accounts.map((a) => {
              const top = topGrade(a)
              return (
                <li key={a.email}>
                  <button type="button" onClick={() => signIn(a.email, demo.password)} disabled={submitting}>
                    <span className="demo-accounts__name">
                      {a.firstName} {a.lastName}
                      <span className="muted"> · level {a.clearance}</span>
                    </span>
                    <span className="muted">{a.persona}</span>
                    {top && (
                      <span className="demo-accounts__grade">
                        <GradeBadge grade={top.grade} domain={top.domain.label} />
                        {top.domain.label}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
