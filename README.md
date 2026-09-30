# DocExchange (NoPainNoCode Tectonic)

DocExchange rassemble les documents internes d'une organisation et donne à chacun un **score de confiance de 0 à 100** :

- les **validations d'experts** font monter le score (plus l'expert est accrédité, plus sa validation pèse) ;
- les **conflits** avec d'autres sources et le **contenu obsolète** le font baisser ;
- chaque utilisateur a un **niveau d'accréditation** (0 à 100) fixé par un admin et ne voit que les documents auxquels ce niveau donne accès ;
- chaque document appartient à un **domaine** (cybersécurité, juridique, finance, RH…). Le site recommande les bons experts pour le relire, et chaque expert reçoit une note de A à F par domaine.

Stack : React 19 + Vite + TypeScript + Tailwind côté front, Firebase (Auth, Firestore, Cloud Functions, Hosting) côté back.

---

## Prérequis

- **Node.js 22** (les Cloud Functions tournent en Node 22 et les scripts utilisent `process.loadEnvFile`)
- Un **projet Firebase** avec Authentication (e-mail / mot de passe), Firestore et Cloud Functions activés. Les Cloud Functions demandent la formule Blaze.
- La CLI Firebase est incluse dans les dépendances : utilisez `npx firebase …` ou `npm run firebase -- …`.

## Lancer le site en local

Si le backend Firebase est déjà déployé (c'est le cas du projet de l'équipe) :

```bash
npm install
cp .env.example .env   # puis remplissez les valeurs VITE_FIREBASE_* (voir plus bas)
npm run dev
```

Ouvrez ensuite http://localhost:5173.

En mode dev, la page **Sign in** affiche les **comptes de démo** : cliquez sur l'un d'eux pour vous connecter. Ils partagent tous le mot de passe `demo-docexchange` (voir [src/data/demo-accounts.json](src/data/demo-accounts.json)). Pour tester l'accréditation, comparez par exemple :

| Compte | Niveau | Ce qu'on voit |
| --- | --- | --- |
| `nadia.mercier@docexchange.demo` | 100 | Tous les documents |
| `alex.durand@docexchange.demo` | 60 | Senior sans expertise, peut demander des relectures |
| `jordan.blanc@docexchange.demo` | 30 | Uniquement les documents les plus fiables |

### Le fichier `.env`

Les valeurs se trouvent dans la console Firebase : **Paramètres du projet → Général → Vos applications → Configuration du SDK**.

| Variable | Rôle |
| --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Configuration Web Firebase. Obligatoire : le site s'arrête au démarrage si la clé API ou l'ID du projet manque. |
| `VITE_SHOW_DEMO_ACCOUNTS` | `true` pour afficher les comptes de démo sur la page de connexion en production. Ils sont toujours affichés en dev. |
| `VITE_API_URL` | Facultatif, non utilisé par les pages actuelles. |

Ces clés Web ne sont pas secrètes : la sécurité repose sur Firebase Auth et [firestore.rules](firestore.rules).

---

## Installer sur un nouveau projet Firebase

À faire une seule fois, si vous partez d'un projet Firebase vide.

1. **Choisir le projet** : remplacez l'ID dans [.firebaserc](.firebaserc) ou lancez `npx firebase use --add`, puis connectez-vous avec `npx firebase login`.
2. **Créer `functions/.env`** avec un jeton secret de votre choix, qui sert à créer le premier admin :
   ```bash
   echo "BOOTSTRAP_TOKEN=$(openssl rand -hex 24)" > functions/.env
   ```
3. **Installer et déployer le backend** (Cloud Functions + règles Firestore) :
   ```bash
   (cd functions && npm install)
   npm run deploy:backend
   ```
4. **Créer le premier admin** (une seule fois possible) :
   ```bash
   npm run bootstrap-admin -- admin@exemple.com MotDePasse123 Prénom Nom
   ```
5. **Charger les données de démo** avec les identifiants de cet admin :
   ```bash
   npm run seed:experts   -- admin@exemple.com MotDePasse123   # comptes de démo + expertises
   npm run seed           -- admin@exemple.com MotDePasse123   # documents, scores, historique
   npm run seed:dashboard -- admin@exemple.com MotDePasse123   # stats, conflits et lacunes du tableau de bord
   ```
   Vous pouvez relancer ces scripts sans risque : les comptes et documents existants ne sont pas dupliqués.
