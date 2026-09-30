import { arrayRemove, collection, deleteDoc, doc, getDocs, runTransaction, setDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/services/firebase'
import { createDocument, getDocument, listDocuments, recordScoreChange } from '@/services/documents'
import type { Conflict, Source } from '@/pages/DashboardPage'
import type { KnowledgeClaim, KnowledgeDocument, NewDocument, Profile } from '@/types'
import { domainInfo, type DomainId } from '@/utils/expertise'
import { clearanceNeededFor } from '@/utils/trust'

/*
 * Simulation d'ingestion pour le Trust Radar :
 *   - fichier identique (même SHA-256) : doublon, rien n'est créé
 *   - même sujet, même valeur        : confirmation, le document existant gagne CONFIRMATION_BONUS
 *   - même sujet, valeur différente  : contradiction, le document le plus ancien perd CONTRADICTION_PENALTY,
 *                                      les deux se référencent et un conflit apparaît dans le tableau de bord
 */
export const CONTRADICTION_PENALTY = 15
export const CONFIRMATION_BONUS = 5

/** Tag des documents d'exemple, supprimés par resetSimulation() */
export const EXAMPLE_TAG = 'example'
const SIM_CONFLICT_PREFIX = 'sim-'

const healthRef = doc(db, 'health', 'latest-stats')

export interface ExampleDocument {
  key: string
  /** Scénario auquel l'exemple appartient, pour les regrouper dans l'interface */
  scenario: string
  hint: string
  fileName: string
  body: string
  input: NewDocument
}

const claim = (topic: string, value: string, unit: string, effectiveDate: string, excerpt: string): KnowledgeClaim => ({
  topic,
  value,
  unit,
  effectiveDate,
  excerpt,
})

function example(
  key: string,
  scenario: string,
  hint: string,
  title: string,
  domain: DomainId,
  category: string,
  score: number,
  c: KnowledgeClaim,
): ExampleDocument {
  return {
    key,
    scenario,
    hint,
    fileName: `${key}.txt`,
    body: `${title}\n\nEffective ${c.effectiveDate}\n\n${c.excerpt}\n`,
    input: {
      title,
      description: c.excerpt ?? '',
      category,
      domain,
      tags: [EXAMPLE_TAG, c.topic.toLowerCase()],
      score,
      claims: [c],
    },
  }
}

export const EXAMPLE_DOCUMENTS: ExampleDocument[] = [
  example(
    'hr-manual-2023',
    'Holiday allowance',
    'Old official policy',
    'HR Manual 2023: holiday allowance',
    'rh',
    'HR',
    72,
    claim('Holiday allowance', '20', 'days', '2023-03-01', 'Full-time employees are entitled to 20 days of annual holiday allowance.'),
  ),
  example(
    'hr-manual-2026',
    'Holiday allowance',
    'New version, contradicts 2023',
    'HR Manual 2026: holiday allowance',
    'rh',
    'HR',
    60,
    claim('Holiday allowance', '25', 'days', '2026-02-01', 'Since the 2025 revision, full-time employees are entitled to 25 days of annual holiday allowance.'),
  ),
  example(
    'security-policy-2022',
    'Password rotation',
    'Old security rule',
    'IT Security Policy 2022: passwords',
    'cybersecurite',
    'Security',
    80,
    claim('Password rotation', '90', 'days', '2022-06-01', 'Passwords must be changed every 90 days.'),
  ),
  example(
    'security-policy-2025',
    'Password rotation',
    'New version, contradicts 2022',
    'IT Security Policy 2025: passwords',
    'cybersecurite',
    'Security',
    65,
    claim('Password rotation', '365', 'days', '2025-09-01', 'Following NIST guidance, passwords are only changed every 365 days or after a suspected breach.'),
  ),
  example(
    'expenses-guide',
    'Expense deadline',
    'Reference document',
    'Finance guide: expense claims',
    'finance',
    'Finance',
    55,
    claim('Expense claim deadline', '30', 'days', '2025-01-15', 'Expense claims must be submitted within 30 days of the purchase.'),
  ),
  example(
    'expenses-faq',
    'Expense deadline',
    'Agrees with the guide',
    'Finance FAQ: expense claims',
    'finance',
    'Finance',
    50,
    claim('Expense claim deadline', '30', 'days', '2026-04-10', 'Reminder: submit your expense claims no later than 30 days after the purchase.'),
  ),
]

export const exampleFile = (e: ExampleDocument) => new File([e.body], e.fileName, { type: 'text/plain' })

export type OutcomeKind = 'created' | 'duplicate' | 'confirmation' | 'contradiction'

export interface ScoreImpact {
  id: string
  title: string
  before: number
  after: number
  reason: string
}

export interface IngestOutcome {
  kind: OutcomeKind
  documentId: string
  title: string
  impacts: ScoreImpact[]
  /** Conflit ajouté au tableau de bord (contradiction uniquement) */
  conflictId?: string
}

const topicKey = (topic: string) => topic.trim().toLowerCase().replace(/\s+/g, ' ')
const sameValue = (a: KnowledgeClaim, b: KnowledgeClaim) =>
  a.value.trim().toLowerCase() === b.value.trim().toLowerCase() && a.unit.trim().toLowerCase() === b.unit.trim().toLowerCase()

async function sha256Of(file: File) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

const clampPct = (n: number) => Math.min(100, Math.max(0, Math.round(n)))

/** Met à jour les compteurs du tableau de bord, bornés à 0-100 pour les pourcentages */
async function bumpHealth(change: { score?: number; consistent?: number; conflicts?: number }) {
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(healthRef)
    if (!snap.exists()) return
    const h = snap.data()
    const conflicts = Math.max(0, (h.conflicts ?? 0) + (change.conflicts ?? 0))
    const weekly = [...((h.conflictsWeekly as number[] | undefined) ?? [])]
    if (weekly.length && change.conflicts) weekly[weekly.length - 1] = conflicts
    tx.update(healthRef, {
      score: clampPct((h.score ?? 0) + (change.score ?? 0)),
      scoreDelta: (h.scoreDelta ?? 0) + (change.score ?? 0),
      consistent: clampPct((h.consistent ?? 0) + (change.consistent ?? 0)),
      conflicts,
      conflictsDelta: (h.conflictsDelta ?? 0) + (change.conflicts ?? 0),
      conflictsWeekly: weekly,
      scannedDocs: (h.scannedDocs ?? 0) + 1,
      lastScan: 'Just now',
    })
  })
}

