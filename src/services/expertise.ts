import { FirebaseError } from 'firebase/app'
import { collection, doc, getDoc, getDocs, type DocumentSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '@/services/firebase'
import type { DomainScore, Expertise } from '@/types'
import { gradeFor } from '@/utils/expertise'

const expertiseCol = collection(db, 'expertise')

function toExpertise(snap: DocumentSnapshot): Expertise {
  const d = snap.data()!
  const domains = Object.fromEntries(
    Object.entries((d.domains ?? {}) as Record<string, Record<string, unknown>>).map(([id, x]) => {
      const points = Number(x.points ?? 0)
      const at = x.lastValidatedAt as { toDate(): Date } | undefined
      const score: DomainScore = {
        points,
        validations: Number(x.validations ?? 0),
        // Recalculée ici : la note stockée peut dater d'un ancien barème
        grade: gradeFor(points),
        lastValidatedAt: at?.toDate().toISOString() ?? null,
      }
      return [id, score]
    }),
  )
  return {
    id: snap.id,
    firstName: d.firstName ?? '',
    lastName: d.lastName ?? '',
    clearance: d.clearance ?? 0,
    role: d.role ?? 'user',
    domains,
  }
}

/** Notes de l'utilisateur ; null si aucune validation n'a encore été enregistrée */
export async function getExpertise(uid: string): Promise<Expertise | null> {
  const snap = await getDoc(doc(expertiseCol, uid))
  return snap.exists() ? toExpertise(snap) : null
}

/** Toutes les fiches (admin uniquement, voir firestore.rules) */
export async function listExpertise(): Promise<Expertise[]> {
  const snap = await getDocs(expertiseCol)
  return snap.docs.map(toExpertise)
}

/** Recalcule les notes à partir des validations existantes (admin) */
export async function rebuildExpertise() {
  try {
    return (await httpsCallable<void, { profiles: number; validations: number }>(functions, 'rebuildExpertise')()).data
  } catch (err) {
    if (err instanceof FirebaseError && err.message !== 'internal') throw new Error(err.message)
    throw new Error('Une erreur est survenue.')
  }
}
