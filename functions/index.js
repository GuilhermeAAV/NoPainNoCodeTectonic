import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldPath, FieldValue, getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/https'
import { setGlobalOptions } from 'firebase-functions/options'
import { defineString } from 'firebase-functions/params'

initializeApp()
// invoker public : l'appel HTTP est ouvert, l'autorisation est vérifiée dans chaque fonction via le token Firebase
setGlobalOptions({ region: 'europe-west1', maxInstances: 5, invoker: 'public' })

const auth = getAuth()
const db = getFirestore()
const bootstrapToken = defineString('BOOTSTRAP_TOKEN')

const MIN_PASSWORD_LENGTH = 8
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseProfile(data) {
  const firstName = String(data?.firstName ?? '').trim()
  const lastName = String(data?.lastName ?? '').trim()
  const email = String(data?.email ?? '').trim().toLowerCase()
  const password = String(data?.password ?? '')
  const clearance = Number(data?.clearance)

  if (!firstName || !lastName) throw new HttpsError('invalid-argument', 'First name and last name are required.')
  if (!EMAIL_RE.test(email)) throw new HttpsError('invalid-argument', 'Enter a valid email address.')
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new HttpsError('invalid-argument', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  if (!Number.isInteger(clearance) || clearance < 0 || clearance > 100)
    throw new HttpsError('invalid-argument', 'Clearance level must be a whole number between 0 and 100.')

  return { firstName, lastName, email, password, clearance }
}

// Crée le compte Auth, pose les claims (rôle + accréditation, lus par les Security Rules) et écrit le profil
async function createAccount({ password, ...profile }, role) {
  let user
  try {
    user = await auth.createUser({
      email: profile.email,
      password,
      displayName: `${profile.firstName} ${profile.lastName}`,
    })
  } catch (err) {
    if (err.code === 'auth/email-already-exists')
      throw new HttpsError('already-exists', 'A profile with this email address already exists.')
    throw err
  }

  await auth.setCustomUserClaims(user.uid, { role, clearance: profile.clearance })
  const doc = { ...profile, role, createdAt: FieldValue.serverTimestamp() }
  await db.doc(`profiles/${user.uid}`).set(doc)
  await db.doc(`expertise/${user.uid}`).set(expertiseIdentity({ ...profile, role }))
  return { id: user.uid, ...profile, role }
}

function assertAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign-in required.')
  if (request.auth.token.role !== 'admin') throw new HttpsError('permission-denied', 'Admins only.')
}

export const createProfile = onCall(async (request) => {
  assertAdmin(request)
  return createAccount(parseProfile(request.data), 'user')
})

