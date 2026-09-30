import { FirebaseError } from 'firebase/app'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '@/services/firebase'
import type {
  DocumentContent,
  KnowledgeDocument,
  NewDocument,
  Profile,
  Role,
  RecommendedExpert,
  ScoreEvent,
  ScoreSource,
  SearchResult,
  TrustSignals,
} from '@/types'
import { domainOf, type DomainId, type Grade } from '@/utils/expertise'
import { VOLATILITY_WINDOW, clearanceNeededFor, deltaPctOf, volatilityFrom } from '@/utils/trust'

// Un document Firestore fait au plus 1 Mio et le base64 ajoute ~33 % : on plafonne le fichier à 700 Ko
export const MAX_FILE_BYTES = 700 * 1024

const documentsCol = collection(db, 'documents')
const contentRef = (id: string) => doc(db, 'documents', id, 'content', 'file')
const historyCol = (id: string) => collection(db, 'documents', id, 'scoreHistory')
const validationRef = (id: string, uid: string) => doc(db, 'documents', id, 'validations', uid)

// Les Cloud Functions renvoient déjà un message lisible
function toError(err: unknown): Error {
  if (err instanceof FirebaseError && err.code.startsWith('functions/') && err.message !== 'internal')
    return new Error(err.message)
  console.error(err)
  return new Error('Something went wrong. Try again.')
}

async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    return (await httpsCallable<Req, Res>(functions, name)(data)).data
  } catch (err) {
    throw toError(err)
  }
}

/** Score de confiance minimum accessible pour un niveau d'accréditation (miroir de firestore.rules) */
export const minScoreFor = (clearance: number) => Math.min(100, Math.max(0, 100 - clearance))

const clampScore = (n: number) => Math.min(100, Math.max(0, Math.round(n)))
const toIso = (v: { toDate(): Date } | undefined) => v?.toDate().toISOString() ?? new Date().toISOString()

async function readFile(file: File) {
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const sha256 = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')

  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { base64: btoa(binary), sha256 }
}

function toDocument(snap: DocumentSnapshot): KnowledgeDocument {
  const d = snap.data()!
  return {
    ...(d as Omit<KnowledgeDocument, 'id' | 'createdAt' | 'updatedAt' | 'lastScoredAt'>),
    id: snap.id,
    domain: domainOf(d),
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    lastScoredAt: toIso(d.lastScoredAt),
  }
}

/** Crée métadonnées + contenu + premier événement d'historique en une seule écriture atomique */
export async function createDocument(file: File, input: NewDocument): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`The file is larger than ${Math.round(MAX_FILE_BYTES / 1024)} KB. Choose a smaller file.`)
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Sign in to continue.')

  const [{ base64, sha256 }, actor] = await Promise.all([readFile(file), currentActor()])
  const signals: TrustSignals = { expertValidations: 0, successfulUses: 0, views: 0, confirmations: 0, contradictions: 0 }
  const score = clampScore(input.score ?? 50)
  const mimeType = file.type || 'application/octet-stream'
  const ref = doc(documentsCol)

  const batch = writeBatch(db)
  batch.set(ref, {
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
    domain: input.domain,
    tags: input.tags,
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
    sha256,
    authorId: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1,
    score,
    previousScore: score,
    delta: 0,
    volatility: 0,
    lastScoredAt: serverTimestamp(),
    signals,
    conflictsWith: [],
    reviewRequested: false,
  })
  batch.set(contentRef(ref.id), { base64, mimeType, sha256 } satisfies DocumentContent)
  batch.set(
    doc(historyCol(ref.id)),
    scoreEvent(ref.id, score, score, { source: 'initial', reason: 'Document created', volatility: 0, signals }, actor),
  )
  await batch.commit()
  return ref.id
}

/**
 * Liste les métadonnées (sans le contenu) accessibles au profil, triées par score décroissant.
 * Le filtre sur le score est obligatoire : les règles Firestore refusent toute requête plus large.
 */
export async function listDocuments(profile: Profile, minScore = 0): Promise<KnowledgeDocument[]> {
  const floor = profile.role === 'admin' ? minScore : Math.max(minScore, minScoreFor(profile.clearance))
  const snap = await getDocs(query(documentsCol, where('score', '>=', floor), orderBy('score', 'desc')))
  return snap.docs.map(toDocument)
}

export async function getDocument(id: string): Promise<KnowledgeDocument | null> {
  const snap = await getDoc(doc(documentsCol, id))
  return snap.exists() ? toDocument(snap) : null
}

export async function getDocumentContent(id: string): Promise<DocumentContent | null> {
  const snap = await getDoc(contentRef(id))
  return snap.exists() ? (snap.data() as DocumentContent) : null
}

/** URL affichable/téléchargeable à partir du contenu stocké */
export const toDataUrl = (content: DocumentContent) => `data:${content.mimeType};base64,${content.base64}`

