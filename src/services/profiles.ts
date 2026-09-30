import { FirebaseError } from 'firebase/app'
import { signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, orderBy, query, type DocumentSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from '@/services/firebase'
import type { NewProfile, Profile, Role } from '@/types'

export const MIN_PASSWORD_LENGTH = 8

export const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const authErrors: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-email': 'Invalid email address.',
  'auth/user-disabled': 'This account is disabled. Contact your administrator.',
  'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
}

// Les erreurs des Cloud Functions ont déjà un message en français ; on traduit celles de Firebase Auth
function toError(err: unknown): Error {
  if (err instanceof FirebaseError) {
    if (authErrors[err.code]) return new Error(authErrors[err.code])
    if (err.code.startsWith('functions/') && err.message !== 'internal') return new Error(err.message)
  }
  console.error(err)
  return new Error('Something went wrong. Try again.')
}

function toProfile(snap: DocumentSnapshot): Profile {
  const data = snap.data()!
  return {
    id: snap.id,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email,
    clearance: data.clearance,
    role: data.role,
    createdAt: data.createdAt?.toDate().toISOString() ?? new Date().toISOString(),
  }
}

/** Profil de l'utilisateur connecté ; le rôle vient des claims du token (non modifiables côté client) */
export async function loadProfile(user: User): Promise<Profile | null> {
  const [token, snap] = await Promise.all([user.getIdTokenResult(), getDoc(doc(db, 'profiles', user.uid))])
  if (!snap.exists()) return null
  return { ...toProfile(snap), role: (token.claims.role as Role) ?? 'user' }
}

export async function listProfiles(): Promise<Profile[]> {
  const snap = await getDocs(query(collection(db, 'profiles'), orderBy('createdAt'))).catch((err) => {
    throw toError(err)
  })
  return snap.docs.map(toProfile)
}

export async function createProfile(input: NewProfile): Promise<Profile> {
  if (!input.firstName.trim() || !input.lastName.trim()) throw new Error('First name and last name are required.')
  if (!isValidEmail(input.email.trim())) throw new Error('Invalid email address.')
  if (input.password.length < MIN_PASSWORD_LENGTH)
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)

  try {
    const res = await httpsCallable<NewProfile, Omit<Profile, 'createdAt'>>(functions, 'createProfile')(input)
    return { ...res.data, createdAt: new Date().toISOString() }
  } catch (err) {
    throw toError(err)
  }
}

export async function deleteProfile(id: string) {
  try {
    await httpsCallable(functions, 'deleteProfile')({ id })
  } catch (err) {
    throw toError(err)
  }
}

export async function login(email: string, password: string): Promise<Profile> {
  try {
    const { user } = await signInWithEmailAndPassword(auth, email.trim(), password)
    const profile = await loadProfile(user)
    if (!profile) {
      await signOut(auth)
      throw new Error('No profile is linked to this account. Contact your administrator.')
    }
    return profile
  } catch (err) {
    throw err instanceof FirebaseError ? toError(err) : err
  }
}

export const logout = () => signOut(auth)
