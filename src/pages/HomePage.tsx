import { Link } from 'react-router-dom'
import { ArrowRight, Lock, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { items } from '@/data/items'
import { canRead, clearanceLabel, readerLevel, tiers } from '@/utils/clearance'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF8AD1]'

const STYLES = `
@keyframes ring-draw { from { stroke-dashoffset: var(--circ) } }
@keyframes pop-in { from { opacity: 0; transform: translateY(8px) } }
.ring-draw { animation: ring-draw 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.pop-in { animation: pop-in 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.grow-in { animation: grow 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
`

/** Part des documents que le lecteur peut ouvrir, même anneau que la fiabilité du tableau de bord */
function AccessRing({ readable, total }: { readable: number; total: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - readable / total)
  return (
    <div className="relative grid size-[152px] shrink-0 place-items-center">
      <svg viewBox="0 0 136 136" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="accessRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FF5CB8" />
            <stop offset="100%" stopColor="#A78BFA" />
          </linearGradient>
        </defs>
        <circle cx="68" cy="68" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="9" />
        <circle
          className="ring-draw"
          cx="68"
          cy="68"
          r={r}
          fill="none"
          stroke="url(#accessRingGrad)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ ['--circ' as string]: circ }}
        />
      </svg>
      <div className="relative text-center">
        <p className="display m-0 text-[40px] font-extrabold leading-none text-white">
          {readable}
          <span className="text-xl font-bold text-white/50">/{total}</span>
        </p>
        <p className="m-0 mt-1 text-xs font-medium text-white/60">you can open</p>
      </div>
    </div>
  )
}

export default function HomePage() {
  const { user } = useAuth()
  const level = readerLevel(user)
  const readable = items.filter((item) => canRead(level, item)).length
  const recipient = user ? `${user.firstName} ${user.lastName}` : 'Visitor'
  const levelLabel = user?.role === 'admin' ? 'Admin' : clearanceLabel(level)

  return (
    <>
      <style>{STYLES}</style>

      <section
        aria-labelledby="hero-title"
        className="pop-in relative overflow-hidden rounded-3xl bg-[#2B0B45] px-6 py-10 text-white shadow-[0_1px_2px_rgba(43,11,69,0.05),0_32px_64px_-32px_rgba(43,11,69,0.45)] sm:px-10 sm:py-14"
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'radial-gradient(90% 140% at 100% 0%, rgba(211,7,127,0.6), transparent 60%)' }}
        />
        <div className="relative flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
              <ShieldCheck className="size-3.5 text-[#FF8AD1]" />
              {recipient} · level {level} · {levelLabel}
            </span>
            <h1
              id="hero-title"
              className="display mt-5 mb-0 text-[40px] font-extrabold leading-[1.05] text-white sm:text-[56px]"
            >
              Don’t just find knowledge.{' '}
              <span className="text-[#FF8AD1]">Know what it’s worth.</span>
            </h1>
            <p className="mt-4 mb-0 max-w-[52ch] text-base leading-relaxed text-white/70 sm:text-lg">
              Every internal document gets a trust score. Expert validations raise it, conflicts and outdated content
              lower it, and you only see what your clearance level allows.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/search" className="btn btn--primary">
                Browse documents <ArrowRight className="size-4" />
              </Link>
              {!user && (
                <Link
                  to="/login"
                  className={`inline-flex items-center rounded-xl bg-white/10 px-5 py-3 text-sm font-semibold text-white no-underline ring-1 ring-inset ring-white/20 transition-colors hover:bg-white/15 hover:text-white ${FOCUS}`}
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
          <AccessRing readable={readable} total={items.length} />
        </div>
      </section>

      <section aria-labelledby="levels-title" className="mt-12">
        <div className="mb-5">
          <h2 id="levels-title" className="mb-0">
            Clearance levels
          </h2>
          <p className="mt-1 mb-0 text-sm text-slate-500">
            An admin gives you a level from 0 to 100. A level 50 document opens for anyone at level 50 or above.
          </p>
        </div>

        <div className="card p-6 sm:p-8">
          <ol className="m-0 flex list-none p-0">
            {tiers.map((tier, i) => {
              const next = tiers[i + 1]?.min ?? 100
              const reached = level >= tier.min
              return (
                <li
                  key={tier.label}
                  style={{ flexBasis: `${next - tier.min}%` }}
                  className="min-w-0 border-l border-slate-200 pl-2.5 first:border-l-0 first:pl-0"
                >
                  <span className="block text-xs text-slate-400">{tier.min}</span>
                  <span
                    className={`block truncate text-sm font-semibold ${reached ? 'text-slate-900' : 'text-slate-400'}`}
                  >
                    {tier.label}
                  </span>
                </li>
              )
            })}
          </ol>

          <div
            className="relative mt-4 h-3 rounded-full bg-slate-100"
            role="img"
            aria-label={`Your level: ${level} out of 100`}
          >
            <div
              className="grow-in absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${level}%`, background: 'linear-gradient(90deg,#D3077F,#6D28D9)' }}
            />
            {items.map((item) => (
              <span
                key={item.id}
                className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ${
                  canRead(level, item) ? 'ring-[#2B0B45]' : 'ring-slate-300'
                }`}
                style={{ left: `calc(7px + (100% - 14px) * ${item.clearance / 100})` }}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 text-sm text-slate-600">
              You can open <strong className="text-slate-900">{readable}</strong> of {items.length} documents.
              {!user && ' Sign in to see the ones at your level.'}
            </p>
            <ul className="m-0 flex list-none gap-4 p-0 text-xs text-slate-500">
              <li className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-white ring-2 ring-[#2B0B45]" /> You can open
              </li>
              <li className="flex items-center gap-1.5">
                <Lock className="size-3.5 text-slate-400" /> Above your level
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  )
}
