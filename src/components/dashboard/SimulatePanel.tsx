import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Copy,
  FilePlus2,
  FlaskConical,
  Loader2,
  RotateCcw,
  ShieldAlert,
  ThumbsUp,
  Upload,
  X,
} from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { MAX_FILE_BYTES, listDocuments } from '@/services/documents'
import {
  CONFIRMATION_BONUS,
  CONTRADICTION_PENALTY,
  EXAMPLE_DOCUMENTS,
  EXAMPLE_TAG,
  exampleFile,
  ingestDocument,
  resetSimulation,
  type IngestOutcome,
} from '@/services/simulation'
import type { KnowledgeDocument } from '@/types'
import { DOMAINS, type DomainId } from '@/utils/expertise'
import { clearanceNeededFor } from '@/utils/trust'

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D3077F]'
const INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#D3077F] focus:outline-none focus:ring-2 focus:ring-[#D3077F]/20'
const LABEL = 'mb-1 block text-xs font-semibold text-slate-600'

const OUTCOME = {
  created: { icon: FilePlus2, cls: 'border-slate-200 bg-white', title: 'Added, no overlap with existing documents' },
  duplicate: { icon: Copy, cls: 'border-slate-200 bg-slate-50', title: 'Identical file already in the knowledge base, nothing added' },
  confirmation: { icon: ThumbsUp, cls: 'border-emerald-200 bg-emerald-50', title: 'Confirms an existing document' },
  contradiction: { icon: ShieldAlert, cls: 'border-rose-200 bg-rose-50', title: 'Contradiction detected' },
} as const

const scenarios = [...new Set(EXAMPLE_DOCUMENTS.map((e) => e.scenario))]

const today = () => new Date().toISOString().slice(0, 10)

const emptyForm = {
  title: '',
  description: '',
  domain: 'rh' as DomainId,
  tags: '',
  score: 50,
  topic: '',
  value: '',
  unit: '',
  effectiveDate: today(),
  contradicts: '',
}