6. **Lancer le site** avec `npm run dev`, ou le mettre en ligne sur Firebase Hosting avec `npm run deploy`.

---

## Utiliser le site

| Page | Qui | Ce qu'on y fait |
| --- | --- | --- |
| **Home** (`/`) | Tout le monde | Voir son niveau d'accréditation et combien de documents on peut ouvrir. |
| **Dashboard** (`/dashboard`) | Tout le monde | Suivre la santé de la base : scores, conflits entre documents, sujets non couverts. Le bouton de simulation importe un document et montre s'il fait doublon, confirme un document existant (+ points) ou le contredit (le plus ancien perd des points). |
| **Search** (`/search`) | Connecté | Rechercher des documents par mots-clés. Seuls ceux de votre niveau apparaissent. |
| **Document** (`/documents/:id`) | Connecté | Lire un document, voir l'historique de son score et le valider si vous êtes expert du domaine. |
| **Requests** (`/requests`) | Connecté | Demander une relecture à un expert recommandé, ou accepter / refuser celles qu'on vous envoie. |
| **Profiles** (`/admin/profiles`) | Admin | Créer et supprimer des comptes et fixer leur niveau d'accréditation. |

**Comment le score évolue**

- Une validation rapporte `20 × (accréditation / 100)² × (100 − score) / 100` points, au moins 1. Un expert de niveau 100 pèse donc 4 fois plus qu'un Senior de niveau 50, et les derniers points sont les plus durs à gagner.
- La volatilité (0 à 100) mesure l'ampleur des derniers changements de score.
- Paliers d'accréditation : Junior (0), Intermediate (20), Senior (50), Expert (80).

---

## Commandes

| Commande | Effet |
| --- | --- |
| `npm run dev` | Serveur de développement Vite |
| `npm run build` | Vérification TypeScript puis build de production dans `dist/` |
| `npm run preview` | Sert le build localement |
| `npm run typecheck` | Vérification TypeScript seule |
| `npm run deploy` | Build puis déploiement complet sur Firebase (hosting, functions, règles) |
| `npm run deploy:backend` | Déploie uniquement les Cloud Functions et les règles Firestore |
| `npm run bootstrap-admin -- <email> <mdp> [prénom] [nom]` | Crée le premier admin |
| `npm run seed:experts` / `seed` / `seed:dashboard` `-- <email admin> <mdp>` | Charge les données de démo |

## Structure

```
├── functions/index.js   # Cloud Functions : comptes, recherche, validations, experts, relectures
├── firestore.rules      # Règles d'accès (rôle + accréditation lus dans le token Auth)
├── scripts/             # Création de l'admin et chargement des données de démo
└── src/
    ├── pages/           # Une page = une route (voir src/router.tsx)
    ├── components/      # Layout, tableau de bord, documents, expertise, UI
    ├── context/         # AuthContext : utilisateur connecté et son profil
    ├── services/        # Appels Firebase (documents, profils, relectures…)
    ├── utils/           # Calcul du score, accréditation, notes d'expertise
    └── data/            # Comptes et données de démo
```

L'alias `@/` pointe vers `src/`. Les formules de score dans `src/utils/` reprennent celles de `functions/index.js`, qui fait référence : si vous modifiez l'une, modifiez l'autre.

## Problèmes fréquents

- **« Missing Firebase config »** au démarrage : le fichier `.env` manque ou les variables `VITE_FIREBASE_*` sont vides. Redémarrez `npm run dev` après l'avoir modifié.
- **« Invalid token »** avec `bootstrap-admin` : `functions/.env` doit contenir le même `BOOTSTRAP_TOKEN` que celui déployé. Relancez `npm run deploy:backend` après l'avoir changé.
- **« An admin already exists »** : le premier admin a déjà été créé. Connectez-vous avec son compte et créez les autres depuis `/admin/profiles`.
- **Aucun document visible** : votre niveau d'accréditation est peut-être trop bas, ou les données de démo n'ont pas été chargées (étape 5).
