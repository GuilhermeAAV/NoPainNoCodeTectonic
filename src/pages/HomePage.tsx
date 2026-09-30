import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { items } from '@/data/items'
import { canRead, clearanceLabel, docRef, readerLevel, tiers } from '@/utils/clearance'

export default function HomePage() {
  const { user } = useAuth()
  const level = readerLevel(user)
  const readable = items.filter((item) => canRead(level, item)).length
  const recipient = user ? `${user.firstName} ${user.lastName}` : 'Visiteur'

  return (
    <>
      <section className="envelope tint" aria-labelledby="hero-title">
        <p className="envelope__meta mono">
          <span>Pli {docRef(items.length)}</span>
          <span>
            Destinataire : {recipient} · niveau {level}
          </span>
        </p>
        <div className="envelope__window">
          <h1 id="hero-title" className="display">
            Chaque document, à&nbsp;la bonne personne.
          </h1>
          <p className="lead">
            DocExchange partage les documents internes selon le niveau d'accréditation de chacun. Ce qui dépasse
            votre niveau reste sous pli.
          </p>
          <div className="actions">
            <Link to="/search" className="btn btn--primary">
              Parcourir les documents
            </Link>
            {!user && (
              <Link to="/login" className="btn btn--secondary">
                Se connecter
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="levels" aria-labelledby="levels-title">
        <div className="levels__intro">
          <h2 id="levels-title">Niveaux d'accréditation</h2>
          <p className="muted">
            Un administrateur vous attribue un niveau de 0 à 100. Un document de niveau 50 s'ouvre à partir de 50.
          </p>
        </div>

        <div className="scale" style={{ '--level': `${level}%` } as CSSProperties}>
          <ol className="scale__tiers">
            {tiers.map((tier, i) => {
              const next = tiers[i + 1]?.min ?? 100
              return (
                <li key={tier.label} style={{ flexBasis: `${next - tier.min}%` }}>
                  <span className="mono">{tier.min}</span>
                  {tier.label}
                </li>
              )
            })}
          </ol>
          <div className="scale__track">
            {items.map((item) => (
              <span
                key={item.id}
                className={`scale__doc ${canRead(level, item) ? '' : 'scale__doc--sealed'}`}
                style={{ '--at': item.clearance } as CSSProperties}
              />
            ))}
            {level < 100 && <span className="scale__sealed tint" />}
            <span className="scale__marker">
              <span className="mono">
                Vous · {level} · {user?.role === 'admin' ? 'Admin' : clearanceLabel(level)}
              </span>
            </span>
          </div>
        </div>

        <p className="levels__summary">
          Vous pouvez ouvrir <strong>{readable}</strong> document{readable > 1 ? 's' : ''} sur {items.length}.
          {!user && ' Connectez-vous pour voir ceux de votre niveau.'}
        </p>
      </section>
    </>
  )
}