export default function SimulatePanel({ onClose, onConflict }: { onClose: () => void; onConflict: (id: string) => void }) {
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [tab, setTab] = useState<'examples' | 'upload'>('examples')
  const [docs, setDocs] = useState<KnowledgeDocument[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [log, setLog] = useState<IngestOutcome[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState(emptyForm)

  const refresh = useCallback(async () => {
    if (isAdmin && user) setDocs(await listDocuments(user).catch(() => []))
  }, [isAdmin, user])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const run = async (key: string, task: () => Promise<IngestOutcome>) => {
    setBusy(key)
    setError(null)
    try {
      const outcome = await task()
      setLog((l) => [outcome, ...l])
      if (outcome.conflictId) onConflict(outcome.conflictId)
      await refresh()
      return outcome
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const addExample = (key: string) => {
    const e = EXAMPLE_DOCUMENTS.find((x) => x.key === key)!
    run(key, () => ingestDocument(user!, exampleFile(e), e.input))
  }

  const submitUpload = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) return
    const hasClaim = form.topic.trim() && form.value.trim()
    const outcome = await run('upload', () =>
      ingestDocument(
        user!,
        file,
        {
          title: form.title.trim() || file.name,
          description: form.description,
          category: DOMAINS.find((d) => d.id === form.domain)!.label,
          domain: form.domain,
          tags: form.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
          score: form.score,
          claims: hasClaim
            ? [
                {
                  topic: form.topic.trim(),
                  value: form.value.trim(),
                  unit: form.unit.trim(),
                  effectiveDate: form.effectiveDate || today(),
                  excerpt: form.description.trim() || undefined,
                },
              ]
            : [],
        },
        form.contradicts || undefined,
      ),
    )
    if (outcome) {
      setFile(null)
      setForm(emptyForm)
    }
  }

  const reset = async () => {
    setBusy('reset')
    setError(null)
    try {
      await resetSimulation(user!)
      setLog([])
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.')
    } finally {
      setBusy(null)
    }
  }

  const byTitle = (title: string) => docs.find((d) => d.title === title && d.tags.includes(EXAMPLE_TAG))
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#2B0B45]/40 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sim-title"
        className="tr-pop w-full max-w-3xl overflow-hidden rounded-3xl bg-white shadow-[0_40px_80px_-30px_rgba(43,11,69,0.6)]"
      >
        {/* Header */}
        <div className="relative overflow-hidden bg-[#2B0B45] px-6 py-5 text-white">
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(90% 140% at 100% 0%, rgba(211,7,127,0.55), transparent 60%)' }}
          />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                <FlaskConical className="size-5 text-[#FF8AD1]" />
              </div>
              <div>
                <h2 id="sim-title" className="tr-display m-0 text-xl font-bold">
                  Simulate document ingestion
                </h2>
                <p className="m-0 mt-0.5 text-xs text-white/70">
                  Contradiction: the older source loses {CONTRADICTION_PENALTY} points. Confirmation: +{CONFIRMATION_BONUS}.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white ${FOCUS}`}
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {!isAdmin ? (
          <div className="p-8 text-center text-sm text-slate-600">
            Adding documents requires an admin account.{' '}
            <Link to="/login" className="font-semibold text-[#D3077F]">
              Sign in
            </Link>
          </div>
        ) : (
          <div className="p-6">
            <div role="tablist" className="mb-5 flex gap-1 rounded-2xl bg-slate-100 p-1">
              {(
                [
                  ['examples', 'Example documents', FlaskConical],
                  ['upload', 'Upload a real file', Upload],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-all ${FOCUS} ${
                    tab === id ? 'bg-white text-[#2B0B45] shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>

            {tab === 'examples' ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-500">
                  Add the first document of a scenario, then the second one. Adding the same example twice shows
                  duplicate detection.
                </p>
                {scenarios.map((s) => (
                  <div key={s} className="rounded-2xl border border-slate-200 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">{s}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {EXAMPLE_DOCUMENTS.filter((e) => e.scenario === s).map((e, i) => {
                        const inKb = byTitle(e.input.title)
                        const c = e.input.claims![0]
                        return (
                          <div key={e.key} className="flex flex-col rounded-xl bg-slate-50 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {i + 1}. {e.input.title}
                              </p>
                              {inKb && (
                                <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-[#2B0B45] ring-1 ring-slate-200">
                                  {inKb.score}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {e.hint} · {c.value} {c.unit} · effective {c.effectiveDate}
                            </p>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => addExample(e.key)}
                              className={`mt-3 inline-flex items-center justify-center gap-1.5 self-start rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS} ${
                                inKb
                                  ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                                  : 'border-[#D3077F]/30 bg-[#FDF2F8] text-[#B90670] hover:bg-[#FBE3F1]'
                              }`}
                            >
                              {busy === e.key ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : inKb ? (
                                <Copy className="size-3.5" />
                              ) : (
                                <FilePlus2 className="size-3.5" />
                              )}
                              {inKb ? 'Add again' : 'Add to knowledge base'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <form onSubmit={submitUpload} className="space-y-4">
                <label
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                    file ? 'border-[#D3077F]/40 bg-[#FDF2F8]' : 'border-slate-200 hover:border-[#D3077F]/40'
                  }`}
                >
                  <Upload className="size-6 text-[#D3077F]" />
                  <span className="mt-2 text-sm font-semibold text-slate-800">
                    {file ? file.name : 'Choose a file'}
                  </span>
                  <span className="text-xs text-slate-500">Up to {Math.round(MAX_FILE_BYTES / 1024)} KB</span>
                  <input
                    type="file"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null
                      setFile(f)
                      if (f && !form.title) set('title', f.name.replace(/\.[^.]+$/, ''))
                    }}
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={LABEL} htmlFor="sim-t">Title</label>
                    <input id="sim-t" className={INPUT} value={form.title} onChange={(e) => set('title', e.target.value)} required />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={LABEL} htmlFor="sim-d">Description</label>
                    <textarea
                      id="sim-d"
                      rows={2}
                      className={INPUT}
                      value={form.description}
                      onChange={(e) => set('description', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="sim-dom">Domain</label>
                    <select id="sim-dom" className={INPUT} value={form.domain} onChange={(e) => set('domain', e.target.value as DomainId)}>
                      {DOMAINS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={LABEL} htmlFor="sim-tags">Tags (comma separated)</label>
                    <input id="sim-tags" className={INPUT} value={form.tags} onChange={(e) => set('tags', e.target.value)} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={LABEL} htmlFor="sim-score">
                      Initial trust score: {form.score} (visible from clearance {clearanceNeededFor(form.score)})
                    </label>
                    <input
                      id="sim-score"
                      type="range"
                      min={0}
                      max={100}
                      value={form.score}
                      onChange={(e) => set('score', Number(e.target.value))}
                      className="w-full accent-[#D3077F]"
                    />
                  </div>
                </div>

                <fieldset className="rounded-2xl border border-slate-200 p-4">
                  <legend className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Key fact (optional, used to detect contradictions)
                  </legend>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="sm:col-span-2">
                      <label className={LABEL} htmlFor="sim-topic">Topic</label>
                      <input id="sim-topic" className={INPUT} placeholder="Holiday allowance" value={form.topic} onChange={(e) => set('topic', e.target.value)} />
                    </div>
                    <div>
                      <label className={LABEL} htmlFor="sim-val">Value</label>
                      <input id="sim-val" className={INPUT} placeholder="25" value={form.value} onChange={(e) => set('value', e.target.value)} />
                    </div>
                    <div>
                      <label className={LABEL} htmlFor="sim-unit">Unit</label>
                      <input id="sim-unit" className={INPUT} placeholder="days" value={form.unit} onChange={(e) => set('unit', e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={LABEL} htmlFor="sim-date">Effective date</label>
                      <input id="sim-date" type="date" className={INPUT} value={form.effectiveDate} onChange={(e) => set('effectiveDate', e.target.value)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={LABEL} htmlFor="sim-contra">Or mark as contradicting</label>
                      <select id="sim-contra" className={INPUT} value={form.contradicts} onChange={(e) => set('contradicts', e.target.value)}>
                        <option value="">Detect automatically</option>
                        {docs.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title} ({d.score})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </fieldset>

                <button
                  type="submit"
                  disabled={!file || !!busy}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#D3077F] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(211,7,127,0.8)] transition-all hover:bg-[#B90670] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
                >
                  {busy === 'upload' ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                  Add to knowledge base
                </button>
              </form>
            )}

            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}

            {/* Outcomes */}
            {log.length > 0 && (
              <div className="mt-6 space-y-2" aria-live="polite">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Results</p>
                {log.map((o, i) => {
                  const meta = OUTCOME[o.kind]
                  const Icon = meta.icon
                  return (
                    <div key={`${o.documentId}-${log.length - i}`} className={`tr-pop rounded-2xl border p-4 ${meta.cls}`}>
                      <div className="flex items-start gap-3">
                        <Icon className="mt-0.5 size-4 shrink-0 text-[#2B0B45]" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900">{meta.title}</p>
                          <Link to={`/documents/${o.documentId}`} className="text-xs font-medium text-[#B90670] hover:underline">
                            {o.title}
                          </Link>
                          {o.impacts.map((imp) => (
                            <div key={imp.id} className="mt-2 rounded-xl bg-white/80 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200/70">
                              <div className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                                <span className="truncate">{imp.title}</span>
                                <span className="flex items-center gap-1 tabular-nums">
                                  {imp.before} <ArrowRight className="size-3" /> {imp.after}
                                </span>
                                <span className={imp.after < imp.before ? 'text-rose-600' : 'text-emerald-600'}>
                                  ({imp.after > imp.before ? '+' : ''}
                                  {imp.after - imp.before})
                                </span>
                              </div>
                              <p className="mt-0.5">
                                {imp.reason}. Clearance needed: {clearanceNeededFor(imp.before)} → {clearanceNeededFor(imp.after)}.
                              </p>
                            </div>
                          ))}
                        </div>
                        {o.kind !== 'duplicate' && <Check className="size-4 shrink-0 text-emerald-600" />}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={reset}
                disabled={!!busy}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50 ${FOCUS}`}
              >
                {busy === 'reset' ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
                Remove example documents and simulated conflicts
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
