import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
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

  if (!firstName || !lastName) throw new HttpsError('invalid-argument', 'Le nom et le prénom sont obligatoires.')
  if (!EMAIL_RE.test(email)) throw new HttpsError('invalid-argument', 'Adresse mail invalide.')
  if (password.length < MIN_PASSWORD_LENGTH)
    throw new HttpsError('invalid-argument', `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`)
  if (!Number.isInteger(clearance) || clearance < 0 || clearance > 100)
    throw new HttpsError('invalid-argument', "Le niveau d'accréditation doit être un entier entre 0 et 100.")

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
      throw new HttpsError('already-exists', 'Un profil existe déjà avec cette adresse mail.')
    throw err
  }

  await auth.setCustomUserClaims(user.uid, { role, clearance: profile.clearance })
  const doc = { ...profile, role, createdAt: FieldValue.serverTimestamp() }
  await db.doc(`profiles/${user.uid}`).set(doc)
  return { id: user.uid, ...profile, role }
}

function assertAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Connexion requise.')
  if (request.auth.token.role !== 'admin') throw new HttpsError('permission-denied', 'Réservé aux administrateurs.')
}

export const createProfile = onCall(async (request) => {
  assertAdmin(request)
  return createAccount(parseProfile(request.data), 'user')
})

export const deleteProfile = onCall(async (request) => {
  assertAdmin(request)
  const id = String(request.data?.id ?? '')
  if (!id) throw new HttpsError('invalid-argument', 'Identifiant manquant.')

  const snap = await db.doc(`profiles/${id}`).get()
  if (!snap.exists) throw new HttpsError('not-found', 'Profil introuvable.')
  if (snap.get('role') === 'admin') throw new HttpsError('permission-denied', 'Le compte admin ne peut pas être supprimé.')

  await auth.deleteUser(id).catch((err) => {
    if (err.code !== 'auth/user-not-found') throw err
  })
  await snap.ref.delete()
  return { ok: true }
})

// Création du tout premier admin : exige le jeton de functions/.env et ne fonctionne qu'une seule fois
export const bootstrapAdmin = onCall(async (request) => {
  if (!bootstrapToken.value() || request.data?.token !== bootstrapToken.value())
    throw new HttpsError('permission-denied', 'Jeton invalide.')

  const lock = db.doc('config/bootstrap')
  await db.runTransaction(async (tx) => {
    if ((await tx.get(lock)).exists) throw new HttpsError('failed-precondition', 'Un admin existe déjà.')
    tx.set(lock, { createdAt: FieldValue.serverTimestamp() })
  })

  return createAccount(parseProfile({ ...request.data, clearance: 100 }), 'admin')
})
