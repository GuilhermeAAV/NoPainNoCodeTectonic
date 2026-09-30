import { collection, doc, getDoc, getDocs } from 'firebase/firestore'
import { db } from '@/services/firebase'
import type { Conflict, Gap } from '@/pages/DashboardPage'

export interface DashboardHealth {
  score: number
  scoreDelta: number
  official: number
  current: number
  consistent: number
  conflicts: number
  conflictsDelta: number
  conflictsWeekly: number[]
  gaps: number
  gapsRising: number
  gapsWeekly: number[]
}

export interface DashboardData {
  scannedDocs: number
  lastScan: string
  health: DashboardHealth
  conflicts: Conflict[]
  gaps: Gap[]
}

// Écrit par scripts/seed-dashboard.mjs : health/latest-stats, conflicts/{id}, gaps/{id}
export async function fetchDashboard(): Promise<DashboardData | null> {
  const [healthSnap, conflictsSnap, gapsSnap] = await Promise.all([
    getDoc(doc(db, 'health', 'latest-stats')),
    getDocs(collection(db, 'conflicts')),
    getDocs(collection(db, 'gaps')),
  ])
  // Base pas encore alimentée : on garde les données locales
  if (!healthSnap.exists() || conflictsSnap.empty) return null

  const { scannedDocs, lastScan, ...health } = healthSnap.data() as DashboardHealth & Pick<DashboardData, 'scannedDocs' | 'lastScan'>
  return {
    scannedDocs,
    lastScan,
    health,
    // Plus récents d'abord (c-1042, c-1038…), lacunes les plus demandées d'abord
    conflicts: conflictsSnap.docs.map((d) => d.data() as Conflict).sort((a, b) => b.id.localeCompare(a.id)),
    gaps: gapsSnap.docs.map((d) => d.data() as Gap).sort((a, b) => b.count - a.count),
  }
}
