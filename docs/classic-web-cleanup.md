# Retour à NotesGym classique : audit et validation

## Périmètre audité

Le `main` distant a été récupéré avant le travail. Il pointe sur `20e0bf7`, fusion de la PR #20, et contient exactement les fichiers de `feature/chatgpt-mcp` à `e4b7079`. Le `main` local était encore à `0493230`, avant cette intégration : il n’a pas été réinitialisé ni déplacé. Les sept commits de développement depuis `0493230` et le commit de fusion ont été examinés, avec les différences de fichiers et les références aux endpoints, variables et dépendances.

La branche `cleanup/remove-chatgpt-mcp` a été créée depuis `origin/main` (`20e0bf7`). Le nettoyage est un nouveau commit ; il ne réécrit aucun historique. La branche `feature/chatgpt-mcp` est conservée comme historique, sans modification. `redesign-v2` n’a pas été utilisée ni modifiée (référence distante locale vérifiée : `6cd5fe8bf34daaf9270544b71dee58f9a283c616`).

## Fichiers supprimés

Les 30 fichiers suivants sont exclusivement liés à l’intégration abandonnée :

```text
Dockerfile.mcp
deploy/cloudflared.mcp.example.yml
docker-compose.mcp.yml
docs/chatgpt-dependency-audit-before.json
docs/chatgpt-dependency-audit-production.json
docs/chatgpt-dependency-audit.json
docs/chatgpt-external-tests.md
docs/chatgpt-oauth-firefox-consent.md
docs/chatgpt-plugin.md
docs/chatgpt-validation.md
docs/chatgpt-vulnerabilities.md
integration/chatgpt.js
integration/grade-service.js
integration/oauth-config.js
integration/oauth-keys.js
integration/oauth-store.js
integration/preflight.js
plugin/notesgym/README.md
plugin/notesgym/mcp.json
plugin/notesgym/plugin.json
scripts/chatgpt-audit-table.mjs
scripts/chatgpt-audit.mjs
scripts/chatgpt-dev-keys.mjs
scripts/chatgpt-oauth-backup.mjs
scripts/chatgpt-oauth-invalidate.mjs
scripts/chatgpt-preflight.mjs
test/chatgpt-mcp.test.js
test/chatgpt-periods.test.js
test/chatgpt-preflight.test.js
test/chatgpt-store.test.js
```

Le serveur ne charge plus de fournisseur OAuth, de base OAuth, de clés, de consentement ou d’outils MCP. Les anciennes URL `/mcp`, `/oauth/*`, `/chatgpt/*` et métadonnées OAuth n’ont plus de gestionnaire. Elles obtiennent 404 via le traitement générique des URL inconnues, sans page spéciale ChatGPT. Les pages `/`, `/Dashboard`, `/Home`, `/Insights`, `/Statistics` et `/Lab` continuent à répondre 200 ; le fallback SPA conserve la page frontend « introuvable » avec un statut HTTP 404 pour les URL inconnues.

## Fichiers déplacés et modifiés

| Fichier | Traitement |
| --- | --- |
| `integration/security.js` → `server/security.js` | Protections génériques conservées, module détaché de l’intégration ; ajout de la résolution sûre de l’origine web publique et validation de configuration |
| `test/chatgpt-report.test.js` → `test/report-pdf.test.js` | Test PDF conservé intégralement, renommage sans changement de contenu |
| `server.js` | Retrait du chargement et des routes dédiées, healthcheck autonome, arrêt sans fournisseur OAuth ; origine publique et cookies HTTPS cohérents derrière proxy ; URL inconnues génériques |
| `src/components/menu/MenuHome.jsx` | Retrait du seul lien « NotesGym × ChatGPT » |
| `package.json` | Retrait uniquement de `@modelcontextprotocol/sdk` et `oidc-provider` |
| `pnpm-lock.yaml` | Élagage du graphe devenu inutilisé : 714 → 633 entrées de paquets, soit 81 entrées retirées ; 691 lignes supprimées, aucune ajoutée, aucune version restante modifiée |
| `.env.example` | Exemple exclusivement web, sans variables ni clés OAuth ; paramètres HTTPS/proxy conservés |
| `Dockerfile` | Copie du module de sécurité à son nouvel emplacement ; image Node 20, stockage et copie des modules analytics conservés |
| `docker-compose.yml` | Transmission explicite de quatre réglages web depuis l’environnement Compose ; comptes, mots de passe d’exemple, port, nom de volume et montage inchangés |
| `eslint.config.js` | Lint du module serveur et des tests autonomes, retrait des motifs des fichiers supprimés |
| `README.md` | Configuration HTTPS/Cloudflare et lien vers ce bilan |

Fichiers ajoutés : `test/server-web.test.js` (régressions web et sécurité) et le présent bilan `docs/classic-web-cleanup.md`.

## Fichiers et comportements explicitement conservés

