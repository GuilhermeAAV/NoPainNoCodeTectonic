import type { Item } from '@/types'

// Données de démonstration — à remplacer par un appel API (useFetch) quand le backend sera prêt
export const items: Item[] = [
  { id: 1, title: 'Brand guidelines 2026', description: 'Logos, colours and templates to use in all external communication.', category: 'Communication', status: 'published', clearance: 0, updatedAt: '2026-09-28' },
  { id: 2, title: 'Cloud provider framework agreement', description: 'Signed version and pricing appendices.', category: 'Legal', status: 'published', clearance: 50, updatedAt: '2026-09-27' },
  { id: 3, title: 'Salary grid', description: 'Pay ranges by role and seniority.', category: 'HR', status: 'in review', clearance: 80, updatedAt: '2026-09-20' },
  { id: 4, title: 'New starter onboarding guide', description: 'Tools, contacts and first-week tasks.', category: 'HR', status: 'published', clearance: 0, updatedAt: '2026-09-29' },
  { id: 5, title: 'Q2 financial close', description: 'Balance sheet, income statement and the accountant’s notes.', category: 'Finance', status: 'archived', clearance: 50, updatedAt: '2026-09-15' },
  { id: 6, title: 'Expense claim procedure', description: 'Limits, receipts and approval workflow.', category: 'Finance', status: 'published', clearance: 20, updatedAt: '2026-09-25' },
  { id: 7, title: 'Strategic plan 2027', description: 'Direction, forecast budget and priority projects.', category: 'Management', status: 'in review', clearance: 80, updatedAt: '2026-09-18' },
  { id: 8, title: 'GDPR record of processing activities', description: 'List of personal data processing activities and their legal bases.', category: 'Legal', status: 'archived', clearance: 20, updatedAt: '2026-09-10' },
]
