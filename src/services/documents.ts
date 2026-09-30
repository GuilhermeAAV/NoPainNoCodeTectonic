import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  where,
  writeBatch,
  type DocumentSnapshot,
} from 'firebase/firestore'
import { auth, db } from '@/services/firebase'
import type { DocumentContent, KnowledgeDocument, NewDocument, ScoreEvent, ScoreSource } from '@/types'

// Un document Firestore fait au plus 1 Mio et le base64 ajoute ~33 % : on plafonne le fichier à 700 Ko
export const MAX_FILE_BYTES = 700 * 1024

const documentsCol = collection(db, 'documents')
const contentRef = (id: string) => doc(db, 'documents', id, 'content', 'file')
const historyCol = (id: string) => collection(db, 'documents', id, 'scoreHistory')

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
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
    lastScoredAt: toIso(d.lastScoredAt),
  }
}

/** Crée métadonnées + contenu + premier événement d'historique en une seule écriture atomique */
export async function createDocument(file: File, input: NewDocument): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`Le fichier dépasse ${Math.round(MAX_FILE_BYTES / 1024)} Ko.`)
  const uid = auth.currentUser?.uid
  if (!uid) throw new Error('Connexion requise.')

  const { base64, sha256 } = await readFile(file)
  const score = clampScore(input.score ?? 50)
  const mimeType = file.type || 'application/octet-stream'
  const ref = doc(documentsCol)

  const batch = writeBatch(db)
  batch.set(ref, {
    title: input.title.trim(),
    description: input.description.trim(),
    category: input.category.trim(),
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
    signals: { expertValidations: 0, successfulUses: 0, views: 0, confirmations: 0, contradictions: 0 },
    conflictsWith: [],
    reviewRequested: false,
  })
  batch.set(contentRef(ref.id), { base64, mimeType, sha256 } satisfies DocumentContent)
  batch.set(doc(historyCol(ref.id)), {
    score,
    previousScore: score,
    delta: 0,
    source: 'initial',
    reason: 'Création du document',
    actorId: uid,
    at: serverTimestamp(),
  })
  await batch.commit()
  return ref.id
}

/** Liste les métadonnées (sans le contenu), triées par score décroissant */
export async function listDocuments(minScore = 0): Promise<KnowledgeDocument[]> {
  const snap = await getDocs(query(documentsCol, where('score', '>=', minScore), orderBy('score', 'desc')))
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

/** Enregistre une variation de score : met à jour le document et ajoute l'événement à l'historique */
export async function recordScoreChange(id: string, newScore: number, source: ScoreSource, reason: string) {
  const ref = doc(documentsCol, id)
  const score = clampScore(newScore)

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists()) throw new Error('Document introuvable.')
    const previousScore = snap.get('score') as number
    const delta = score - previousScore

    tx.update(ref, { score, previousScore, delta, lastScoredAt: serverTimestamp(), updatedAt: serverTimestamp() })
    tx.set(doc(historyCol(id)), {
      score,
      previousScore,
      delta,
      source,
      reason,
      actorId: auth.currentUser?.uid ?? null,
      at: serverTimestamp(),
    })
  })
}

export async function getScoreHistory(id: string): Promise<ScoreEvent[]> {
  const snap = await getDocs(query(historyCol(id), orderBy('at', 'desc')))
  return snap.docs.map((s) => ({ ...(s.data() as Omit<ScoreEvent, 'id' | 'at'>), id: s.id, at: toIso(s.get('at')) }))
}
