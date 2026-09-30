import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

// Configuration lue dans .env (voir .env.example) : la sécurité repose sur Auth + firestore.rules
const env = import.meta.env
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}
if (!firebaseConfig.apiKey || !firebaseConfig.projectId)
  throw new Error('Missing Firebase config: copy .env.example to .env and fill in the VITE_FIREBASE_* values.')

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app, 'europe-west1')
