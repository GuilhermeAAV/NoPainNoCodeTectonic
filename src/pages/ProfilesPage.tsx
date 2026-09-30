import { useEffect, useState, type FormEvent } from 'react'
import Button from '@/components/ui/Button'
import { MIN_PASSWORD_LENGTH, createProfile, deleteProfile, listProfiles } from '@/services/profiles'
import type { NewProfile, Profile } from '@/types'
import { clearanceLabel } from '@/utils/clearance'

const emptyForm: NewProfile = { firstName: '', lastName: '', email: '', clearance: 50, password: '' }

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [form, setForm] = useState<NewProfile>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const refresh = () =>
    listProfiles()
      .then(setProfiles)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingList(false))

  useEffect(() => {
    refresh()
  }, [])

  const update = <K extends keyof NewProfile>(key: K, value: NewProfile[K]) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (form.password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
    setSubmitting(true)
    try {
      const profile = await createProfile(form)
      await refresh()
      setForm(emptyForm)
      setConfirmPassword('')
      setSuccess(`Profil de ${profile.firstName} ${profile.lastName} créé.`)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (profile: Profile) => {
    if (!confirm(`Supprimer le profil de ${profile.firstName} ${profile.lastName} ?`)) return
    setError(null)
    try {
      await deleteProfile(profile.id)
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <section>
      <h1>Profils</h1>

      <form className="card form form--grid" onSubmit={handleSubmit}>
        <h2>Nouveau profil</h2>
        <label className="field">
          <span>Nom</span>
          <input className="input" value={form.lastName} onChange={(e) => update('lastName', e.target.value)} required />
        </label>
        <label className="field">
          <span>Prénom</span>
          <input className="input" value={form.firstName} onChange={(e) => update('firstName', e.target.value)} required />
        </label>
        <label className="field">
          <span>Adresse mail</span>
          <input className="input" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} required />
        </label>
        <label className="field">
          <span>Mot de passe</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            placeholder={`${MIN_PASSWORD_LENGTH} caractères minimum`}
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Confirmer le mot de passe</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>
            Niveau d'accréditation : <strong>{form.clearance}</strong> ({clearanceLabel(form.clearance)})
          </span>
          <div className="clearance-input">
            <input
              type="range"
              min={0}
              max={100}
              value={form.clearance}
              onChange={(e) => update('clearance', Number(e.target.value))}
            />
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              step={1}
              value={form.clearance}
              onChange={(e) => update('clearance', Math.min(100, Math.max(0, Math.round(Number(e.target.value)))))}
              required
            />
          </div>
        </label>
        {error && <p className="form__error">{error}</p>}
        {success && <p className="form__success">{success}</p>}
        <div>
          <Button type="submit" disabled={submitting}>
            Créer le profil
          </Button>
        </div>
      </form>

      <div className="card table-wrap">
        <h2>
          {loadingList ? 'Chargement…' : `${profiles.length} profil${profiles.length > 1 ? 's' : ''}`}
        </h2>
        <table className="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Prénom</th>
              <th>Adresse mail</th>
              <th>Accréditation</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <tr key={p.id}>
                <td>{p.lastName}</td>
                <td>{p.firstName}</td>
                <td>{p.email}</td>
                <td>
                  <div className="clearance">
                    <span className="bars__track">
                      <span className="bars__fill" style={{ width: `${p.clearance}%` }} />
                    </span>
                    <span>{p.clearance}</span>
                    <span className="muted">{p.role === 'admin' ? 'Admin' : clearanceLabel(p.clearance)}</span>
                  </div>
                </td>
                <td>
                  {p.role !== 'admin' && (
                    <Button variant="secondary" className="btn--small" onClick={() => handleDelete(p)}>
                      Supprimer
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
