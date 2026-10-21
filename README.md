# NotesGym — Self-hosted

Application React/Vite et Node.js pour les notes scolaires, statistiques, projections, exports CSV/PDF et simulations. Données locales dans un volume Docker ; aucun service d’authentification externe.

## Authentification v2

Inscription autonome, vérification par email, connexion par cookie, récupération de mot de passe et paramètres du compte. SQLite conserve comptes, sessions révocables et empreintes des jetons. Les notes et plans restent dans leurs JSON. Les UUID historiques et mots de passe scrypt sont conservés. Les comptes nouveaux ne peuvent accéder aux données protégées avant confirmation.

**Installation existante : ne démarrez pas la nouvelle image avant d’avoir préparé et répété la migration hors ligne sur une copie.** Le démarrage refuse les anciennes données non migrées et l’ancienne variable NOTESGYM_USERS. Aucune migration historique automatique.

- [Audit, architecture et risques](docs/auth-v2-audit.md)
- [Configuration, migration, tests, déploiement et retour arrière](docs/auth-v2-deployment.md)

## Nouvelle installation uniquement

1. Copier `.env.example` vers `.env` et définir l’origine publique exacte et SMTP.
2. Démarrer : `docker compose up -d --build`.
3. Ouvrir `/register`, créer le compte et confirmer l’email reçu.

Le volume `notesgym-data` reste déclaré dans Compose. Son nom effectif peut être préfixé par le nom du projet Compose. Ne jamais le supprimer ni changer le projet ou le montage pendant une mise à jour.

## Développement

Node 24 LTS. Le serveur ne charge pas `.env` automatiquement ; utiliser `node --env-file=.env server.js` ou exporter les variables.

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm start
```

Lancer Vite avec `pnpm dev` pour le frontend. Les paramètres de compte sont accessibles depuis le menu du dashboard, ou directement sur `/account`.

## Données et sauvegardes

Le volume contient `auth.sqlite` (et éventuellement WAL/SHM), `notes.json`, `simulation-settings.json`, les fichiers historiques `users.json` et les sauvegardes de migration. Ne jamais modifier les propriétaires de notes à la main. Les adresses historiques restent réservées à leur UUID, même après changement d’email.

Sauvegarder **tout le volume, application arrêtée**, et conserver l’ancienne image ainsi que sa configuration de manière sécurisée. Le guide décrit une restauration vers un volume distinct pour vérifier le retour arrière sans écraser les données courantes.