Toutes les différences introduites pendant le projet ne lui étaient pas exclusives. Ont été conservés :

- `src/components/grades/ReportGenerator.jsx`, `src/lib/reportPdf.js` et `src/components/grades/gradeUtils.js` : génération du vrai rapport, import jsPDF compatible et utilitaires partagés. Le renommage historique `.jsx` → `.js` n’est pas annulé.
- Tous les fichiers de `src/lib/analytics/`, `src/lib/lab/`, `src/pages/`, `src/api/` et tous les autres composants : notes, comptes, simulations synchronisées, Insights, statistiques, historique, exports et interface. Aucun changement dans ces moteurs ou écrans, hormis le lien de menu retiré.
- `test/account-simulation-api.test.js`, `test/analytics.test.js`, `test/annual-predictive.test.js`, `test/free-year-history.test.js`, `test/lab.test.js`, `test/simulation-settings.test.js` : inchangés. L’isolation des variables d’environnement des processus de test est conservée.
- Les dépendances encore utiles, leurs versions verrouillées et leurs correctifs, dont jsPDF, React Router et PostCSS ; aucune réinstallation des dépendances inutilisées déjà retirées pendant le projet.
- `.gitignore`, `.dockerignore`, `pnpm-workspace.yaml`, `docs/annual-predictive-engine.md`, les scripts de contrôle navigateur existants et les autres fichiers hors périmètre.
- Les comptes et formats JSON existants, le hachage scrypt et la vérification des mots de passe, l’isolation par compte, les sessions applicatives en mémoire et leur expiration. Un redémarrage continue à nécessiter une reconnexion ; les données persistantes restent présentes.

Une comparaison Git ciblant les moteurs, pages, API client, composants de notes et six tests historiques contre `origin/main` ne retourne aucune différence.

## Sécurité conservée pour l’application autonome

Les limites de corps (64 Kio), validation des entrées, limites API et connexion, contrôle strict d’origine, cookies `HttpOnly`/`SameSite=Lax`/`Secure`, en-têtes de sécurité, erreurs internes neutralisées, délais HTTP et arrêt du serveur restent présents. Aucune exception pour `Origin: null` n’est reprise. Le refus des origines hostiles et requêtes cross-site reste actif.

Le stockage JSON conserve la sérialisation des transactions complètes, l’écriture atomique, les permissions de création et le refus d’écraser une corruption. Les tests génériques de concurrence/corruption et de confiance du proxy ont été transférés depuis les suites supprimées vers `test/server-web.test.js` : leur couverture ne disparaît pas avec les tests OAuth.

## Origine HTTPS et configuration de déploiement

La régression d’authentification vient de la confusion entre l’origine du navigateur (`https://notesgym.lupachat.ch`) et le saut HTTP interne du reverse proxy. Sans URL publique, l’ancien contrôle reconstruisait toujours `http://Host`, même avec un proxy de confiance annonçant HTTPS. De plus, le Compose standard ne transmettait pas `NOTESGYM_PUBLIC_URL` depuis son `.env` au conteneur.

La configuration explicite recommandée est :

```dotenv
NOTESGYM_PUBLIC_URL=https://notesgym.lupachat.ch
```

Le Compose standard la transmet désormais au service. Cette origine, normalisée au démarrage (slash final accepté), fait autorité pour les requêtes d’écriture et les cookies `Secure`, indépendamment du transport HTTP interne ou de `X-Forwarded-Host`. Une URL malformée, avec identifiants, chemin, query ou fragment est refusée clairement au démarrage. Aucun appel réseau au domaine réel n’est effectué pour cette validation.

La connexion HTTPS fonctionne avec `NOTESGYM_TRUST_PROXY=false` si l’URL publique est explicite. Pour des quotas par visiteur Cloudflare, conserver/activer la confiance seulement pour l’IP/CIDR du **pair direct** vue depuis le conteneur, via `NOTESGYM_TRUST_PROXY=true` et `NOTESGYM_TRUSTED_PROXY_IPS`. Sans URL explicite, le schéma HTTPS est inféré seulement si ce pair est de confiance et fournit exactement `X-Forwarded-Proto: https` ; le Host de la requête est alors utilisé. Les en-têtes transmis par un pair non fiable ne font pas autorité. Les chaînes de proxys et listes de schémas ne sont pas devinées.

