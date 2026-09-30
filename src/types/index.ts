// Types partagés de l'application
export interface ApiError {
  message: string
  status: number
}

export type ItemStatus = 'diffusé' | 'en relecture' | 'archivé'

export interface Item {
  id: number
  title: string
  description: string
  category: string
  status: ItemStatus
  /** Niveau d'accréditation requis pour ouvrir le document (0 à 100) */
  clearance: number
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

/*
 * Base de connaissances — structure Firestore
 *
 *   documents/{docId}                    KnowledgeDocument (métadonnées + score, léger, listable)
 *   documents/{docId}/content/file       DocumentContent (fichier en base64, chargé à la demande)
 *   documents/{docId}/scoreHistory/{id}  ScoreEvent (historique append-only des variations)
 */

/** Signaux bruts qui alimenteront le calcul du score */
export interface TrustSignals {
  /** Validations explicites par des experts */
  expertValidations: number
  /** Utilisations signalées comme réussies */
  successfulUses: number
  /** Consultations — mesure de popularité, pas de fiabilité */
  views: number
  /** Sources concordantes */
  confirmations: number
  /** Contradictions détectées avec d'autres sources */
  contradictions: number
}

export interface KnowledgeDocument {
  id: string
  title: string
  description: string
  category: string
  tags: string[]

  // Fichier (le contenu lui-même est dans content/file)
  fileName: string
  mimeType: string
  sizeBytes: number
  /** SHA-256 du fichier : intégrité et détection des doublons */
  sha256: string

  authorId: string
  createdAt: string
  updatedAt: string
  version: number

  /** Trust Score de 0 à 100 */
  score: number
  /** Score avant la dernière variation */
  previousScore: number
  /** Dernière variation (ex. +6 ou -12) */
  delta: number
  /** Volatilité de 0 (stable) à 100 (très instable) */
  volatility: number
  lastScoredAt: string

  signals: TrustSignals
  /** Ids des documents en conflit avec celui-ci */
  conflictsWith: string[]
  /** Révision par un expert demandée (ex. très consulté mais score faible) */
  reviewRequested: boolean
}

export interface DocumentContent {
  base64: string
  mimeType: string
  sha256: string
}

export type ScoreSource = 'initial' | 'expert' | 'usage' | 'freshness' | 'consistency' | 'contradiction' | 'manual'

/**
 * Un mouvement du Trust Score — une ligne du journal documents/{docId}/scoreHistory, append-only.
 * Les champs marqués « optionnel » sont absents des événements écrits avant l'enrichissement du schéma.
 */
export interface ScoreEvent {
  id: string
  documentId: string
  /** Score après le mouvement (clôture) */
  score: number
  /** Score avant le mouvement (ouverture) */
  previousScore: number
  /** Variation en points */
  delta: number
  /** Variation relative au score précédent, en % (arrondie au dixième) */
  deltaPct: number
  source: ScoreSource
  /** Raison lisible de la variation */
  reason: string
  actorId: string | null
  /** Accréditation de l'acteur au moment du mouvement (null : système ou inconnu) */
  actorClearance: number | null
  actorRole: Role | null
  /** Niveau d'accréditation requis pour voir le document avant / après le mouvement */
  visibilityBefore: number
  visibilityAfter: number
  /** Volatilité du document après le mouvement (optionnel) */
  volatility?: number
  /** Instantané des signaux après le mouvement (optionnel) */
  signals?: TrustSignals
  at: string
}

export type NewDocument = Pick<KnowledgeDocument, 'title' | 'description' | 'category' | 'tags'> & {
  /** Score initial, 50 par défaut */
  score?: number
}

/** Résultat de la recherche IA (Cloud Function searchDocuments) */
export interface SearchResult {
  id: string
  /** Adéquation à la demande de 0 à 100 */
  relevance: number
  /** Explication en une phrase */
  reason: string
  document: Pick<
    KnowledgeDocument,
    | 'title'
    | 'description'
    | 'category'
    | 'tags'
    | 'fileName'
    | 'mimeType'
    | 'score'
    | 'delta'
    | 'volatility'
    | 'conflictsWith'
    | 'reviewRequested'
    | 'updatedAt'
  >
}
