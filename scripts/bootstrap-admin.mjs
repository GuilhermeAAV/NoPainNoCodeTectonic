// Crée le premier compte admin via la Cloud Function bootstrapAdmin (utilisable une seule fois).
// Usage : npm run bootstrap-admin -- <email> <mot de passe> [prénom] [nom]
import { readFileSync } from 'node:fs'

const [email, password, firstName = 'Admin', lastName = 'Tectonic'] = process.argv.slice(2)
if (!email || !password) {
  console.error('Usage : npm run bootstrap-admin -- <email> <mot de passe> [prénom] [nom]')
  process.exit(1)
}

const token = readFileSync(new URL('../functions/.env', import.meta.url), 'utf8').match(/^BOOTSTRAP_TOKEN=(.+)$/m)?.[1]
const { projects } = JSON.parse(readFileSync(new URL('../.firebaserc', import.meta.url), 'utf8'))
const url = `https://europe-west1-${projects.default}.cloudfunctions.net/bootstrapAdmin`

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: { token, email, password, firstName, lastName } }),
})
const body = await res.json().catch(() => ({}))

if (!res.ok || body.error) {
  console.error('Échec :', body.error?.message ?? `${res.status} ${res.statusText}`)
  process.exit(1)
}
console.log('Admin créé :', body.result.email)
