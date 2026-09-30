// Insère des documents de démonstration (métadonnées + contenu base64 + historique).
// Relançable : un document déjà présent (même nom de fichier, ex. aml.md) est ignoré.
// Usage : npm run seed -- <email admin> <mot de passe>
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { Timestamp, collection, doc, getDocs, getFirestore, query, serverTimestamp, where, writeBatch } from 'firebase/firestore'

const [email, password] = process.argv.slice(2)
if (!email || !password) {
  console.error('Usage: npm run seed -- <admin email> <password>')
  process.exit(1)
}

const { projects } = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'))
process.loadEnvFile(new URL('../.env', import.meta.url))
const app = initializeApp({ apiKey: process.env.VITE_FIREBASE_API_KEY, projectId: projects.default })
const auth = getAuth(app)
const db = getFirestore(app)
await signInWithEmailAndPassword(auth, email, password)

// [clé, titre, description, catégorie, tags, score, delta, volatilité, signaux, conflits (clés), révision demandée]
const seed = [
  ['deploy', 'Production deployment procedure', 'Steps to ship a new release: code freeze, tests, progressive rollout, rollback.', 'DevOps', ['deployment', 'production', 'ci/cd', 'rollback'], 92, 3, 8, [6, 41, 320, 5, 0], [], false],
  ['deployOld', 'Release to production guide (2021)', 'Former manual release procedure using FTP and shell scripts.', 'DevOps', ['deployment', 'production', 'legacy'], 34, -12, 61, [0, 3, 890, 0, 4], ['deploy'], true],
  ['incident', 'Critical incident management', 'Who to notify, severity levels, customer communication and post-mortem.', 'Support', ['incident', 'on-call', 'post-mortem', 'severity'], 88, 6, 12, [4, 27, 410, 3, 0], [], false],
  ['onboarding', 'Developer onboarding', 'Access, workstation setup, coding conventions and first tickets.', 'HR', ['onboarding', 'new hire', 'workstation'], 95, 1, 4, [8, 62, 530, 6, 0], [], false],
  ['api', 'REST API design conventions', 'Resource naming, versioning, pagination, error codes.', 'Backend', ['api', 'rest', 'versioning', 'pagination'], 81, 4, 15, [3, 19, 205, 4, 1], [], false],
  ['graphql', 'GraphQL migration: scoping note', 'Proposal to replace the REST API with GraphQL, still under discussion.', 'Backend', ['api', 'graphql', 'architecture'], 52, 9, 48, [1, 2, 140, 1, 2], ['api'], false],
  ['rgpd', 'Personal data processing (GDPR)', 'Retention periods, right to be forgotten, record of processing activities.', 'Legal', ['gdpr', 'personal data', 'compliance'], 90, 0, 6, [5, 14, 260, 4, 0], [], false],
  ['password', 'Password policy', 'Minimum length, password manager, two-factor authentication.', 'Security', ['security', 'password', '2fa'], 86, -2, 10, [4, 22, 310, 3, 0], [], false],
  ['passwordOld', 'Password rotation every 30 days', 'Former rule requiring a monthly change, contradicted by current guidance.', 'Security', ['security', 'password'], 28, -18, 70, [0, 1, 640, 0, 5], ['password'], true],
  ['db', 'Database backup and restore', 'Backup frequency, restore tests, retention.', 'DevOps', ['database', 'backup', 'restore', 'postgresql'], 77, -4, 22, [2, 9, 150, 2, 1], [], false],
  ['expenses', 'Expense reports', 'Spending limits, accepted receipts and reimbursement timelines.', 'Finance', ['expense reports', 'reimbursement', 'travel'], 83, 2, 9, [3, 48, 720, 2, 0], [], false],
  ['k8s', 'Lessons learned: Kubernetes autoscaling', 'Unvalidated internal tests on tuning pod autoscaling.', 'DevOps', ['kubernetes', 'autoscaling', 'performance'], 45, 14, 58, [1, 4, 95, 1, 1], [], false],
  ['phishing', 'Phishing incident response playbook', 'Draft playbook: isolating mailboxes, resetting credentials, notifying the CERT.', 'Security', ['phishing', 'incident', 'email', 'cert'], 38, -6, 52, [0, 2, 210, 0, 2], [], true],
  ['contracts', 'Supplier contract standard clauses', 'Liability caps, termination, intellectual property and governing law.', 'Legal', ['contract', 'supplier', 'liability', 'intellectual property'], 55, 5, 30, [1, 6, 180, 1, 1], [], false],
  ['vat', 'VAT on cross-border services', 'Reverse charge, place of supply and invoicing mentions for EU clients.', 'Finance', ['vat', 'tax', 'invoicing', 'eu'], 61, -3, 26, [1, 8, 240, 1, 1], [], false],
  ['aml', 'Anti-money laundering checks (KYC)', 'Customer due diligence, risk scoring and escalation to compliance.', 'Legal', ['aml', 'kyc', 'compliance', 'risk'], 47, 8, 41, [1, 3, 130, 1, 2], [], true],
]

