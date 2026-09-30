// Crée les comptes de démonstration (src/data/demo-accounts.json), auxquels on peut se connecter,
// leur donne une expertise de départ par domaine puis recalcule toutes les notes.
// Relançable : les comptes existants sont conservés, leur expertise de départ est réécrite.
// Usage : npm run seed:experts -- <email admin> <mot de passe>
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, getFirestore, query, setDoc, where, writeBatch } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

const [email, password] = process.argv.slice(2)
if (!email || !password) {
  console.error('Usage : npm run seed:experts -- <email admin> <mot de passe>')
  process.exit(1)
}

const { projects } = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'))
const demo = JSON.parse(readFileSync(new URL('../src/data/demo-accounts.json', import.meta.url), 'utf8'))
const app = initializeApp({ apiKey: 'REMOVED_FIREBASE_API_KEY', projectId: projects.default })
const auth = getAuth(app)
const db = getFirestore(app)
const functions = getFunctions(app, 'europe-west1')
await signInWithEmailAndPassword(auth, email, password)

// Barème identique à functions/index.js
const domainPoints = (clearance) => Math.max(1, Math.round(clearance / 10))
const GRADES = [['A', 150], ['B', 80], ['C', 40], ['D', 20], ['E', 5], ['F', 0]]
const gradeFor = (points) => GRADES.find(([, min]) => points >= min)[0]

async function ensureAccount(account) {
  const { firstName, lastName, email, clearance } = account
  try {
    const { data } = await httpsCallable(functions, 'createProfile')({ firstName, lastName, email, clearance, password: demo.password })
    return { uid: data.id, created: true }
  } catch (err) {
    if (err.code !== 'functions/already-exists') throw err
    const snap = await getDocs(query(collection(db, 'profiles'), where('email', '==', email)))
    if (snap.empty) throw new Error(`${email} existe dans Auth mais n'a pas de profil.`)
    return { uid: snap.docs[0].id, created: false }
  }
}

const rows = []
const baselines = new Map()
for (const account of demo.accounts) {
  const { uid, created } = await ensureAccount(account)
  // Expertise de départ : rebuildExpertise l'ajoute aux validations réelles du compte
  const baseline = Object.fromEntries(
    Object.entries(account.expertise).map(([domain, validations]) => [
      domain,
      { points: validations * domainPoints(account.clearance), validations },
    ]),
  )
  await setDoc(doc(db, 'expertise', uid), { baseline }, { merge: true })
  baselines.set(uid, baseline)
  rows.push({ email: account.email, clearance: account.clearance, persona: account.persona, statut: created ? 'créé' : 'existant' })
}

// Anciennes fiches d'experts fictifs, sans compte : remplacées par les comptes ci-dessus
const stale = await getDocs(query(collection(db, 'expertise'), where('demo', '==', true)))
if (!stale.empty) {
  const batch = writeBatch(db)
  stale.docs.forEach((d) => batch.delete(d.ref))
  await batch.commit()
}

const rebuilt = (await httpsCallable(functions, 'rebuildExpertise')()).data

// Une version déployée de rebuildExpertise antérieure à la gestion de « baseline » efface l'expertise de départ :
// on la réapplique alors ici, par-dessus les validations réelles recalculées
let restored = 0
for (const [uid, baseline] of baselines) {
  const ref = doc(db, 'expertise', uid)
  const snap = await getDoc(ref)
  if (snap.get('baseline')) continue
  const domains = { ...(snap.get('domains') ?? {}) }
  for (const [domain, base] of Object.entries(baseline)) {
    const current = domains[domain] ?? { points: 0, validations: 0, lastValidatedAt: null }
    const points = current.points + base.points
    domains[domain] = { ...current, points, validations: current.validations + base.validations, grade: gradeFor(points) }
  }
  await setDoc(ref, { baseline, domains }, { merge: true })
  restored++
}
console.table(rows)
console.log(`Mot de passe commun : ${demo.password}`)
console.log(`${stale.size} anciennes fiches fictives supprimées.`)
console.log(`Notes recalculées pour ${rebuilt.profiles} profils (${rebuilt.validations} validations).`)
if (restored)
  console.log(`⚠ rebuildExpertise déployé est ancien : expertise de départ réappliquée sur ${restored} comptes. Pensez à npm run deploy:backend.`)
process.exit(0)
