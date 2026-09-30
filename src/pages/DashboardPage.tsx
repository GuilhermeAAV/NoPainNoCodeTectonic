import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
import { db } from '../services/firebase'
import SimulatePanel from '@/components/dashboard/SimulatePanel'

import {
  BadgeCheck,
  Check,
  ChevronRight,
  Clock,
  ExternalLink,
  FileQuestion,
  FileText,
  Loader2,
  Minus,
  PenLine,
  Radar,
  Scale,
  Send,
  ShieldAlert,
  MessageSquare,
  BookOpen,
  TrendingUp,
  Users,
} from 'lucide-react'

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export type Tone = 'danger' | 'warn' | 'ok'

export interface Source {
  id: string
  name: string
  kind: 'pdf' | 'chat' | 'wiki'
  location: string
  status: string
  tone: Tone
  value: string
  unit: string
  excerpt: string
  highlight: string
  updated: string
  age: string
  official: boolean
  owner: string
  confidence: number
}

export interface Conflict {
  id: string
  topic: string
  context: string
  detected: string
  severity: 'High' | 'Medium'
  difference: string
  flags: string[]
  verdict: string
  expert: string
  sources: [Source, Source]
}

export interface Gap {
  id: string
  query: string
  count: number
  change: number
  trend: 'up' | 'flat'
  weekly: number[]
}

/* -------------------------------------------------------------------------- */
/*  Design tokens                                                             */
/* -------------------------------------------------------------------------- */

const TONES: Record<
  Tone,
  { pill: string; bar: string; accent: string; card: string; mark: string; text: string }
> = {
  danger: {
    pill: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200',
    bar: '#E11D48',
    accent: 'bg-rose-500',
    card: 'border-rose-200/80',
    mark: 'bg-rose-100 text-rose-900',
    text: 'text-rose-600',
  },
  warn: {
    pill: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
    bar: '#F59E0B',
    accent: 'bg-amber-400',
    card: 'border-amber-200/80',
    mark: 'bg-amber-100 text-amber-900',
    text: 'text-amber-600',
  },
  ok: {
    pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
    bar: '#10B981',
    accent: 'bg-emerald-500',
    card: 'border-emerald-200/80',
    mark: 'bg-emerald-100 text-emerald-900',
    text: 'text-emerald-600',
  },
}

