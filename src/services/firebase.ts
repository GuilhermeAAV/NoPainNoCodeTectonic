import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getFunctions } from 'firebase/functions'

// Identifiants publics du projet (pas des secrets) : la sécurité repose sur Auth + firestore.rules
const firebaseConfig = {
  apiKey: 'REMOVED_FIREBASE_API_KEY',
  authDomain: 'qwiklabs-gcp-02-30f4b09544f0.firebaseapp.com',
  projectId: 'qwiklabs-gcp-02-30f4b09544f0',
  storageBucket: 'qwiklabs-gcp-02-30f4b09544f0.firebasestorage.app',
  messagingSenderId: '294043526578',
  appId: '1:294043526578:web:a387fb70a7a2f2abea70ab',
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app, 'europe-west1')
