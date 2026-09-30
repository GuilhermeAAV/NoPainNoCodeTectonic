// Types partagés de l'application
export interface ApiError {
  message: string
  status: number
}

export type ItemStatus = 'actif' | 'en pause' | 'terminé'

export interface Item {
  id: number
  title: string
  description: string
  category: string
  status: ItemStatus
  updatedAt: string
}

export type Role = 'admin' | 'user'

export interface Profile {
  id: string
  firstName: string
  lastName: string
  email: string
  /** Niveau d'accréditation de 0 (junior) à 100 (expert) */
  clearance: number
  role: Role
  createdAt: string
}

export type NewProfile = Pick<Profile, 'firstName' | 'lastName' | 'email' | 'clearance'> & { password: string }
