/**
 * Points de confiance apportés par une validation (miroir de functions/index.js, qui fait foi) :
 *   gain = 20 × (accréditation / 100)² × (100 − score) / 100, au moins 1 point
 * Le poids est quadratique : un Expert (100) pèse 4× un Senior (50) et 25× un Confirmé (20).
 * Le facteur (100 − score) rend les derniers points plus durs à gagner.
 */
export const MAX_VALIDATION_GAIN = 20

export function validationGain(clearance: number, score: number) {
  if (score >= 100 || clearance <= 0) return 0
  const weight = (clearance / 100) ** 2
  return Math.min(100 - score, Math.max(1, Math.round(MAX_VALIDATION_GAIN * weight * ((100 - score) / 100))))
}

/**
 * Volatilité de 0 à 100 (miroir de functions/index.js) : 5 × variation absolue moyenne
 * sur les VOLATILITY_WINDOW derniers mouvements. Des mouvements de ±4 donnent 20, de ±20 donnent 100.
 */
export const VOLATILITY_WINDOW = 10

export function volatilityFrom(deltas: number[]) {
  const recent = deltas.slice(0, VOLATILITY_WINDOW)
  if (recent.length === 0) return 0
  const meanAbs = recent.reduce((sum, d) => sum + Math.abs(d), 0) / recent.length
  return Math.min(100, Math.round(5 * meanAbs))
}

/** Variation relative en %, arrondie au dixième (0 si le score de départ est nul) */
export const deltaPctOf = (previousScore: number, delta: number) =>
  previousScore === 0 ? 0 : Math.round((delta / previousScore) * 1000) / 10

export const formatPct = (pct: number) => `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`

/** Niveau d'accréditation à partir duquel un document de ce score est visible */
export const clearanceNeededFor = (score: number) => Math.max(0, 100 - score)

export const formatDelta = (delta: number) => (delta > 0 ? `+${delta}` : `${delta}`)

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Référence affichée d'un document Firestore, ex. DX-7F3A2C */
export const docCode = (id: string) => `DX-${id.slice(0, 6).toUpperCase()}`
