// Insère les données du tableau de bord Trust Radar (santé, conflits, lacunes) depuis src/data/dashboard.json.
// Usage : npm run seed:dashboard -- <email admin> <mot de passe>
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { doc, getFirestore, writeBatch } from 'firebase/firestore'

const [email, password] = process.argv.slice(2)
if (!email || !password) {
  console.error('Usage: npm run seed:dashboard -- <admin email> <password>')
  process.exit(1)
}

const { projects } = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'))
const data = JSON.parse(readFileSync(new URL('../src/data/dashboard.json', import.meta.url), 'utf8'))
process.loadEnvFile(new URL('../.env', import.meta.url))
const app = initializeApp({ apiKey: process.env.VITE_FIREBASE_API_KEY, projectId: projects.default })
const auth = getAuth(app)
const db = getFirestore(app)
// Les règles n'autorisent l'écriture qu'à un admin
await signInWithEmailAndPassword(auth, email, password)

const batch = writeBatch(db)
batch.set(doc(db, 'health', 'latest-stats'), { ...data.health, scannedDocs: data.scannedDocs, lastScan: data.lastScan })
for (const conflict of data.conflicts) batch.set(doc(db, 'conflicts', conflict.id), conflict)
for (const gap of data.gaps) batch.set(doc(db, 'gaps', gap.id), gap)
await batch.commit()

console.log(`Inserted health stats, ${data.conflicts.length} conflicts and ${data.gaps.length} gaps.`)
process.exit(0)
