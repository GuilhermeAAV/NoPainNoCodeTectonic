import { FirebaseError } from 'firebase/app'
import { collection, doc, getDoc, getDocs, query, where, type DocumentSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/services/firebase'
import type { ReviewRequest, ReviewStatus } from '@/types'

const requestsCol = collection(db, 'reviewRequests')
const toIso = (v: { toDate(): Date } | undefined) => v?.toDate().toISOString() ?? new Date().toISOString()

// Les Cloud Functions renvoient déjà un message lisible
async function call<Req, Res>(name: string, data: Req): Promise<Res> {
  try {
    return (await httpsCallable<Req, Res>(functions, name)(data)).data
  } catch (err) {
    if (err instanceof FirebaseError && err.code.startsWith('functions/') && err.message !== 'internal')
      throw new Error(err.message)
    console.error(err)
    throw new Error('Something went wrong.')
  }
}

function toRequest(snap: DocumentSnapshot): ReviewRequest {
  const d = snap.data()!
  return {
    ...(d as Omit<ReviewRequest, 'id' | 'createdAt' | 'updatedAt'>),
    id: snap.id,
    createdAt: toIso(d.createdAt),
    updatedAt: toIso(d.updatedAt),
  }
}

// Tri côté client : un orderBy sur un autre champ que le filtre exigerait un index composite
async function listBy(field: 'expertId' | 'requesterId', uid: string) {
  const snap = await getDocs(query(requestsCol, where(field, '==', uid)))
  return snap.docs.map(toRequest).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/** Demandes adressées à l'utilisateur (zone Requests) */
export const listReceivedRequests = (uid: string) => listBy('expertId', uid)

/** Demandes envoyées par l'utilisateur */
export const listSentRequests = (uid: string) => listBy('requesterId', uid)

/** Demande adressée à cet expert pour ce document (null si aucune ; les règles refusent la lecture d'un id absent) */
export async function getReviewRequest(documentId: string, expertId: string): Promise<ReviewRequest | null> {
  const snap = await getDoc(doc(requestsCol, `${documentId}_${expertId}`)).catch(() => null)
  return snap?.exists() ? toRequest(snap) : null
}

/** Demandes reçues qui attendent une réponse ou une validation */
export const OPEN_STATUSES: ReviewStatus[] = ['pending', 'accepted']

export async function countOpenRequests(uid: string) {
  return (await listReceivedRequests(uid)).filter((r) => OPEN_STATUSES.includes(r.status)).length
}

export const requestReview = (id: string, expertId: string, message = '') =>
  call<{ id: string; expertId: string; message: string }, { id: string; status: ReviewStatus }>('requestReview', {
    id,
    expertId,
    message,
  })

export const respondReviewRequest = (id: string, action: 'accept' | 'decline' | 'cancel') =>
  call<{ id: string; action: string }, { status: ReviewStatus }>('respondReviewRequest', { id, action })