export const deleteProfile = onCall(async (request) => {
  assertAdmin(request)
  const id = String(request.data?.id ?? '')
  if (!id) throw new HttpsError('invalid-argument', 'Missing ID.')

  const snap = await db.doc(`profiles/${id}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Profile not found.')
  if (snap.get('role') === 'admin') throw new HttpsError('permission-denied', 'The admin account cannot be deleted.')

  await auth.deleteUser(id).catch((err) => {
    if (err.code !== 'auth/user-not-found') throw err
  })
  await snap.ref.delete()
  await db.doc(`expertise/${id}`).delete()
  return { ok: true }
})

// Création du tout premier admin : exige le jeton de functions/.env et ne fonctionne qu'une seule fois
export const bootstrapAdmin = onCall(async (request) => {
  if (!bootstrapToken.value() || request.data?.token !== bootstrapToken.value())
    throw new HttpsError('permission-denied', 'Invalid token. Check BOOTSTRAP_TOKEN in functions/.env.')

  const lock = db.doc('config/bootstrap')
  await db.runTransaction(async (tx) => {
    if ((await tx.get(lock)).exists) throw new HttpsError('failed-precondition', 'An admin already exists.')
    tx.set(lock, { createdAt: FieldValue.serverTimestamp() })
  })

  return createAccount(parseProfile({ ...request.data, clearance: 100 }), 'admin')
})

// ---------------------------------------------------------------------------
// Recherche par mots-clés sur les métadonnées
// ---------------------------------------------------------------------------

const MAX_QUERY_LENGTH = 500
const MAX_CANDIDATES = 300
const MAX_RESULTS = 10

/** Score minimum accessible = 100 - accréditation (miroir de firestore.rules) */
const minScoreFor = (token) => (token.role === 'admin' ? 0 : Math.max(0, 100 - Number(token.clearance ?? 0)))

// Mots trop courants pour être discriminants
const STOPWORDS = new Set(
  ('le la les l un une des de du d et ou en au aux a à ce cet cette ces mon ma mes ton ta tes son sa ses notre nos votre vos ' +
    'leur leurs je tu il elle on nous vous ils elles me te se y ne pas plus que qui quoi quel quelle quels quelles dont où ' +
    'est sont être avoir ai as avons avez ont fait faire faut pour par sur sous dans avec sans chez entre vers comment ' +
    'pourquoi quand combien si mais donc car the a an of to and or for in on with how what ' +
    'is are was were be been do does did can should my your our their it its this that these those who which when where why').split(' '),
)

/** Minuscules, sans accents, sans ponctuation, sans mots vides ; pluriels simples ramenés au singulier */
function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map((w) => (w.length > 3 && /[sx]$/.test(w) ? w.slice(0, -1) : w))
}

// Poids de chaque champ : un mot trouvé dans le titre ou les tags compte plus que dans la description
const FIELD_WEIGHTS = { title: 3, tags: 3, category: 2, description: 1 }
const FIELD_LABELS = { title: 'title', tags: 'tags', category: 'category', description: 'description' }

/** Un mot de la recherche correspond à un mot du document s'il est égal, ou préfixe d'au moins 4 lettres ("prod" → "production") */
const wordMatches = (q, w) => q === w || (q.length >= 4 && w.startsWith(q)) || (w.length >= 4 && q.startsWith(w))

function rankDocument(queryTokens, data) {
  const fields = {
    title: tokenize(data.title),
    tags: tokenize((data.tags ?? []).join(' ')),
    category: tokenize(data.category),
    description: tokenize(data.description),
  }
  let points = 0
  const matchedWords = new Set()
  const matchedFields = new Set()

  for (const q of queryTokens) {
    // Chaque mot de la recherche compte une fois, dans le champ le plus important où il apparaît
    const field = Object.keys(FIELD_WEIGHTS).find((f) => fields[f].some((w) => wordMatches(q, w)))
    if (!field) continue
    points += FIELD_WEIGHTS[field]
    matchedWords.add(q)
    matchedFields.add(field)
  }

  const maxPoints = queryTokens.length * FIELD_WEIGHTS.title
  // Couverture de la recherche (70 %) + qualité des champs touchés (30 %)
  const coverage = matchedWords.size / queryTokens.length
  const relevance = Math.round(100 * (0.7 * coverage + 0.3 * (points / maxPoints)))
  return { relevance, matchedWords: [...matchedWords], matchedFields: [...matchedFields] }
}

/** Associe chaque mot normalisé au mot tel que l'utilisateur l'a tapé, pour l'affichage */
function displayWords(prompt) {
  const words = new Map()
  for (const raw of prompt.split(/\s+/)) {
    const clean = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    for (const token of tokenize(clean)) if (!words.has(token)) words.set(token, clean)
  }
  return words
}

function explain(match, data, words) {
  const where = match.matchedFields.map((f) => FIELD_LABELS[f]).join(', ')
  const matched = match.matchedWords.map((w) => words.get(w) ?? w).join(' ')
  const parts = [`Matches "${matched}" (${where})`]
  const conflicts = data.conflictsWith?.length ?? 0
  if (conflicts) parts.push(`conflicts with ${conflicts} document${conflicts > 1 ? 's' : ''}`)
  if ((data.signals?.contradictions ?? 0) > 0) parts.push(`${data.signals.contradictions} contradiction${data.signals.contradictions > 1 ? 's' : ''} reported`)
  if (data.volatility >= 50) parts.push('highly volatile trust score')
  if (data.reviewRequested) parts.push('expert review requested')
  return parts.join(' · ')
}

export const searchDocuments = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign-in required.')
  const prompt = String(request.data?.query ?? '').trim()
  if (!prompt) throw new HttpsError('invalid-argument', 'Enter a search query.')
  if (prompt.length > MAX_QUERY_LENGTH)
    throw new HttpsError('invalid-argument', `Search is limited to ${MAX_QUERY_LENGTH} characters.`)

  const minScore = minScoreFor(request.auth.token)
  const queryTokens = [...new Set(tokenize(prompt))]
  const words = displayWords(prompt)
  if (queryTokens.length === 0) return { minScore, results: [] }

  // Filtrage par accréditation d'abord : on ne classe que ce que l'utilisateur a le droit de lire
  const snap = await db
    .collection('documents')
    .where('score', '>=', minScore)
    .orderBy('score', 'desc')
    .limit(MAX_CANDIDATES)
    .get()

  const results = snap.docs
    .map((d) => ({ d, data: d.data() }))
    .map(({ d, data }) => ({ d, data, match: rankDocument(queryTokens, data) }))
    .filter(({ match }) => match.matchedWords.length > 0)
    // À pertinence égale, le document le plus fiable passe devant
    .sort((a, b) => b.match.relevance - a.match.relevance || b.data.score - a.data.score)
    .slice(0, MAX_RESULTS)
    .map(({ d, data: x, match }) => ({
      id: d.id,
      relevance: match.relevance,
      reason: explain(match, x, words),
      document: {
        title: x.title,
        description: x.description,
        category: x.category,
        tags: x.tags,
        fileName: x.fileName,
        mimeType: x.mimeType,
        score: x.score,
        delta: x.delta,
        volatility: x.volatility,
        conflictsWith: x.conflictsWith,
        reviewRequested: x.reviewRequested,
        updatedAt: x.updatedAt?.toDate().toISOString(),
      },
    }))

  return { minScore, results }
})

// ---------------------------------------------------------------------------
// Validation et consultation des documents
// ---------------------------------------------------------------------------

/** Paliers d'accréditation (miroir de src/utils/clearance.ts) */
const TIERS = [
  { min: 80, label: 'Expert' },
  { min: 50, label: 'Senior' },
  { min: 20, label: 'Intermediate' },
  { min: 0, label: 'Junior' },
]
const tierLabel = (clearance) => TIERS.find((t) => clearance >= t.min).label

/**
 * Points de confiance apportés par une validation (miroir de src/utils/trust.ts) :
 *   gain = 20 × (accréditation / 100)² × (100 − score) / 100, au moins 1 point
 * Le poids est quadratique : un Expert (100) pèse 4× un Senior (50) et 25× un Confirmé (20).
 * Le facteur (100 − score) rend les derniers points plus durs à gagner.
 */
const MAX_VALIDATION_GAIN = 20
function validationGain(clearance, score) {
  if (score >= 100 || clearance <= 0) return 0
  const weight = (clearance / 100) ** 2
  return Math.min(100 - score, Math.max(1, Math.round(MAX_VALIDATION_GAIN * weight * ((100 - score) / 100))))
}

/** Volatilité 0-100 : 5 × variation absolue moyenne des 10 derniers mouvements (miroir de src/utils/trust.ts) */
const VOLATILITY_WINDOW = 10
function volatilityFrom(deltas) {
  const recent = deltas.slice(0, VOLATILITY_WINDOW)
  if (recent.length === 0) return 0
  return Math.min(100, Math.round((5 * recent.reduce((sum, d) => sum + Math.abs(d), 0)) / recent.length))
}

const deltaPctOf = (previousScore, delta) => (previousScore === 0 ? 0 : Math.round((delta / previousScore) * 1000) / 10)

/** Ligne du journal des mouvements (même forme que scoreEvent() dans src/services/documents.ts) */
function scoreEvent(documentId, previousScore, score, { source, reason, volatility, signals }, token, uid) {
  const delta = score - previousScore
  return {
    documentId,
    score,
    previousScore,
    delta,
    deltaPct: deltaPctOf(previousScore, delta),
    source,
    reason,
    volatility,
    signals,
    actorId: uid,
    actorClearance: clearanceOf(token),
    actorRole: token.role === 'admin' ? 'admin' : 'user',
    visibilityBefore: 100 - previousScore,
    visibilityAfter: 100 - score,
    at: FieldValue.serverTimestamp(),
  }
}

const clearanceOf = (token) => (token.role === 'admin' ? 100 : Math.max(0, Math.min(100, Number(token.clearance ?? 0))))

function documentId(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign-in required.')
  const id = String(request.data?.id ?? '')
  if (!id || id.includes('/')) throw new HttpsError('invalid-argument', 'Missing ID.')
  return id
}

// Un document hors de portée est traité comme inexistant pour ne rien révéler
function assertReadable(snap, token) {
  if (!snap.exists || snap.get('score') < minScoreFor(token)) throw new HttpsError('not-found', 'Document not found.')
}

export const validateDocument = onCall(async (request) => {
  const id = documentId(request)
  const { uid, token } = request.auth
  const clearance = clearanceOf(token)
  const ref = db.doc(`documents/${id}`)
  const validationRef = ref.collection('validations').doc(uid)

  const historyCol = ref.collection('scoreHistory')
  const expertiseRef = db.doc(`expertise/${uid}`)
  const profileRef = db.doc(`profiles/${uid}`)
  const reviewRef = reviewRequestRef(id, uid)

  return db.runTransaction(async (tx) => {
    // Toutes les lectures avant la première écriture (contrainte des transactions Firestore)
    const [snap, existing, recent, expertiseSnap, profileSnap, reviewSnap] = await Promise.all([
      tx.get(ref),
      tx.get(validationRef),
      tx.get(historyCol.orderBy('at', 'desc').limit(VOLATILITY_WINDOW - 1)),
      tx.get(expertiseRef),
      tx.get(profileRef),
      tx.get(reviewRef),
    ])
    assertReadable(snap, token)
    if (snap.get('authorId') === uid)
      throw new HttpsError('failed-precondition', 'You cannot validate your own document.')
    if (existing.exists) throw new HttpsError('already-exists', 'You have already validated this document.')

    const previousScore = snap.get('score')
    const score = previousScore + validationGain(clearance, previousScore)
    const delta = score - previousScore
    const volatility = volatilityFrom([delta, ...recent.docs.map((d) => d.get('delta') ?? 0)])
    const signals = { ...snap.get('signals'), expertValidations: (snap.get('signals.expertValidations') ?? 0) + 1 }
    const reason = `Validated by a ${tierLabel(clearance)} profile (clearance level ${clearance})`

    // Expertise du validateur dans le domaine du document
    const domain = domainOf(snap.data())
    const current = expertiseSnap.get('domains')?.[domain] ?? { points: 0, validations: 0 }
    const points = current.points + domainPoints(clearance)
    const expertise = {
      points,
      validations: current.validations + 1,
      grade: gradeFor(points),
      lastValidatedAt: FieldValue.serverTimestamp(),
    }

    tx.set(validationRef, { clearance, delta, domain, domainPoints: domainPoints(clearance), at: FieldValue.serverTimestamp() })
    tx.update(ref, { score, previousScore, delta, volatility, signals, lastScoredAt: FieldValue.serverTimestamp() })
    tx.set(historyCol.doc(), scoreEvent(id, previousScore, score, { source: 'expert', reason, volatility, signals }, token, uid))
    tx.set(
      expertiseRef,
      {
        ...expertiseIdentity(profileSnap.exists ? profileSnap.data() : { role: token.role, clearance }),
        domains: { [domain]: expertise },
      },
      { merge: true },
    )
    // La validation répond à la demande de revue éventuelle
    const reviewClosed = reviewSnap.exists && OPEN_REVIEW_STATUSES.includes(reviewSnap.get('status'))
    if (reviewClosed)
      tx.update(reviewRef, { status: 'done', validationDelta: delta, updatedAt: FieldValue.serverTimestamp() })
    return {
      reviewClosed,
      score,
      delta,
      domain,
      domainPoints: points - current.points,
      grade: expertise.grade,
      previousGrade: gradeFor(current.points),
    }
  })
})

export const recordDocumentView = onCall(async (request) => {
  const id = documentId(request)
  const ref = db.doc(`documents/${id}`)
  assertReadable(await ref.get(), request.auth.token)
  await ref.update({ 'signals.views': FieldValue.increment(1) })
  return { ok: true }
})

// ---------------------------------------------------------------------------
// Domaines d'expertise et recommandation d'experts
// ---------------------------------------------------------------------------

/** Domaines (miroir de src/utils/expertise.ts et de firestore.rules) */
const DOMAIN_IDS = [
  'cybersecurite',
  'droit-affaires',
  'donnees-personnelles',
  'conformite',
  'finance',
  'fiscalite',
  'rh',
  'infrastructure',
  'developpement',
  'operations',
]

// Documents créés avant l'introduction des domaines : déduit de la catégorie
const CATEGORY_DOMAINS = {
  sécurité: 'cybersecurite',
  security: 'cybersecurite',
  juridique: 'droit-affaires',
  legal: 'droit-affaires',
  finance: 'finance',
  rh: 'rh',
  hr: 'rh',
  devops: 'infrastructure',
  backend: 'developpement',
  support: 'operations',
}

function domainOf(data) {
  if (DOMAIN_IDS.includes(data?.domain)) return data.domain
  return CATEGORY_DOMAINS[String(data?.category ?? '').toLowerCase()] ?? 'operations'
}

/** Notes de F à A selon les points cumulés dans le domaine */
const GRADES = [
  { grade: 'A', min: 150 },
  { grade: 'B', min: 80 },
  { grade: 'C', min: 40 },
  { grade: 'D', min: 20 },
  { grade: 'E', min: 5 },
  { grade: 'F', min: 0 },
]
const gradeFor = (points) => GRADES.find((g) => points >= g.min).grade

/** Points d'expertise par validation : accréditation ÷ 10, au moins 1 (un Expert gagne 10 points) */
const domainPoints = (clearance) => Math.max(1, Math.round(clearance / 10))

/** Champs d'identité de expertise/{uid} : ce que les recommandations affichent, sans adresse mail */
function expertiseIdentity(profile) {
  return {
    firstName: profile.firstName ?? '',
    lastName: profile.lastName ?? '',
    clearance: profile.role === 'admin' ? 100 : Number(profile.clearance ?? 0),
    role: profile.role === 'admin' ? 'admin' : 'user',
    updatedAt: FieldValue.serverTimestamp(),
  }
}

const MAX_RECOMMENDATIONS = 3
// Sous la note D, un profil n'est pas encore recommandable
const MIN_RECOMMENDED_POINTS = GRADES.find((g) => g.grade === 'D').min

/** En dessous de ce score (ou si une révision est demandée), la source est jugée peu fiable */
const LOW_SCORE_THRESHOLD = 70
const isUnreliable = (snap) => snap.get('score') < LOW_SCORE_THRESHOLD || snap.get('reviewRequested') === true

/**
 * Un expert est viable pour relire un document s'il est noté D ou mieux dans son domaine, peut le lire
 * (accréditation ≥ 100 − score) et le valider : ni l'auteur, ni un validateur existant, ni le demandeur.
 */
async function viableExperts(ref, snap, requesterId) {
  const domain = domainOf(snap.data())
  const score = snap.get('score')
  // FieldPath : certains ids de domaine contiennent un tiret
  const field = new FieldPath('domains', domain, 'points')
  const [candidates, validations] = await Promise.all([
    db.collection('expertise').where(field, '>=', MIN_RECOMMENDED_POINTS).orderBy(field, 'desc').limit(50).get(),
    ref.collection('validations').select().get(),
  ])
  const excluded = new Set([requesterId, snap.get('authorId'), ...validations.docs.map((d) => d.id)])

  const experts = candidates.docs
    // Fiches sans compte (anciens experts de démonstration) : impossible de leur adresser une demande
    .filter((d) => !excluded.has(d.id) && d.get('demo') !== true)
    .filter((d) => d.get('role') === 'admin' || score >= 100 - Number(d.get('clearance') ?? 0))
    .map((d) => {
      const x = d.data()
      const stats = x.domains[domain]
      return {
        id: d.id,
        firstName: x.firstName,
        lastName: x.lastName,
        clearance: x.clearance,
        role: x.role,
        points: stats.points,
        validations: stats.validations,
        grade: gradeFor(stats.points),
      }
    })
  return { domain, experts }
}

/** Experts les mieux notés et viables pour le document, avec l'état de la demande de revue déjà envoyée */
export const recommendExperts = onCall(async (request) => {
  const id = documentId(request)
  const ref = db.doc(`documents/${id}`)
  const snap = await ref.get()
  assertReadable(snap, request.auth.token)

  const [{ domain, experts }, requests] = await Promise.all([
    viableExperts(ref, snap, request.auth.uid),
    db.collection('reviewRequests').where('documentId', '==', id).get(),
  ])
  const statusOf = new Map(requests.docs.map((d) => [d.get('expertId'), d.get('status')]))
  return {
    domain,
    unreliable: isUnreliable(snap),
    experts: experts
      .slice(0, MAX_RECOMMENDATIONS)
      .map((e) => ({ ...e, requestStatus: statusOf.get(e.id) ?? null })),
  }
})

// ---------------------------------------------------------------------------
// Demandes de revue : reviewRequests/{documentId}_{expertId}
// ---------------------------------------------------------------------------

// Une demande ouverte bloque un nouvel envoi et se clôt quand l'expert valide le document
const OPEN_REVIEW_STATUSES = ['pending', 'accepted']
const MAX_REVIEW_MESSAGE = 500

const reviewRequestRef = (docId, expertId) => db.doc(`reviewRequests/${docId}_${expertId}`)
const displayName = (p) => `${p?.firstName ?? ''} ${p?.lastName ?? ''}`.trim() || 'Unknown profile'

/** Demande à un expert viable de relire un document peu fiable ; il la retrouve dans sa zone Requests */
export const requestReview = onCall(async (request) => {
  const id = documentId(request)
  const expertId = String(request.data?.expertId ?? '')
  const message = String(request.data?.message ?? '').trim()
  if (!expertId || expertId.includes('/')) throw new HttpsError('invalid-argument', 'Missing expert ID.')
  if (message.length > MAX_REVIEW_MESSAGE)
    throw new HttpsError('invalid-argument', `The message is limited to ${MAX_REVIEW_MESSAGE} characters.`)

  const { uid, token } = request.auth
  const ref = db.doc(`documents/${id}`)
  const snap = await ref.get()
  assertReadable(snap, token)
  if (!isUnreliable(snap))
    throw new HttpsError('failed-precondition', 'This document is reliable enough: no review is needed.')

  const { domain, experts } = await viableExperts(ref, snap, uid)
  const expert = experts.find((e) => e.id === expertId)
  if (!expert) throw new HttpsError('failed-precondition', 'This profile can’t review this document.')

  const requester = await db.doc(`profiles/${uid}`).get()
  const requestRef = reviewRequestRef(id, expertId)
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(requestRef)
    if (existing.exists && OPEN_REVIEW_STATUSES.includes(existing.get('status')))
      throw new HttpsError('already-exists', `${displayName(expert)} already has a review request for this document.`)
    tx.set(requestRef, {
      documentId: id,
      documentTitle: snap.get('title'),
      documentScore: snap.get('score'),
      domain,
      expertId,
      expertName: displayName(expert),
      expertGrade: expert.grade,
      requesterId: uid,
      requesterName: token.role === 'admin' && !requester.exists ? 'Admin' : displayName(requester.data()),
      message,
      status: 'pending',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    tx.update(ref, { reviewRequested: true })
  })
  return { id: requestRef.id, status: 'pending' }
})

/**
 * Réponse à une demande : l'expert l'accepte ou la refuse, le demandeur peut l'annuler.
 * Le passage à « done » se fait uniquement par validateDocument.
 */
const REVIEW_TRANSITIONS = {
  accept: { by: 'expertId', from: ['pending'], to: 'accepted' },
  decline: { by: 'expertId', from: ['pending', 'accepted'], to: 'declined' },
  cancel: { by: 'requesterId', from: ['pending', 'accepted'], to: 'cancelled' },
}

export const respondReviewRequest = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign-in required.')
  const id = String(request.data?.id ?? '')
  const transition = REVIEW_TRANSITIONS[request.data?.action]
  if (!id || id.includes('/')) throw new HttpsError('invalid-argument', 'Missing ID.')
  if (!transition) throw new HttpsError('invalid-argument', 'Unknown action.')

  const ref = db.doc(`reviewRequests/${id}`)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists || snap.get(transition.by) !== request.auth.uid)
      throw new HttpsError('not-found', 'Review request not found.')
    if (!transition.from.includes(snap.get('status')))
      throw new HttpsError('failed-precondition', `This request is already ${snap.get('status')}.`)
    tx.update(ref, { status: transition.to, updatedAt: FieldValue.serverTimestamp() })
    return { status: transition.to }
  })
})

/**
 * Recalcule expertise/{uid} à partir des validations déjà enregistrées (documents validés avant l'introduction
 * des domaines). Les fiches sans profil associé (experts de démonstration) sont laissées telles quelles.
 */
export const rebuildExpertise = onCall(async (request) => {
  assertAdmin(request)
  const [profiles, documents, validations] = await Promise.all([
    db.collection('profiles').get(),
    db.collection('documents').get(),
    db.collectionGroup('validations').get(),
  ])
  const domains = new Map(documents.docs.map((d) => [d.id, domainOf(d.data())]))
  const totals = new Map()

  for (const v of validations.docs) {
    const domain = domains.get(v.ref.parent.parent.id)
    if (!domain) continue
    const uid = v.id
    const byDomain = totals.get(uid) ?? {}
    const stat = (byDomain[domain] ??= { points: 0, validations: 0, lastValidatedAt: null })
    stat.points += v.get('domainPoints') ?? domainPoints(Number(v.get('clearance') ?? 0))
    stat.validations += 1
    const at = v.get('at')
    if (at && (!stat.lastValidatedAt || at.toMillis() > stat.lastValidatedAt.toMillis())) stat.lastValidatedAt = at
    totals.set(uid, byDomain)
  }

  // Expertise de départ posée par scripts/seed-experts.mjs, ajoutée aux validations réelles
  const existing = profiles.empty ? [] : await db.getAll(...profiles.docs.map((p) => db.doc(`expertise/${p.id}`)))
  const baselines = new Map(existing.map((x) => [x.id, x.get('baseline') ?? null]))

  const writer = db.bulkWriter()
  for (const p of profiles.docs) {
    const byDomain = totals.get(p.id) ?? {}
    const baseline = baselines.get(p.id)
    for (const [domain, base] of Object.entries(baseline ?? {})) {
      const stat = (byDomain[domain] ??= { points: 0, validations: 0, lastValidatedAt: null })
      stat.points += base.points ?? 0
      stat.validations += base.validations ?? 0
    }
    for (const stat of Object.values(byDomain)) stat.grade = gradeFor(stat.points)
    writer.set(db.doc(`expertise/${p.id}`), {
      ...expertiseIdentity(p.data()),
      domains: byDomain,
      ...(baseline && { baseline }),
    })
  }
  await writer.close()
  return { profiles: profiles.size, validations: validations.size }
})
