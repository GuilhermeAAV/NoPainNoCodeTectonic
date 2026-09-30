import type { Item, Profile } from '@/types'

/** Paliers d'accréditation : chaque palier commence à `min` */
export const tiers = [
  { min: 0, label: 'Junior' },
  { min: 20, label: 'Confirmé' },
  { min: 50, label: 'Senior' },
  { min: 80, label: 'Expert' },
]

export function clearanceLabel(clearance: number) {
  return [...tiers].reverse().find((t) => clearance >= t.min)!.label
}

/** Niveau effectif du lecteur : 0 pour un visiteur, 100 pour un admin */
export function readerLevel(user: Profile | null) {
  if (!user) return 0
  return user.role === 'admin' ? 100 : user.clearance
}

export const canRead = (level: number, item: Item) => level >= item.clearance

/** Référence affichée d'un document, ex. DX-0007 */
export const docRef = (id: number) => `DX-${String(id).padStart(4, '0')}`