function monthYear(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function ageOf(iso: string) {
  const months = Math.round((Date.now() - new Date(iso).getTime()) / (30.44 * 24 * 3600 * 1000))
  if (!Number.isFinite(months) || months < 1) return 'this month'
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} old`
  const years = Math.round(months / 12)
  return `${years} year${years === 1 ? '' : 's'} old`
}

function toSource(d: Pick<KnowledgeDocument, 'id' | 'title' | 'fileName' | 'score'>, c: KnowledgeClaim, outdated: boolean): Source {
  return {
    id: d.id,
    name: d.title,
    kind: 'pdf',
    location: `Knowledge base / ${d.fileName}`,
    status: outdated ? 'Outdated' : 'Most recent',
    tone: outdated ? 'danger' : 'warn',
    value: c.value,
    unit: c.unit,
    excerpt: c.excerpt || `${c.topic}: ${c.value} ${c.unit}.`,
    highlight: `${c.value} ${c.unit}`,
    updated: monthYear(c.effectiveDate),
    age: ageOf(c.effectiveDate),
    official: !outdated,
    owner: 'Uploaded to the knowledge base',
    confidence: d.score,
  }
}

async function publishConflict(
  domain: DomainId,
  older: { doc: KnowledgeDocument; claim: KnowledgeClaim; scoreAfter: number },
  newer: { doc: KnowledgeDocument; claim: KnowledgeClaim },
) {
  const id = `${SIM_CONFLICT_PREFIX}${Date.now()}`
  const numeric = Number(older.claim.value) - Number(newer.claim.value)
  const difference = Number.isFinite(numeric)
    ? `${Math.abs(numeric)} ${older.claim.unit} apart`
    : `"${older.claim.value}" vs "${newer.claim.value}"`
  const conflict: Conflict = {
    id,
    topic: newer.claim.topic,
    context: domainInfo(domain).label,
    detected: 'Detected just now',
    severity: older.doc.score >= 60 ? 'High' : 'Medium',
    difference,
    flags: [
      `Answers differ (${older.claim.value} vs ${newer.claim.value} ${newer.claim.unit})`,
      `Older source lost ${CONTRADICTION_PENALTY} trust points`,
      'Newer source not yet validated by an expert',
    ],
    verdict: `"${newer.doc.title}" (effective ${monthYear(newer.claim.effectiveDate)}) contradicts "${older.doc.title}" (effective ${monthYear(older.claim.effectiveDate)}). The older document was downgraded from ${older.doc.score} to ${older.scoreAfter}, so it now requires clearance ${clearanceNeededFor(older.scoreAfter)} to be seen. An expert should confirm the newer value before it is shown as settled.`,
    expert: domainInfo(domain).expert,
    sources: [
      toSource({ ...older.doc, score: older.scoreAfter }, older.claim, true),
      toSource(newer.doc, newer.claim, false),
    ],
  }
  await setDoc(doc(db, 'conflicts', id), conflict)
  return id
}

/**
 * Ajoute un document à la base puis le compare à l'existant.
 * `contradicts` force une contradiction avec un document choisi à la main (sans fait comparable).
 */
export async function ingestDocument(
  profile: Profile,
  file: File,
  input: NewDocument,
  contradicts?: string,
): Promise<IngestOutcome> {
  const existing = await listDocuments(profile)
  const sha = await sha256Of(file)
  const duplicate = existing.find((d) => d.sha256 === sha)
  if (duplicate) return { kind: 'duplicate', documentId: duplicate.id, title: duplicate.title, impacts: [] }

  const id = await createDocument(file, input)
  const created = (await getDocument(id))!
  const newClaims = input.claims ?? []
  const impacts: ScoreImpact[] = []

  // Paires (document existant, fait existant, fait nouveau) portant sur le même sujet
  const matches = existing.flatMap((d) =>
    (d.claims ?? []).flatMap((c) =>
      newClaims.filter((n) => topicKey(n.topic) === topicKey(c.topic)).map((n) => ({ doc: d, old: c, neu: n })),
    ),
  )

  const conflicting = matches.filter((m) => !sameValue(m.old, m.neu))
  const manual = contradicts ? existing.find((d) => d.id === contradicts) : undefined
  if (manual && !conflicting.some((m) => m.doc.id === manual.id)) {
    const fallback: KnowledgeClaim = {
      topic: input.title,
      value: '—',
      unit: '',
      effectiveDate: manual.updatedAt.slice(0, 10),
      excerpt: manual.description,
    }
    conflicting.push({
      doc: manual,
      old: manual.claims?.[0] ?? fallback,
      neu: newClaims[0] ?? { ...fallback, value: 'new version', effectiveDate: new Date().toISOString().slice(0, 10), excerpt: input.description },
    })
  }

  if (conflicting.length > 0) {
    let conflictId: string | undefined
    for (const m of conflicting) {
      // La source la plus ancienne (date d'effet) perd des points ; le nouveau document garde son score
      const newIsOlder = m.neu.effectiveDate < m.old.effectiveDate
      const older = newIsOlder ? { doc: created, claim: m.neu } : { doc: m.doc, claim: m.old }
      const newer = newIsOlder ? { doc: m.doc, claim: m.old } : { doc: created, claim: m.neu }
      const after = Math.max(0, older.doc.score - CONTRADICTION_PENALTY)
      const reason = `Contradicted by "${newer.doc.title}" on ${m.neu.topic} (${newer.claim.value} ${newer.claim.unit} vs ${older.claim.value} ${older.claim.unit})`

      await recordScoreChange(older.doc.id, after, 'contradiction', reason.slice(0, 300), {
        signal: 'contradictions',
        conflictWith: newer.doc.id,
      })
      await recordScoreChange(newer.doc.id, newer.doc.score, 'contradiction', `Contradicts "${older.doc.title}"`.slice(0, 300), {
        signal: 'contradictions',
        conflictWith: older.doc.id,
      })
      impacts.push({ id: older.doc.id, title: older.doc.title, before: older.doc.score, after, reason })
      conflictId = await publishConflict(input.domain, { ...older, scoreAfter: after }, newer)
    }
    await bumpHealth({ score: -3 * conflicting.length, consistent: -2 * conflicting.length, conflicts: conflicting.length })
    return { kind: 'contradiction', documentId: id, title: created.title, impacts, conflictId }
  }

  const confirming = matches.filter((m) => sameValue(m.old, m.neu))
  if (confirming.length > 0) {
    for (const m of confirming) {
      const after = Math.min(100, m.doc.score + CONFIRMATION_BONUS)
      const reason = `Confirmed by "${created.title}" on ${m.neu.topic} (${m.neu.value} ${m.neu.unit})`
      await recordScoreChange(m.doc.id, after, 'consistency', reason.slice(0, 300), { signal: 'confirmations' })
      impacts.push({ id: m.doc.id, title: m.doc.title, before: m.doc.score, after, reason })
    }
    await bumpHealth({ score: 1, consistent: 1 })
    return { kind: 'confirmation', documentId: id, title: created.title, impacts }
  }

  await bumpHealth({})
  return { kind: 'created', documentId: id, title: created.title, impacts }
}

/** Supprime les documents d'exemple et les conflits simulés (l'historique des scores reste, il est append-only) */
export async function resetSimulation(profile: Profile) {
  const all = await listDocuments(profile)
  const examples = all.filter((d) => d.tags.includes(EXAMPLE_TAG))
  const ids = new Set(examples.map((d) => d.id))

  await Promise.all(
    all
      .filter((d) => !ids.has(d.id) && d.conflictsWith.some((c) => ids.has(c)))
      .map((d) => updateDoc(doc(db, 'documents', d.id), { conflictsWith: arrayRemove(...[...ids]) })),
  )
  for (const d of examples) {
    await deleteDoc(doc(db, 'documents', d.id, 'content', 'file'))
    await deleteDoc(doc(db, 'documents', d.id))
  }

  const conflicts = await getDocs(collection(db, 'conflicts'))
  await Promise.all(conflicts.docs.filter((c) => c.id.startsWith(SIM_CONFLICT_PREFIX)).map((c) => deleteDoc(c.ref)))
  return examples.length
}
