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