// Domaine d'expertise de chaque document (voir src/utils/expertise.ts)
const DOMAINS = {
  deploy: 'infrastructure', deployOld: 'infrastructure', db: 'infrastructure', k8s: 'infrastructure',
  incident: 'operations', onboarding: 'rh', api: 'developpement', graphql: 'developpement',
  rgpd: 'donnees-personnelles', password: 'cybersecurite', passwordOld: 'cybersecurite', phishing: 'cybersecurite',
  expenses: 'finance', contracts: 'droit-affaires', vat: 'fiscalite', aml: 'conformite',
}

// PRNG déterministe : relancer le script produit les mêmes historiques
let seedState = 42
const rand = () => {
  seedState = (seedState + 0x6d2b79f5) | 0
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (min, max) => min + Math.floor(rand() * (max - min + 1))
const clampScore = (n) => Math.max(0, Math.min(100, n))
const tierLabel = (c) => (c >= 80 ? 'Expert' : c >= 50 ? 'Senior' : c >= 20 ? 'Intermediate' : 'Junior')
const volatilityFrom = (deltas) =>
  deltas.length ? Math.min(100, Math.round((5 * deltas.reduce((sum, d) => sum + Math.abs(d), 0)) / deltas.length)) : 0

// Mouvements types : [source, variation min, max, raison, poids selon les signaux du document]
const MOVES = [
  ['expert', 3, 12, null, (s) => s.ev + 1],
  ['usage', 1, 3, 'Successful use reported', (s) => s.su / 4 + 1],
  ['consistency', 2, 6, 'Confirmed by a matching source', (s) => s.conf + 1],
  ['contradiction', -15, -5, 'Contradiction found with another source', (s) => s.contra * 3],
  ['freshness', -4, -1, 'No update in 90 days', () => 2],
]

/**
 * Historique synthétique qui aboutit exactement au score actuel : on remonte le temps depuis le score final
 * en tirant des mouvements pondérés par les signaux du document, puis on remet dans l'ordre chronologique.
 */
function makeHistory(score, lastDelta, signals, days = 120) {
  const count = between(14, 36)
  const moves = []
  let s = score
  for (let i = 0; i < count; i++) {
    let source, delta, reason, actorClearance = null
    if (i === 0) {
      source = lastDelta > 0 ? 'expert' : lastDelta < 0 ? 'contradiction' : 'consistency'
      delta = lastDelta
      reason = MOVES.find((m) => m[0] === source)[3]
      if (delta === 0) reason = 'Reassessed: trust score confirmed'
    } else {
      const weights = MOVES.map((m) => m[4](signals))
      let r = rand() * weights.reduce((a, b) => a + b, 0)
      const move = MOVES.find((_, k) => (r -= weights[k]) < 0) ?? MOVES[0]
      source = move[0]
      delta = between(move[1], move[2])
      reason = move[3]
    }
    // Pas de score de départ hors bornes : on inverse le mouvement si besoin
    if (s - delta < 5 || s - delta > 100) delta = -delta
    const previousScore = clampScore(s - delta)
    const natural = MOVES.find((m) => m[0] === source)?.[1] ?? 0
    delta = s - previousScore
    // Un mouvement inversé change de nature : c'est une réévaluation manuelle
    if (i > 0 && Math.sign(delta) !== Math.sign(natural)) {
      source = 'manual'
      reason = null
    }
    if (source === 'expert') {
      actorClearance = between(50, 100)
      reason = `Validated by a ${tierLabel(actorClearance)} profile (clearance level ${actorClearance})`
    }
    reason ??= delta >= 0 ? 'Manual reassessment upward' : 'Manual reassessment downward'
    moves.push({ source, delta, previousScore, score: s, reason, actorClearance })
    s = previousScore
  }
  moves.push({ source: 'initial', delta: 0, previousScore: s, score: s, reason: 'Document created', actorClearance: 100 })
  moves.reverse()

  const now = Date.now()
  const times = moves.map(() => now - rand() * days * 86400e3).sort((a, b) => a - b)
  times[0] = now - days * 86400e3
  times[times.length - 1] = now - between(1, 48) * 3600e3
  return moves.map((m, i) => ({
    ...m,
    at: times[i],
    volatility: volatilityFrom(moves.slice(Math.max(1, i - 9), i + 1).map((x) => x.delta)),
    progress: i / (moves.length - 1),
  }))
}

// Documents déjà insérés par un passage précédent : on garde leur id (pour les conflits) sans les réécrire
const existing = await getDocs(query(collection(db, 'documents'), where('score', '>=', 0)))
const existingIds = new Map(existing.docs.map((d) => [d.get('fileName'), d.id]))
const ids = Object.fromEntries(
  seed.map(([key]) => [key, existingIds.get(`${key}.md`) ?? doc(collection(db, 'documents')).id]),
)
let inserted = 0
// Un lot Firestore est limité à 500 écritures
let batch = writeBatch(db)
let pending = 0
const write = async (ref, data) => {
  batch.set(ref, data)
  if (++pending === 450) {
    await batch.commit()
    batch = writeBatch(db)
    pending = 0
  }
}
let eventCount = 0

for (const [key, title, description, category, tags, score, delta, , [ev, su, views, conf, contra], conflicts, review] of seed) {
  if (existingIds.has(`${key}.md`)) continue
  inserted++
  const text = `# ${title}\n\n${description}\n`
  const bytes = Buffer.from(text, 'utf8')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const ref = doc(db, 'documents', ids[key])
  const signals = { expertValidations: ev, successfulUses: su, views, confirmations: conf, contradictions: contra }
  const history = makeHistory(score, delta, { ev, su, conf, contra })
  const createdAt = Timestamp.fromMillis(history[0].at)

  await write(ref, {
    title, description, category, domain: DOMAINS[key], tags,
    fileName: `${key}.md`, mimeType: 'text/markdown', sizeBytes: bytes.length, sha256,
    authorId: auth.currentUser.uid, createdAt, updatedAt: serverTimestamp(), version: 1,
    score, previousScore: score - delta, delta, volatility: history.at(-1).volatility,
    lastScoredAt: Timestamp.fromMillis(history.at(-1).at),
    signals,
    conflictsWith: conflicts.map((k) => ids[k]),
    reviewRequested: review,
  })
  await write(doc(ref, 'content', 'file'), { base64: bytes.toString('base64'), mimeType: 'text/markdown', sha256 })

  for (const e of history) {
    // Signaux approximés au prorata de l'avancement dans l'historique
    const snapshot = Object.fromEntries(Object.entries(signals).map(([k, v]) => [k, Math.round(v * e.progress)]))
    await write(doc(collection(ref, 'scoreHistory')), {
      documentId: ids[key],
      score: e.score,
      previousScore: e.previousScore,
      delta: e.delta,
      deltaPct: e.previousScore === 0 ? 0 : Math.round((e.delta / e.previousScore) * 1000) / 10,
      source: e.source,
      reason: e.reason,
      actorId: e.source === 'initial' ? auth.currentUser.uid : null,
      actorClearance: e.actorClearance,
      actorRole: e.source === 'initial' ? 'admin' : e.actorClearance === null ? null : 'user',
      visibilityBefore: 100 - e.previousScore,
      visibilityAfter: 100 - e.score,
      volatility: e.volatility,
      signals: snapshot,
      at: Timestamp.fromMillis(e.at),
    })
    eventCount++
  }
}

if (pending) await batch.commit()
console.log(`Inserted ${inserted} documents and ${eventCount} trust score events (${seed.length - inserted} already present).`)
process.exit(0)
