// Insère des documents de démonstration (métadonnées + contenu base64 + historique).
// Usage : npm run seed -- <email admin> <mot de passe>
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { Timestamp, collection, doc, getFirestore, serverTimestamp, writeBatch } from 'firebase/firestore'

const [email, password] = process.argv.slice(2)
if (!email || !password) {
  console.error('Usage : npm run seed -- <email admin> <mot de passe>')
  process.exit(1)
}

const { projects } = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'))
const app = initializeApp({ apiKey: 'REMOVED_FIREBASE_API_KEY', projectId: projects.default })
const auth = getAuth(app)
const db = getFirestore(app)
await signInWithEmailAndPassword(auth, email, password)

// [clé, titre, description, catégorie, tags, score, delta, volatilité, signaux, conflits (clés), révision demandée]
const seed = [
  ['deploy', 'Procédure de déploiement en production', 'Étapes pour déployer une nouvelle version : gel du code, tests, déploiement progressif, rollback.', 'DevOps', ['déploiement', 'production', 'ci/cd', 'rollback'], 92, 3, 8, [6, 41, 320, 5, 0], [], false],
  ['deployOld', 'Guide de mise en production (2021)', 'Ancienne procédure de mise en production manuelle via FTP et scripts shell.', 'DevOps', ['déploiement', 'production', 'legacy'], 34, -12, 61, [0, 3, 890, 0, 4], ['deploy'], true],
  ['incident', 'Gestion des incidents critiques', 'Qui prévenir, niveaux de sévérité, communication client et post-mortem.', 'Support', ['incident', 'astreinte', 'post-mortem', 'sévérité'], 88, 6, 12, [4, 27, 410, 3, 0], [], false],
  ['onboarding', 'Onboarding développeur', 'Accès, installation du poste, conventions de code et premiers tickets.', 'RH', ['onboarding', 'nouvel arrivant', 'poste de travail'], 95, 1, 4, [8, 62, 530, 6, 0], [], false],
  ['api', 'Conventions de conception d’API REST', 'Nommage des ressources, versioning, pagination, codes d’erreur.', 'Backend', ['api', 'rest', 'versioning', 'pagination'], 81, 4, 15, [3, 19, 205, 4, 1], [], false],
  ['graphql', 'Migration vers GraphQL : note de cadrage', 'Proposition de remplacer l’API REST par GraphQL, encore en discussion.', 'Backend', ['api', 'graphql', 'architecture'], 52, 9, 48, [1, 2, 140, 1, 2], ['api'], false],
  ['rgpd', 'Traitement des données personnelles (RGPD)', 'Durées de conservation, droit à l’oubli, registre des traitements.', 'Juridique', ['rgpd', 'données personnelles', 'conformité'], 90, 0, 6, [5, 14, 260, 4, 0], [], false],
  ['password', 'Politique de mots de passe', 'Longueur minimale, gestionnaire de mots de passe, double authentification.', 'Sécurité', ['sécurité', 'mot de passe', '2fa'], 86, -2, 10, [4, 22, 310, 3, 0], [], false],
  ['passwordOld', 'Rotation des mots de passe tous les 30 jours', 'Ancienne règle imposant un changement mensuel, contredite par les recommandations actuelles.', 'Sécurité', ['sécurité', 'mot de passe'], 28, -18, 70, [0, 1, 640, 0, 5], ['password'], true],
  ['db', 'Sauvegarde et restauration de la base de données', 'Fréquence des sauvegardes, tests de restauration, rétention.', 'DevOps', ['base de données', 'sauvegarde', 'restauration', 'postgresql'], 77, -4, 22, [2, 9, 150, 2, 1], [], false],
  ['expenses', 'Notes de frais', 'Plafonds, justificatifs acceptés et délais de remboursement.', 'Finance', ['notes de frais', 'remboursement', 'déplacement'], 83, 2, 9, [3, 48, 720, 2, 0], [], false],
  ['k8s', 'Retour d’expérience : autoscaling Kubernetes', 'Tests internes non validés sur le réglage de l’autoscaling des pods.', 'DevOps', ['kubernetes', 'autoscaling', 'performance'], 45, 14, 58, [1, 4, 95, 1, 1], [], false],
]

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
const tierLabel = (c) => (c >= 80 ? 'Expert' : c >= 50 ? 'Senior' : c >= 20 ? 'Confirmé' : 'Junior')
const volatilityFrom = (deltas) =>
  deltas.length ? Math.min(100, Math.round((5 * deltas.reduce((sum, d) => sum + Math.abs(d), 0)) / deltas.length)) : 0

// Mouvements types : [source, variation min, max, raison, poids selon les signaux du document]
const MOVES = [
  ['expert', 3, 12, null, (s) => s.ev + 1],
  ['usage', 1, 3, 'Utilisation réussie signalée', (s) => s.su / 4 + 1],
  ['consistency', 2, 6, 'Confirmé par une source concordante', (s) => s.conf + 1],
  ['contradiction', -15, -5, 'Contradiction détectée avec une autre source', (s) => s.contra * 3],
  ['freshness', -4, -1, 'Aucune mise à jour depuis 90 jours', () => 2],
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
      if (delta === 0) reason = 'Réévaluation : score confirmé'
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
      reason = `Validé par un profil ${tierLabel(actorClearance)} (niveau ${actorClearance})`
    }
    reason ??= delta >= 0 ? 'Réévaluation manuelle à la hausse' : 'Réévaluation manuelle à la baisse'
    moves.push({ source, delta, previousScore, score: s, reason, actorClearance })
    s = previousScore
  }
  moves.push({ source: 'initial', delta: 0, previousScore: s, score: s, reason: 'Création du document', actorClearance: 100 })
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

const ids = Object.fromEntries(seed.map(([key]) => [key, doc(collection(db, 'documents')).id]))
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
  const text = `# ${title}\n\n${description}\n`
  const bytes = Buffer.from(text, 'utf8')
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const ref = doc(db, 'documents', ids[key])
  const signals = { expertValidations: ev, successfulUses: su, views, confirmations: conf, contradictions: contra }
  const history = makeHistory(score, delta, { ev, su, conf, contra })
  const createdAt = Timestamp.fromMillis(history[0].at)

  await write(ref, {
    title, description, category, tags,
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
console.log(`${seed.length} documents et ${eventCount} mouvements de score insérés.`)
process.exit(0)