La documentation officielle Cloudflare décrit les [en-têtes transmis](https://developers.cloudflare.com/fundamentals/reference/http-headers/) et le [paramètre Host du tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/#httphostheader). Avec l’URL publique explicite, NotesGym n’exige pas de réécrire le Host interne pour accepter l’origine HTTPS. Aucune modification du tunnel, du DNS ou des identifiants Cloudflare n’a été effectuée.

Lors du futur déploiement manuel :

1. Utiliser le Dockerfile/Compose standard en conservant **le volume et le montage actuellement utilisés**. Ne pas remplacer un montage existant par un volume neuf, même si son nom diffère de l’exemple. Ne pas changer `NOTESGYM_DATA_DIR` ni `NOTESGYM_USERS` et ne lancer aucune commande de suppression de volume.
2. Transmettre l’URL publique ci-dessus au processus/conteneur. Un lancement natif Node ne charge pas automatiquement `.env` ; le fournir via l’environnement ou une option `--env-file` supportée. Le transport du tunnel peut rester HTTP vers le port actuel de l’application.
3. Retirer des seuls réglages applicatifs devenus inutiles `NOTESGYM_MCP_ENABLED`, `NOTESGYM_OAUTH_ACCESS_TTL_SECONDS`, `NOTESGYM_OAUTH_CLIENTS`, `NOTESGYM_OAUTH_COOKIE_KEYS`, `NOTESGYM_OAUTH_DB`, `NOTESGYM_OAUTH_JWKS`, `NOTESGYM_OAUTH_KEYS_FILE` et `NOTESGYM_RUNTIME_MODE` (ce dernier appartenait au Compose dédié). Conserver `NODE_ENV` et les réglages web/comptes/données.
4. Après redémarrage, se reconnecter et vérifier lecture des notes et des simulations existantes. Les anciens fichiers OAuth éventuellement présents dans un volume sont inertes et laissés intacts ; aucune purge automatique ni migration n’est exécutée.

## Résultats de validation

Exécutés sous Windows, Node.js **24.19.0**, pnpm **10.11.0** :

| Vérification | Résultat exact |
| --- | --- |
| `pnpm install --lockfile-only --ignore-scripts --offline` via npm exec pnpm 10.11.0 | Sortie 0 ; élagage uniquement, aucune mise à niveau |
| `pnpm install --frozen-lockfile --ignore-scripts --offline` via npm exec pnpm 10.11.0 | Sortie 0 ; verrou conforme, SDK MCP et oidc-provider retirés des dépendances installées |
| `node --test test/server-web.test.js test/report-pdf.test.js` | 11 tests réussis, 0 échec, 0 ignoré ; 4059,9836 ms |
| `npm test` | 62 tests réussis, 0 échec, 0 annulé, 0 ignoré ; 4339,7028 ms ; sortie 0 |
| `npm run lint` | Sortie 0, aucun diagnostic ESLint |
| `npm run build` | Sortie 0 ; Vite 6.4.3, 3577 modules, 7,90 s ; JS principal 1057,31 kB, gzip 311,61 kB |
| `git diff --check` | Sortie 0 ; avertissements de conversion LF/CRLF Windows uniquement |
| Vérification des moteurs et fonctions classiques contre `origin/main` | Aucune différence dans les chemins conservés indiqués ci-dessus |

Les tests HTTP lancent uniquement des processus locaux, avec données synthétiques dans `.notesgym-test-data/web-*`, sans hériter des variables `NOTESGYM_*` de l’opérateur. Ils couvrent les trois configurations HTTPS (origine explicite seule, origine explicite avec proxy de confiance, HTTPS inféré d’un proxy de confiance), connexion/déconnexion, mauvais mot de passe, cookie sécurisé, session, notes, isolation A/B, sauvegarde des simulations et reconnexion après redémarrage. Les fichiers synthétiques `users.json` sont vérifiés **octet pour octet** avant/après : IDs, hashes et sels inchangés. Aucun répertoire OAuth n’est créé.

Les cas négatifs couvrent origines hostiles, origine opaque, downgrade HTTP, requête cross-site, faux Host transmis, en-tête de schéma HTTPS non fiable, quotas et JSON corrompu. Le parcours HTTP local et l’option de cookie sécurisé forcé restent testés. Les anciennes URL retournent 404 en GET/POST et les six routes classiques répondent 200. Le test PDF conserve les systèmes suisse, français et américain, exclusions, semestres et sauts de page.

Les premiers essais complets dans le bac à sable ont échoué sur l’accès aux liens de dépendances pnpm (jsPDF, ESLint et Vite), puis ont réussi hors bac à sable avec autorisation. Le chemin historique du binaire pnpm n’était plus présent ; pnpm 10.11.0 a été invoqué via npm exec. Ces échecs d’environnement ne sont pas comptés comme des réussites. Le build conserve son avertissement de bundle supérieur à 500 kB ; aucune refonte frontend ni nouvel audit de vulnérabilités n’est inclus.

Docker/Compose/ARM64 et Cloudflare/TLS réels n’ont pas été exécutés dans cet environnement (Docker absent). Le proxy est simulé par des requêtes HTTP loopback préservant Host et les en-têtes du navigateur. Aucun compte réel, mot de passe, fichier de données réel, volume de production ou clé n’a été lu ou modifié. Aucun déploiement ni fusion n’est effectué.
