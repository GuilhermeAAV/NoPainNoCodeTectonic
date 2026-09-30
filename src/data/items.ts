import type { Item } from '@/types'

// Données de démonstration — à remplacer par un appel API (useFetch) quand le backend sera prêt
export const items: Item[] = [
  { id: 1, title: 'Charte graphique 2026', description: 'Logos, couleurs et gabarits à utiliser dans toute communication externe.', category: 'Communication', status: 'diffusé', clearance: 0, updatedAt: '2026-09-28' },
  { id: 2, title: 'Contrat cadre fournisseur cloud', description: 'Version signée et annexes tarifaires.', category: 'Juridique', status: 'diffusé', clearance: 50, updatedAt: '2026-09-27' },
  { id: 3, title: 'Grille salariale', description: 'Fourchettes de rémunération par poste et par ancienneté.', category: 'RH', status: 'en relecture', clearance: 80, updatedAt: '2026-09-20' },
  { id: 4, title: 'Guide d’accueil des nouveaux arrivants', description: 'Outils, contacts et démarches de la première semaine.', category: 'RH', status: 'diffusé', clearance: 0, updatedAt: '2026-09-29' },
  { id: 5, title: 'Clôture comptable T2', description: 'Bilan, compte de résultat et notes de l’expert-comptable.', category: 'Finance', status: 'archivé', clearance: 50, updatedAt: '2026-09-15' },
  { id: 6, title: 'Procédure de note de frais', description: 'Plafonds, justificatifs et circuit de validation.', category: 'Finance', status: 'diffusé', clearance: 20, updatedAt: '2026-09-25' },
  { id: 7, title: 'Plan stratégique 2027', description: 'Orientations, budget prévisionnel et projets prioritaires.', category: 'Direction', status: 'en relecture', clearance: 80, updatedAt: '2026-09-18' },
  { id: 8, title: 'Registre des traitements RGPD', description: 'Liste des traitements de données personnelles et leurs bases légales.', category: 'Juridique', status: 'archivé', clearance: 20, updatedAt: '2026-09-10' },
]
