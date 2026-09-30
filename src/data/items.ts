import type { Item } from '@/types'

// Données de démonstration — à remplacer par un appel API (useFetch) quand le backend sera prêt
export const items: Item[] = [
  { id: 1, title: 'Refonte du site vitrine', description: 'Nouvelle charte graphique et pages produit.', category: 'Design', status: 'actif', updatedAt: '2026-09-28' },
  { id: 2, title: 'API de paiement', description: 'Intégration du prestataire de paiement et webhooks.', category: 'Backend', status: 'actif', updatedAt: '2026-09-27' },
  { id: 3, title: 'Application mobile', description: 'Prototype React Native pour iOS et Android.', category: 'Mobile', status: 'en pause', updatedAt: '2026-09-20' },
  { id: 4, title: 'Tableau de bord interne', description: 'Suivi des indicateurs clés de l’équipe.', category: 'Frontend', status: 'actif', updatedAt: '2026-09-29' },
  { id: 5, title: 'Migration base de données', description: 'Passage vers PostgreSQL 17 et nettoyage du schéma.', category: 'Backend', status: 'terminé', updatedAt: '2026-09-15' },
  { id: 6, title: 'Design system', description: 'Bibliothèque de composants partagés.', category: 'Design', status: 'actif', updatedAt: '2026-09-25' },
  { id: 7, title: 'Tests end-to-end', description: 'Couverture des parcours critiques.', category: 'Frontend', status: 'en pause', updatedAt: '2026-09-18' },
  { id: 8, title: 'Notifications push', description: 'Envoi de notifications sur mobile et web.', category: 'Mobile', status: 'terminé', updatedAt: '2026-09-10' },
]
