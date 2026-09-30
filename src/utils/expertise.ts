/**
 * Domaines d'expertise (miroir de functions/index.js et de firestore.rules, qui font foi) :
 * chaque document relève d'un domaine, chaque domaine appelle un type d'expert.
 */
export const DOMAINS = [
  { id: 'cybersecurite', label: 'Cybersecurity', expert: 'Cybersecurity expert' },
  { id: 'droit-affaires', label: 'Business law', expert: 'Corporate lawyer' },
  { id: 'donnees-personnelles', label: 'Data protection', expert: 'Data protection officer' },
  { id: 'conformite', label: 'Compliance and risk', expert: 'Compliance officer' },
  { id: 'finance', label: 'Finance and accounting', expert: 'Financial controller' },
  { id: 'fiscalite', label: 'Tax', expert: 'Tax specialist' },
  { id: 'rh', label: 'Human resources', expert: 'HR and employment law expert' },
  { id: 'infrastructure', label: 'Infrastructure and DevOps', expert: 'DevOps / SRE engineer' },
  { id: 'developpement', label: 'Software development', expert: 'Software architect' },
  { id: 'operations', label: 'Operations and support', expert: 'Operations manager' },
] as const

export type DomainId = (typeof DOMAINS)[number]['id']

export const domainInfo = (id: DomainId) => DOMAINS.find((d) => d.id === id) ?? DOMAINS[0]

// Documents créés avant l'introduction des domaines : déduit de la catégorie
const CATEGORY_DOMAINS: Record<string, DomainId> = {
  sécurité: 'cybersecurite',
  security: 'cybersecurite',
  juridique: 'droit-affaires',
  legal: 'droit-affaires',
  finance: 'finance',
  rh: 'rh',
  hr: 'rh',
  devops: 'infrastructure',
  backend: 'developpement',
  support: 'operations',
}

export function domainOf(d: { domain?: string; category?: string }): DomainId {
  if (DOMAINS.some((x) => x.id === d.domain)) return d.domain as DomainId
  return CATEGORY_DOMAINS[String(d.category ?? '').toLowerCase()] ?? 'operations'
}

/** Notes de F à A : une note est acquise à partir de `min` points dans le domaine */
export const GRADES = [
  { grade: 'A', min: 150 },
  { grade: 'B', min: 80 },
  { grade: 'C', min: 40 },
  { grade: 'D', min: 20 },
  { grade: 'E', min: 5 },
  { grade: 'F', min: 0 },
] as const

export type Grade = (typeof GRADES)[number]['grade']

export const gradeFor = (points: number): Grade => GRADES.find((g) => points >= g.min)!.grade

/** Points restants avant la note suivante (null si déjà A) */
export function pointsToNextGrade(points: number) {
  const next = [...GRADES].reverse().find((g) => g.min > points)
  return next ? { grade: next.grade, missing: next.min - points } : null
}

/**
 * Points d'expertise gagnés en validant un document du domaine : accréditation ÷ 10, au moins 1.
 * Un Expert (100) gagne 10 points par validation et atteint A en 15 validations, un Senior (50) en 30.
 */
export const domainPoints = (clearance: number) => Math.max(1, Math.round(clearance / 10))

/** En dessous de ce score, la fiche document recommande des experts du domaine */
export const LOW_SCORE_THRESHOLD = 70
