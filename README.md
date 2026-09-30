# NoPainNoCode Tectonic

Site React (Vite + TypeScript + React Router).

## Démarrer

```bash
npm install
cp .env.example .env
npm run dev
```

## Structure

```
src/
├── main.tsx            # Point d'entrée
├── router.tsx          # Définition des routes
├── components/
│   ├── layout/         # Layout, Header, Footer
│   └── ui/             # Composants réutilisables (Button…)
├── pages/              # Une page = une route
├── hooks/              # Hooks personnalisés (useFetch…)
├── services/           # Appels API
├── styles/             # CSS global
└── types/              # Types partagés
```

L'alias `@/` pointe vers `src/`.