const KIND_ICON = { pdf: FileText, chat: MessageSquare, wiki: BookOpen } as const
const KIND_LABEL = { pdf: 'PDF document', chat: 'Chat message', wiki: 'Wiki page' } as const

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D3077F]'

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&display=swap');
.tr-root { font-family: 'Figtree', ui-sans-serif, system-ui, sans-serif; font-feature-settings: 'tnum' 1; }
.tr-display { font-family: 'Bricolage Grotesque', 'Figtree', ui-sans-serif, system-ui, sans-serif; letter-spacing: -0.02em; }
@keyframes tr-grow { from { width: 0 } }
@keyframes tr-ring { from { stroke-dashoffset: var(--tr-circ) } }
@keyframes tr-sweep { to { transform: rotate(360deg) } }
@keyframes tr-pop { from { opacity: 0; transform: translateY(4px) } }
.tr-grow { animation: tr-grow 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.tr-ring { animation: tr-ring 1.4s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.tr-sweep { animation: tr-sweep 9s linear infinite; }
.tr-pop { animation: tr-pop 0.25s ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .tr-grow, .tr-ring, .tr-sweep, .tr-pop { animation: none !important; }
  .tr-root * { transition-duration: 0.01ms !important; }
}
`

/* -------------------------------------------------------------------------- */
/*  Small building blocks                                                     */
/* -------------------------------------------------------------------------- */

function Sparkline({ data, color, w = 88, h = 28 }: { data: number[]; color: string; w?: number; h?: number }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - 6) + 3
    const y = h - 4 - ((v - min) / (max - min || 1)) * (h - 8)
    return [x, y] as const
  })
  const last = pts[pts.length - 1]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true" className="shrink-0">
      <polyline
        points={pts.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
    </svg>
  )
}

function ReliabilityRing({ score }: { score: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - (score || 0) / 100)
  return (
    <div className="relative grid size-[136px] shrink-0 place-items-center">
      <div className="absolute inset-[14px] overflow-hidden rounded-full bg-[#FDF2F8]">
        <div
          className="tr-sweep absolute inset-0"
          style={{ background: 'conic-gradient(from 0deg, rgba(211,7,127,0.28), rgba(211,7,127,0) 28%)' }}
        />
        <div className="absolute inset-[22%] rounded-full border border-[#D3077F]/15" />
      </div>
      <svg viewBox="0 0 136 136" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="trRingGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D3077F" />
            <stop offset="100%" stopColor="#6D28D9" />
          </linearGradient>
        </defs>
        <circle cx="68" cy="68" r={r} fill="none" stroke="#E9E4F0" strokeWidth="9" />
        <circle
          className="tr-ring transition-all duration-700 ease-out"
          cx="68"
          cy="68"
          r={r}
          fill="none"
          stroke="url(#trRingGrad)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ ['--tr-circ' as string]: circ }}
        />
      </svg>
      <div className="tr-display relative text-[40px] font-extrabold leading-none text-[#2B0B45] transition-all duration-300">
        {score}
        <span className="text-xl font-bold text-slate-400">%</span>
      </div>
    </div>
  )
}

function Excerpt({ text, mark, tone }: { text: string; mark: string; tone: Tone }) {
  const i = text.indexOf(mark)
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className={`rounded px-1 py-0.5 font-semibold ${TONES[tone].mark}`}>{mark}</mark>
      {text.slice(i + mark.length)}
    </>
  )
}

function Signal({ icon, good, children }: { icon: ReactNode; good: boolean | null; children: ReactNode }) {
  const color = good === null ? 'text-slate-400' : good ? 'text-emerald-600' : 'text-amber-600'
  return (
    <li className="flex items-start gap-2.5 text-sm text-slate-600">
      <span className={`mt-0.5 shrink-0 ${color}`}>{icon}</span>
      <span>{children}</span>
    </li>
  )
}

function SourceCard({ source, label }: { source: Source; label: string }) {
  const tone = TONES[source.tone]
  const Icon = KIND_ICON[source.kind]
  return (
    <article
      className={`relative overflow-hidden rounded-2xl border bg-white ${tone.card} shadow-[0_1px_2px_rgba(43,11,69,0.05),0_12px_24px_-16px_rgba(43,11,69,0.25)]`}
      aria-label={`${label}: ${source.name}`}
    >
      <div className={`h-1 w-full ${tone.accent}`} />
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <Icon className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{source.name}</p>
              <p className="truncate text-xs text-slate-500">
                {label}, {KIND_LABEL[source.kind].toLowerCase()}
              </p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.pill}`}>
            {source.status}
          </span>
        </div>

        <div className="mt-6">
          <p className="text-xs font-medium text-slate-500">This source says</p>
          <p className="tr-display mt-1 flex items-baseline gap-2 text-[56px] font-extrabold leading-none text-[#2B0B45]">
            {source.value}
            <span className="text-2xl font-bold text-slate-400">{source.unit}</span>
          </p>
          <p className="mt-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
            <Excerpt text={source.excerpt} mark={source.highlight} tone={source.tone} />
          </p>
        </div>

        <ul className="mt-5 space-y-2.5">
          <Signal
            good={source.official}
            icon={source.official ? <BadgeCheck className="size-4" /> : <ShieldAlert className="size-4" />}
          >
            {source.official ? 'Approved policy source' : 'Not an approved policy source'}
          </Signal>
          <Signal good={source.tone === 'danger' ? false : null} icon={<Clock className="size-4" />}>
            Updated {source.updated}, {source.age}
          </Signal>
          <Signal good={null} icon={<Users className="size-4" />}>
            {source.owner}
          </Signal>
        </ul>

        <div className="mt-6 border-t border-slate-100 pt-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-500">AI confidence</span>
            <span className="font-bold text-slate-900">{source.confidence}%</span>
          </div>
          <div
            className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-label={`AI confidence in ${source.name}`}
            aria-valuenow={source.confidence}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="tr-grow h-full rounded-full"
              style={{ width: `${source.confidence}%`, backgroundColor: tone.bar }}
            />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <p className="truncate text-xs text-slate-500">{source.location}</p>
            <button
              type="button"
              className={`ml-3 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-[#D3077F] ${FOCUS}`}
            >
              Open source <ExternalLink className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </article>
  )
}