/** Télécharge le fichier sous son nom d'origine */
export async function downloadDocument(document: Pick<KnowledgeDocument, 'id' | 'fileName'>) {
  const content = await getDocumentContent(document.id)
  if (!content) throw new Error('File not found.')
  const blob = await (await fetch(toDataUrl(content))).blob()
  const url = URL.createObjectURL(blob)
  const link = Object.assign(window.document.createElement('a'), { href: url, download: document.fileName })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Recherche IA : documents accessibles classés du plus au moins pertinent */
export const searchDocuments = (query: string) =>
  call<{ query: string }, { minScore: number; results: SearchResult[] }>('searchDocuments', { query })

export interface ValidationResult {
  score: number
  delta: number
  domain: DomainId
  /** Points d'expertise gagnés par le validateur dans le domaine du document */
  domainPoints: number
  grade: Grade
  previousGrade: Grade
  /** true si la validation a clos une demande de revue adressée à l'utilisateur */
  reviewClosed: boolean
}

/** Valide le document ; le gain dépend de l'accréditation (voir utils/trust.ts et utils/expertise.ts) */
export const validateDocument = (id: string) => call<{ id: string }, ValidationResult>('validateDocument', { id })

/** Experts les mieux notés dans le domaine du document, capables de le lire et de le valider */
export const recommendExperts = (id: string) =>
  call<{ id: string }, { domain: DomainId; unreliable: boolean; experts: RecommendedExpert[] }>('recommendExperts', { id })

export const recordDocumentView = (id: string) => call<{ id: string }, { ok: boolean }>('recordDocumentView', { id })

export async function hasValidated(id: string): Promise<boolean> {
  const uid = auth.currentUser?.uid
  return uid ? (await getDoc(validationRef(id, uid))).exists() : false
}

/** Accréditation et rôle de l'utilisateur courant, lus dans les claims du token */
async function currentActor() {
  const user = auth.currentUser
  if (!user) return { actorId: null, actorClearance: null, actorRole: null }
  const { claims } = await user.getIdTokenResult()
  const actorRole = (claims.role as Role | undefined) ?? 'user'
  return {
    actorId: user.uid,
    actorClearance: actorRole === 'admin' ? 100 : Number(claims.clearance ?? 0),
    actorRole,
  }
}

/** Ligne du journal des mouvements (même forme que scoreEvent() dans functions/index.js) */
function scoreEvent(
  documentId: string,
  previousScore: number,
  score: number,
  details: { source: ScoreSource; reason: string; volatility: number; signals: TrustSignals },
  actor: Awaited<ReturnType<typeof currentActor>>,
) {
  const delta = score - previousScore
  return {
    documentId,
    score,
    previousScore,
    delta,
    deltaPct: deltaPctOf(previousScore, delta),
    ...details,
    ...actor,
    visibilityBefore: clearanceNeededFor(previousScore),
    visibilityAfter: clearanceNeededFor(score),
    at: serverTimestamp(),
  }
}

/** Enregistre une variation de score : met à jour le document et ajoute le mouvement au journal */
export async function recordScoreChange(id: string, newScore: number, source: ScoreSource, reason: string) {
  const ref = doc(documentsCol, id)
  const score = clampScore(newScore)
  // Les transactions client ne lisent pas de requêtes : les derniers mouvements sont lus juste avant
  const [actor, recent] = await Promise.all([
    currentActor(),
    getDocs(query(historyCol(id), orderBy('at', 'desc'), limit(VOLATILITY_WINDOW - 1))),
  ])

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Document not found.')
    const previousScore = snap.get('score') as number
    const delta = score - previousScore
    const volatility = volatilityFrom([delta, ...recent.docs.map((d) => d.get('delta') as number)])
    const signals = snap.get('signals') as TrustSignals

    tx.update(ref, { score, previousScore, delta, volatility, lastScoredAt: serverTimestamp(), updatedAt: serverTimestamp() })
    tx.set(doc(historyCol(id)), scoreEvent(id, previousScore, score, { source, reason, volatility, signals }, actor))
  })
}

/** Journal complet des mouvements, du plus récent au plus ancien */
export async function getScoreHistory(id: string): Promise<ScoreEvent[]> {
  const snap = await getDocs(query(historyCol(id), orderBy('at', 'desc')))
  return snap.docs.map((s) => {
    const d = s.data()
    const delta = d.delta ?? d.score - d.previousScore
    // Valeurs recalculées pour les mouvements écrits avant l'enrichissement du schéma
    return {
      documentId: id,
      actorId: null,
      actorClearance: null,
      actorRole: null,
      ...(d as Partial<ScoreEvent>),
      id: s.id,
      score: d.score,
      previousScore: d.previousScore,
      delta,
      source: d.source,
      reason: d.reason,
      deltaPct: d.deltaPct ?? deltaPctOf(d.previousScore, delta),
      visibilityBefore: d.visibilityBefore ?? clearanceNeededFor(d.previousScore),
      visibilityAfter: d.visibilityAfter ?? clearanceNeededFor(d.score),
      at: toIso(d.at),
    }
  })
}