function Delta({ value, goodWhenDown = false, suffix = '' }: { value: number; goodWhenDown?: boolean; suffix?: string }) {
  const up = value > 0
  const good = goodWhenDown ? !up : up
  const cls = value === 0 ? 'text-slate-500' : good ? 'text-emerald-700' : 'text-rose-700'
  return (
    <span className={`text-xs font-semibold transition-colors duration-300 ${cls}`}>
      {value > 0 ? '+' : ''}
      {value}
      {suffix} this week
    </span>
  )
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function TrustRadarDashboard() {
  const [h, setHealthData] = useState<any>(null)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [gaps, setGaps] = useState<Gap[]>([])
  
  const [activeId, setActiveId] = useState<string | null>(null)
  const [escalation, setEscalation] = useState<Record<string, 'sending' | 'sent'>>({})
  const [drafts, setDrafts] = useState<Record<string, 'drafting' | 'drafted'>>({})
  const [loading, setLoading] = useState(true)
  const [simulating, setSimulating] = useState(false)

  // Real-time Firebase Listeners
  useEffect(() => {
    const unsubHealth = onSnapshot(doc(db, 'health', 'latest-stats'), (docSnap) => {
      if (docSnap.exists()) {
        setHealthData(docSnap.data())
      }
    })

    const unsubConflicts = onSnapshot(collection(db, 'conflicts'), (snapshot) => {
      const liveConflicts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Conflict))
      setConflicts(liveConflicts)
      if (liveConflicts.length > 0) {
        setActiveId(prev => prev || liveConflicts[0].id)
      }
    })

    const unsubGaps = onSnapshot(collection(db, 'gaps'), (snapshot) => {
      const liveGaps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Gap))
      setGaps(liveGaps)
      setLoading(false)
    })

    return () => {
      unsubHealth()
      unsubConflicts()
      unsubGaps()
    }
  }, [])

  // Reset function properly placed inside the component scope
  const resetDatabase = async () => {
    try {
      const healthRef = doc(db, 'health', 'latest-stats')
      await setDoc(healthRef, {
        score: 78,
        scoreDelta: -2,
        official: 64,
        current: 81,
        consistent: 88,
        conflicts: 12,
        conflictsDelta: 3,
        conflictsWeekly: [6, 7, 7, 9, 9, 10, 12],
        gaps: 5,
        gapsRising: 2,
        gapsWeekly: [3, 3, 4, 4, 4, 5, 5],
        scannedDocs: 1284,
        lastScan: '4 min ago'
      })
    } catch (error) {
      console.error("Error resetting:", error)
    }
  }

  const handleEscalate = (id: string) => {
    setEscalation((p) => ({ ...p, [id]: 'sending' }))
    setTimeout(() => setEscalation((p) => ({ ...p, [id]: 'sent' })), 1000)
  }

  const handleDraft = (id: string) => {
    setDrafts((p) => ({ ...p, [id]: 'drafting' }))
    setTimeout(() => setDrafts((p) => ({ ...p, [id]: 'drafted' })), 900)
  }

  if (loading || !h) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F6F4F9]">
         <Loader2 className="size-10 animate-spin text-[#D3077F]" />
         <p className="mt-4 text-xs font-bold tracking-widest text-slate-500 uppercase">Loading Trust Radar...</p>
      </div>
    )
  }

  const conflict = conflicts.find((c) => c.id === activeId) ?? conflicts[0]
  const escState = conflict ? escalation[conflict.id] : null
  const maxCount = gaps.length > 0 ? Math.max(...gaps.map((g) => g.count)) : 1

  return (
    <div
      className="tr-root min-h-screen pb-16 text-slate-900 selection:bg-[#D3077F]/20 selection:text-[#2B0B45]"
      style={{
        backgroundColor: '#F6F4F9',
        backgroundImage: 'radial-gradient(60% 40% at 85% -5%, rgba(211,7,127,0.10), transparent 70%)',
      }}
    >
      <style>{STYLES}</style>
      {simulating && <SimulatePanel onClose={() => setSimulating(false)} onConflict={setActiveId} />}

      {/* Titre de page : l'en-tête global du site (Header) remplace l'ancien en-tête collant */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[#2B0B45] text-white shadow-[0_8px_20px_-8px_rgba(43,11,69,0.8)]">
            <Radar className="size-5 text-[#FF5CB8]" />
          </div>
          <div>
            <h1 className="tr-display m-0 text-3xl font-extrabold leading-none text-[#2B0B45]">Trust Radar</h1>
            <p className="m-0 mt-1 text-xs text-slate-500">Knowledge Copilot for SD Worx</p>
          </div>
        </div>

          <div className="flex items-center gap-4 sm:gap-6">
            <button 
              onClick={() => setSimulating(true)}
              className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-700 shadow-sm transition-all hover:bg-indigo-100 active:scale-95"
            >
              + Simulate
            </button>

            <button 
              onClick={resetDatabase}
              className="hidden rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 shadow-sm transition-all hover:bg-rose-100 active:scale-95 sm:block"
            >
              Reset Data
            </button>
            <div className="hidden items-center gap-2.5 rounded-full border border-slate-200 bg-white/80 py-1.5 pl-3 pr-4 sm:flex">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
              </span>
              <span className="text-xs font-semibold text-slate-700">All sources syncing</span>
              <span className="text-xs text-slate-400">Last scan {h.lastScan}</span>
            </div>
            <div className="flex items-center gap-3 border-l border-slate-200 pl-4 sm:pl-6">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold leading-none text-slate-900">Admin User</p>
                <p className="mt-1 text-xs text-slate-500">Payroll policy manager</p>
              </div>
              <div
                className="grid size-9 place-items-center rounded-full text-xs font-bold text-white ring-2 ring-white"
                style={{ background: 'linear-gradient(135deg,#D3077F,#6D28D9)' }}
                aria-label="Admin User"
              >
                AU
              </div>
            </div>
          </div>
        </div>

      <div>
        {/* Knowledge health */}
        <section aria-labelledby="health-title">
          <div className="mb-5">
            <h2 id="health-title" className="tr-display text-2xl font-bold text-[#2B0B45]">
              Knowledge health
            </h2>
            <p className="mt-1 text-sm text-slate-500 transition-all">
              Based on {h.scannedDocs?.toLocaleString()} documents across SharePoint, Teams and the payroll wiki.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr_1fr]">
            {/* Reliability */}
            <div className="flex flex-col gap-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(43,11,69,0.04),0_20px_40px_-28px_rgba(43,11,69,0.35)] sm:flex-row sm:items-center">
              <ReliabilityRing score={h.score} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-slate-900">Overall reliability</p>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                    Needs attention
                  </span>
                </div>
                <p className="mt-0.5 text-xs font-semibold text-rose-700 transition-all">{h.scoreDelta} points this week</p>
                <dl className="mt-4 space-y-2.5">
                  {[
                    ['Official sources', h.official],
                    ['Up to date', h.current],
                    ['Consistent', h.consistent],
                  ].map(([label, v]) => (
                    <div key={label as string}>
                      <div className="flex justify-between text-xs">
                        <dt className="text-slate-500">{label}</dt>
                        <dd className="font-semibold text-slate-800 transition-all">{v}%</dd>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="tr-grow h-full rounded-full bg-[#D3077F] transition-all duration-500"
                          style={{ width: `${v}%`, opacity: 0.35 + (v as number) / 160 }}
                        />
                      </div>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {/* Conflicts */}
            <div className="flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(43,11,69,0.04),0_20px_40px_-28px_rgba(43,11,69,0.35)]">
              <div className="flex items-start justify-between">
                <div className="grid size-10 place-items-center rounded-xl bg-rose-50 text-rose-600">
                  <ShieldAlert className="size-5" />
                </div>
                {h.conflictsWeekly && <Sparkline data={h.conflictsWeekly} color="#E11D48" />}
              </div>
              <div className="mt-6">
                <p className="tr-display text-5xl font-extrabold leading-none text-[#2B0B45] transition-all">{h.conflicts}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">Active conflicts</p>
                <Delta value={h.conflictsDelta} goodWhenDown />
              </div>
            </div>

            {/* Gaps */}
            <div className="flex flex-col justify-between rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(43,11,69,0.04),0_20px_40px_-28px_rgba(43,11,69,0.35)]">
              <div className="flex items-start justify-between">
                <div className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
                  <FileQuestion className="size-5" />
                </div>
                {h.gapsWeekly && <Sparkline data={h.gapsWeekly} color="#F59E0B" />}
              </div>
              <div className="mt-6">
                <p className="tr-display text-5xl font-extrabold leading-none text-[#2B0B45] transition-all">{h.gaps}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">Identified gaps</p>
                <span className="text-xs font-semibold text-amber-700 transition-all">{h.gapsRising} rising fast</span>
              </div>
            </div>
          </div>
        </section>

        {/* Conflicts + gaps */}
        <div className="mt-12 grid gap-8 lg:grid-cols-3">
          {/* Conflict detection */}
          {conflict && (
            <section className="lg:col-span-2" aria-labelledby="conflict-title">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 id="conflict-title" className="tr-display text-2xl font-bold text-[#2B0B45]">
                    Conflict detection
                  </h2>
                  <p className="mt-1 text-sm text-slate-500 transition-all">
                    Showing the {conflicts.length} highest priority of {h.conflicts} conflicts.
                  </p>
                </div>
              </div>

              {/* Conflict switcher */}
              <div
                role="tablist"
                aria-label="Conflicts to review"
                className="mb-4 flex gap-1 overflow-x-auto rounded-2xl bg-slate-200/50 p-1"
              >
                {conflicts.map((c) => {
                  const selected = c.id === conflict.id
                  return (
                    <button
                      key={c.id}
                      role="tab"
                      type="button"
                      aria-selected={selected}
                      onClick={() => setActiveId(c.id)}
                      className={`flex min-w-[180px] flex-1 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-left text-sm font-semibold transition-all ${FOCUS} ${
                        selected
                          ? 'bg-white text-[#2B0B45] shadow-[0_1px_3px_rgba(43,11,69,0.15)]'
                          : 'text-slate-500 hover:bg-white/60 hover:text-slate-800'
                      }`}
                    >
                      <span
                        className={`size-2 shrink-0 rounded-full ${c.severity === 'High' ? 'bg-[#D3077F]' : 'bg-amber-400'}`}
                        aria-hidden="true"
                      />
                      <span className="truncate">{c.topic}</span>
                      {escalation[c.id] === 'sent' && <Check className="ml-auto size-4 shrink-0 text-emerald-600" />}
                    </button>
                  )
                })}
              </div>

              <div
                key={conflict.id}
                className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(43,11,69,0.05),0_32px_64px_-32px_rgba(43,11,69,0.45)]"
              >
                {/* Plum header */}
                <div className="relative overflow-hidden bg-[#2B0B45] px-6 py-7 text-white sm:px-8">
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{ background: 'radial-gradient(90% 140% at 100% 0%, rgba(211,7,127,0.6), transparent 60%)' }}
                  />
                  <div className="relative">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`rounded-full px-2.5 py-1 font-semibold ${
                          conflict.severity === 'High' ? 'bg-[#D3077F] text-white' : 'bg-amber-400 text-amber-950'
                        }`}
                      >
                        {conflict.severity} priority
                      </span>
                      <span className="text-white/70">{conflict.detected}</span>
                    </div>
                    <h3 className="tr-display mt-3 text-3xl font-bold leading-tight sm:text-[34px]">
                      {conflict.topic}
                    </h3>
                    <p className="mt-1.5 text-sm text-white/70">
                      Applies to: {conflict.context}. Two sources give different answers.
                    </p>
                    <ul className="mt-5 flex flex-wrap gap-2">
                      {conflict.flags.map((f) => (
                        <li
                          key={f}
                          className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/90 ring-1 ring-inset ring-white/15 backdrop-blur-sm"
                        >
                          <ShieldAlert className="size-3.5 text-[#FF8AD1]" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Split view */}
                <div className="bg-[#FBFAFD] p-4 sm:p-8">
                  <div className="relative grid gap-4 md:grid-cols-2 md:gap-14">
                    <div
                      className="pointer-events-none absolute inset-y-0 left-1/2 hidden border-l border-dashed border-slate-300 md:block"
                      aria-hidden="true"
                    />
                    <div
                      className="absolute left-1/2 top-[132px] z-10 hidden size-12 -translate-x-1/2 place-items-center rounded-full bg-[#2B0B45] text-xl font-bold text-white shadow-[0_8px_24px_-6px_rgba(43,11,69,0.7)] ring-4 ring-[#FBFAFD] md:grid"
                      role="img"
                      aria-label={`Answers conflict, ${conflict.difference}`}
                    >
                      ≠
                    </div>

                    <SourceCard key={`${conflict.id}-a`} source={conflict.sources[0]} label="Source A" />

                    <div className="flex items-center justify-center gap-3 md:hidden" aria-hidden="true">
                      <span className="h-px flex-1 border-t border-dashed border-slate-300" />
                      <span className="grid size-10 place-items-center rounded-full bg-[#2B0B45] text-lg font-bold text-white">
                        ≠
                      </span>
                      <span className="h-px flex-1 border-t border-dashed border-slate-300" />
                    </div>

                    <SourceCard key={`${conflict.id}-b`} source={conflict.sources[1]} label="Source B" />
                  </div>

                  {/* Verdict */}
                  <div className="mt-6 flex gap-4 rounded-2xl border border-[#D3077F]/20 bg-[#FDF2F8] p-5">
                    <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-[#D3077F] shadow-sm">
                      <Scale className="size-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#2B0B45]">
                        Why this needs review ({conflict.difference})
                      </p>
                      <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-slate-700">{conflict.verdict}</p>
                    </div>
                  </div>
                </div>

                {/* Action footer */}
                <div className="flex flex-col gap-4 border-t border-slate-200 bg-white px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                      BE
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{conflict.expert}</p>
                      <p className="text-xs text-slate-500">Usually replies within 1 working day</p>
                    </div>
                  </div>

                  <div aria-live="polite" className="sm:text-right">
                    {escState === 'sent' && (
                      <p className="tr-pop mb-2 text-xs font-medium text-emerald-700 sm:mb-1">
                        Sent. You will be notified when the answer is confirmed.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => handleEscalate(conflict.id)}
                      disabled={!!escState}
                      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold transition-all sm:w-auto ${FOCUS} ${
                        escState === 'sent'
                          ? 'cursor-default bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
                          : escState === 'sending'
                            ? 'cursor-wait bg-[#D3077F]/80 text-white'
                            : 'bg-[#D3077F] text-white shadow-[0_10px_24px_-10px_rgba(211,7,127,0.8)] hover:bg-[#B90670] hover:shadow-[0_14px_28px_-10px_rgba(211,7,127,0.9)] active:scale-[0.98]'
                      }`}
                    >
                      {escState === 'sent' ? (
                        <>
                          <Check className="size-4" /> Sent to expert
                        </>
                      ) : escState === 'sending' ? (
                        <>
                          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> Sending
                        </>
                      ) : (
                        <>
                          <Send className="size-4" /> Escalate to expert
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Knowledge gaps */}
          <section className="lg:col-span-1" aria-labelledby="gaps-title">
            <div className="mb-5">
              <h2 id="gaps-title" className="tr-display text-2xl font-bold text-[#2B0B45]">
                Knowledge gaps
              </h2>
              <p className="mt-1 text-sm text-slate-500">Searches with no trusted result in the last 30 days.</p>
            </div>

            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(43,11,69,0.04),0_20px_40px_-28px_rgba(43,11,69,0.35)]">
              <ul className="divide-y divide-slate-100">
                {gaps.map((gap) => {
                  const state = drafts[gap.id]
                  return (
                    <li key={gap.id} className="p-5 transition-colors hover:bg-[#FDF8FC]">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-[15px] font-semibold leading-snug text-slate-900">{gap.query}</h3>
                        {gap.weekly && (
                          <Sparkline
                            data={gap.weekly}
                            color={gap.trend === 'up' ? '#D3077F' : '#94A3B8'}
                            w={64}
                            h={24}
                          />
                        )}
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="tr-grow h-full rounded-full bg-[#2B0B45]/70 transition-all duration-500"
                            style={{ width: `${(gap.count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-slate-700 transition-all">{gap.count} searches</span>
                      </div>

                      <div className="mt-4 flex items-center justify-between">
                        {gap.trend === 'up' ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-[#B90670]">
                            <TrendingUp className="size-3.5" /> Up {gap.change}%
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs font-semibold text-slate-500">
                            <Minus className="size-3.5" /> Steady
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDraft(gap.id)}
                          disabled={state === 'drafting'}
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${FOCUS} ${
                            state === 'drafted'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                              : state === 'drafting'
                                ? 'cursor-wait border-slate-200 bg-slate-50 text-slate-500'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-[#D3077F]/40 hover:bg-[#FDF2F8] hover:text-[#B90670] active:scale-[0.97]'
                          }`}
                        >
                          {state === 'drafted' ? (
                            <>
                              <Check className="size-3.5" /> Draft ready
                            </>
                          ) : state === 'drafting' ? (
                            <>
                              <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" /> Drafting
                            </>
                          ) : (
                            <>
                              <PenLine className="size-3.5" /> Draft policy
                            </>
                          )}
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>

              <button
                type="button"
                className={`flex w-full items-center justify-center gap-1 border-t border-slate-100 bg-slate-50/70 px-4 py-3.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-[#FDF2F8] hover:text-[#B90670] ${FOCUS}`}
              >
                View all {h.gaps} gaps <ChevronRight className="size-4" />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}