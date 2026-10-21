# Auth v2 — exploitation et validation

Ces commandes sont des instructions pour l’administrateur, à exécuter seulement après revue et autorisation de migration réelle. Aucun déploiement ni accès aux données réelles n’a été effectué par cette refonte. Ne pas supposer que la configuration du dépôt est celle du Raspberry Pi.

## Fonctionnement et choix

Node 24 LTS, SQLite intégré (aucun module SQLite natif à compiler), Nodemailer 10.1.7 pour SMTP. Image `node:24-bookworm-slim` ; architecture ARM64 visée sans dépendance x86. [SQLite Node](https://nodejs.org/docs/latest-v24.x/api/sqlite.html) et [SMTP Nodemailer](https://nodemailer.com/smtp/). Le fichier pnpm verrouille les versions ; le gestionnaire est fixé dans package.json.

Le [rapport d’audit](auth-v2-audit.md) explique l’évaluation de Better Auth et le choix d’un module intégré. Aucun fournisseur obligatoire, aucun nouvel abonnement, aucun conteneur permanent supplémentaire. La mécanique des comptes reste à maintenir et à faire relire indépendamment avant production.

Les mots de passe nouveaux utilisent scrypt asynchrone avec sel aléatoire, N=32768,r=8,p=3,64 octets (64 Mio de plafond mémoire pour le calcul). Ce compromis figure parmi ceux proposés par [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). Les mots de passe historiques sont vérifiés avec leurs paramètres originaux puis leur hachage est renforcé lors d’une connexion réussie ; aucune réinitialisation automatique.

Sessions : 30 jours d’expiration absolue, empreinte SHA-256 d’un secret aléatoire de 256 bits ; cookie HttpOnly, SameSite=Lax, Path=/, Secure si origine HTTPS ou override. Une session survit au redémarrage. Déconnexion révoque la session ; changement/réinitialisation de mot de passe et confirmation d’un changement d’email révoquent toutes les sessions et jetons du compte.

Jetons : 256 bits aléatoires, seule l’empreinte est en base. Vérification/changement email : 24 h. Récupération : 30 min. Usage unique, vérification et consommation en transaction ; un renvoi invalide le précédent lien du même type. Lien en fragment URL pour éviter les logs HTTP, puis retrait du fragment dans le navigateur. Confirmation par bouton POST : un scanner de liens GET ne consomme rien. Après rechargement, rouvrir le lien email si le jeton a disparu.

POST/PATCH/DELETE exigent JSON et vérifient Origin/Fetch Metadata. Aucun CORS permissif. Les clients directs sans Origin restent possibles avec JSON ; les formulaires cross-site simples sont refusés. Les liens et redirections sont construits exclusivement depuis NOTESGYM_PUBLIC_URL. Aucun hôte fourni par le visiteur ne décide du destinataire du lien.

Quotas persistants auth : connexion 20/IP et 20/adresse par 10 min ; autres actions sensibles 10/IP/10 min et envois 3/adresse/heure ; inscription 100/heure globalement. Clés d’adresses et IP hachées. Le plafond de clés et les limites de taille des requêtes bornent le stockage. Une limite API générale en mémoire reste active. Une politique Cloudflare supplémentaire peut être configurée par l’administrateur en cas d’abus important.

Réponse d’inscription identique pour doublon/nouveau compte, détection interne sans doublon. Récupération et renvoi ont une réponse générique. Une erreur « email non vérifié » est donnée seulement après mot de passe correct. Aucune suppression de compte. Paramètres `/account` : statut, mot de passe actuel requis pour modifier mot de passe/email, email nouveau actif après confirmation uniquement.

Les données JSON restent sérialisées par transaction API. SQLite utilise WAL, synchronous=FULL, clés étrangères et transactions BEGIN IMMEDIATE. Une base de verrou séparée `.writer.sqlite` est verrouillée exclusivement pendant toute la vie du serveur/CLI ; le système libère le verrou après panne. Un seul conteneur/processus écrivain par volume local. Pas de réplication, cluster Node ou partage réseau/NFS. L’ancienne version ne connaît pas ce verrou : il faut explicitement l’arrêter avant toute migration.

## Configuration

| Variable | Usage |
| --- | --- |
| `NOTESGYM_DATA_DIR` | `/data` dans Docker, `./data` sinon ; conserver le montage effectif |
| `NOTESGYM_PUBLIC_URL` | Origine exacte, par exemple `https://notesgym.example.org`, sans chemin ; indispensable pour les emails |
| `NOTESGYM_REGISTRATION_ENABLED` | `true` par défaut ; `false` ferme les inscriptions |
| `NOTESGYM_SECURE_COOKIES` | `true` force Secure ; HTTPS public l’active automatiquement |
| `NOTESGYM_TRUST_PROXY` | `false` par défaut ; uniquement avec liste explicite de pairs |
| `NOTESGYM_TRUSTED_PROXY_IPS` | IP/CIDR du proxy direct, pour CF-Connecting-IP ; jamais réseau universel |
| `SMTP_HOST` | Hôte SMTP du fournisseur ou relais existant |
| `SMTP_PORT` | 587 STARTTLS obligatoire, ou 465 TLS implicite |
| `SMTP_USER` | Identifiant SMTP ; vide si relais authentifié autrement |
| `SMTP_PASSWORD` | Secret via environnement, sans préfixe VITE ; préférer le fichier secret |
| `SMTP_PASSWORD_FILE` | Chemin du secret monté, prioritaire sur SMTP_PASSWORD |
| `SMTP_FROM` | Adresse autorisée, éventuellement `NotesGym <adresse@domaine>` |
| `PORT` | 8080 par défaut |

Copier `.env.example` vers `.env` (ignoré Git). Aucun mot de passe réel dans Compose ni dans le frontend. L’ancienne variable NOTESGYM_USERS doit être retirée de l’environnement v2 ; elle n’est plus un mécanisme de création de comptes. Les UUID et hachages viennent exclusivement du JSON validé lors de la migration.

SMTP : utiliser un relais existant accessible au Pi, configurer identifiant et secret, autoriser SMTP_FROM, publier SPF/DKIM/DMARC selon le fournisseur. TLS et validation du certificat obligatoires ; pas d’option de désactivation. Aucun serveur SMTP embarqué. Sans SMTP/origine publique, inscription et demandes de liens retournent 503 pour toutes les adresses ; les comptes historiques autorisés peuvent toujours se connecter. L’application refuse un SMTP mal configuré au démarrage quand les paramètres obligatoires manquent.

Pour un secret Docker, ajouter un fichier Compose local (non versionné, chemin secret hors dépôt), par exemple `compose.smtp.yaml` :

```yaml
services:
  notesgym:
    environment:
      SMTP_PASSWORD: ""
      SMTP_PASSWORD_FILE: /run/secrets/notesgym_smtp_password
    secrets:
      - notesgym_smtp_password
secrets:
  notesgym_smtp_password:
    file: ../notesgym-secrets/smtp-password
```

Utiliser alors `docker compose -f docker-compose.yml -f compose.smtp.yaml ...` pour **toutes** les commandes qui doivent envoyer des emails. Protéger ce fichier secret sur l’hôte. Un échec d’envoi est journalisé par un message générique sans adresse, jeton ou secret. Les messages sont envoyés en arrière-plan en mémoire : une panne peut perdre l’envoi ; le renvoi crée un nouveau lien. Les notifications de changement de mot de passe ne sont pas garanties sans SMTP opérationnel. Tester la réception réelle avant l’ouverture des inscriptions.

Cloudflare Tunnel : origine publique HTTPS explicite recommandée. Le saut HTTP interne conserve des cookies Secure. Pour les limites par visiteur, ne faire confiance qu’à l’IP directe du tunnel et au CF-Connecting-IP reçu de ce pair. Aucun besoin de modifier DNS, tunnel ou ses secrets pour cette refonte. Éviter tout accès direct non contrôlé au port public quand un proxy est supposé fournir l’identité IP.

## Préparation obligatoire de la migration

1. Identifier l’image réellement déployée, le projet Compose et le **nom effectif** du volume (`docker compose config`, `docker inspect` sur les montages). Ne pas publier la sortie, qui peut contenir les anciens secrets.
2. Vérifier que tous les comptes souhaités existent dans users.json. Les comptes uniquement dans NOTESGYM_USERS doivent d’abord être matérialisés par l’ancienne version sur une copie contrôlée. Le CLI v2 ne lit jamais les mots de passe d’environnement.
3. Arrêter les écritures et le conteneur historique ; conserver son image et sa configuration dans un emplacement sécurisé. Faire une sauvegarde externe complète du volume arrêté, avec contrôle d’intégrité. Inclure notes, comptes, simulations et tous les autres fichiers réellement présents.
4. Répéter migration et restauration sur un **volume distinct**. Vérifier deux comptes, notes archivées, métadonnées, exports, simulations et préférences locales sur les appareils habituels. Les sauvegardes internes du CLI ne remplacent pas la sauvegarde externe complète.
5. Choisir la politique historique : `require-verification` exige la preuve email avant accès ; `preserve-access` conserve uniquement l’accès des comptes importés, en affichant « non vérifié ». Les nouveaux comptes restent toujours bloqués avant confirmation. Si certaines adresses historiques ne reçoivent pas de mail, résoudre leur propriété avec l’administrateur ; ne jamais marquer toutes les adresses comme vérifiées par défaut.

Exemple de copie hors ligne, en remplaçant `VOLUME_EXISTANT_VERIFIE` par le nom contrôlé (ne pas changer le volume d’origine) :

```sh
docker volume create notesgym-auth-v2-rehearsal
docker run --rm -v VOLUME_EXISTANT_VERIFIE:/source:ro -v notesgym-auth-v2-rehearsal:/target alpine sh -c 'cd /source && tar cf - . | tar xf - -C /target'
docker build -t notesgym:auth-v2 .
docker run --rm -v notesgym-auth-v2-rehearsal:/data notesgym:auth-v2 node server/migrate-auth.js --data-dir=/data
docker run --rm -v notesgym-auth-v2-rehearsal:/data notesgym:auth-v2 node server/migrate-auth.js --data-dir=/data --apply --legacy-policy=preserve-access
```

Le premier passage est une inspection sans import. Il crée seulement le fichier de verrou SQLite dans la copie. Le second nécessite un choix explicite de politique. Les conteneurs utilitaires sont temporaires ; aucun nouveau service permanent.

## Migration et déploiement autorisés par l’administrateur

Après répétition réussie, sauvegarde restaurée en essai et confirmation de l’administrateur :

```sh
docker compose stop notesgym
docker compose build notesgym
docker compose run --rm --no-deps notesgym node server/migrate-auth.js --data-dir=/data
docker compose run --rm --no-deps notesgym node server/migrate-auth.js --data-dir=/data --apply --legacy-policy=preserve-access
docker compose up -d notesgym
docker compose logs --tail=100 notesgym
```

Remplacer la politique si la vérification immédiate est retenue. Ne jamais supprimer un volume. Conserver exactement le nom du projet Compose et son montage ; sinon Docker peut présenter un volume neuf qui donnerait l’impression d’une perte de comptes. Un volume historique non migré provoque un arrêt explicite, jamais une recréation des comptes.

Le CLI valide les tableaux JSON, UUID, unicité des emails normalisés et des IDs, format scrypt, liens des notes et simulations. Une note orpheline, un propriétaire contradictoire ou un compte dupliqué arrête l’import sans interprétation automatique. Si simulation-settings.json est absent sur une ancienne installation, son absence est enregistrée et le nouveau serveur crée le tableau vide à la première ouverture. Aucun fichier historique existant n’est réécrit.

Avant publication, `auth-v2-backup-…` contient les JSON originaux byte-identiques et un manifeste SHA-256. Le CLI construit une base temporaire, vérifie integrity_check et foreign_key_check, contrôle à nouveau les sources puis publie sans remplacer une base préexistante. Échec avant publication : base active absente, JSON inchangés, sauvegarde conservée ; relancer après résolution. Un passage répété sur les mêmes sources valide les UUID et associations et retourne `already-migrated`. Si les JSON ont changé depuis la migration, le CLI refuse un nouvel import plutôt que fusionner ou écraser la base active.

Les notes historiques gardent created_by dans le JSON. Leur autorisation passe par email_owners, une association réservée à l’UUID importé. Les nouvelles notes portent user_id ; quand ce champ existe, il est prioritaire sans repli vers l’email. Un changement d’email ne modifie jamais les propriétaires des notes/simulations ni les UUID. Une ancienne adresse ne peut pas être réutilisée par un autre compte.

Vérifications de réception : créer un compte synthétique, vérifier son email, récupérer son mot de passe, changer son adresse ; vérifier que l’ancien cookie est révoqué. Vérifier ensuite qu’un utilisateur historique retrouve ses notes, archives, exports, plans, compteurs et préférences. Redémarrer et vérifier une session non révoquée. L’image ARM64 et SMTP réel restent à qualifier sur une **instance de préproduction distincte**, sans utiliser les données réelles pour les tests automatisés.

## Retour arrière sans écrasement aveugle

En cas d’échec de migration avant publication, l’ancienne image peut rouvrir les JSON historiques inchangés après arrêt du CLI et retrait de NOTESGYM_USERS superflu selon sa configuration ; archiver d’abord le résultat et la sauvegarde. La base temporaire est nettoyée par le CLI en cas d’exception normale ; un arrêt électrique peut laisser un staging inactif, qui n’est jamais repris automatiquement.

Après mise en service v2, **ne pas simplement remettre l’ancienne image** : users.json ne contient pas les nouvelles inscriptions ni les changements de mots de passe/emails. Préserver intégralement le volume courant, arrêter v2, restaurer la sauvegarde complète pré-migration dans un **nouveau volume**, vérifier ses empreintes, puis lancer l’ancienne image sur ce volume distinct et sa configuration historique. Conserver les deux volumes. Toute donnée créée après la sauvegarde doit être rapprochée et réimportée par une procédure revue ; aucune suppression ou fusion automatique n’est fournie.

Un override Compose permet de sélectionner le volume restauré sans toucher à l’original :

```yaml
volumes:
  notesgym-data:
    external: true
    name: NOM_DU_VOLUME_RESTAURE_VERIFIE
```

Tester la restauration sur une instance isolée avant de l’utiliser réellement. Les paramètres de simulation stockés dans les navigateurs ne font pas partie du volume serveur : conserver également les profils navigateurs concernés et leurs anciennes clés UUID. Aucun identifiant utilisateur n’est régénéré par le CLI.

## Tests et limites

```sh
pnpm test
pnpm run test:auth
pnpm run build
node node_modules/eslint/bin/eslint.js server.js server src/components/auth src/components/LoginScreen.jsx src/components/menu/MenuHome.jsx
git diff --check
```

Les tests auth utilisent exclusivement `.notesgym-test-data` et un transport email capturé, sans compte ni email réel. Ils couvrent validation, doublons, vérification/renvoi/expiration/réutilisation, connexion/déconnexion, cookies HTTPS/proxy, CSRF, quotas persistants, sessions persistantes/révoquées, mots de passe, changement email et concurrence, isolation notes/simulations, conservation byte-identique des sources, import répété, refus des données ambiguës, échec injecté et restauration dans un répertoire distinct, reprise du processus serveur. Les tests métier existants restent exécutés.

Limites : 2FA/TOTP non implémentée (ajout futur d’une table de facteurs par UUID et challenge avant session) ; pas de suppression de compte ni de fusion/récupération administrative automatisée ; aucune migration des données JSON métier en SQLite ; un seul écrivain par volume local ; emails sans file durable de reprise ; pas de garantie de délivrabilité sans qualification du relais ; pas encore de validation matérielle Pi/ARM64 dans cet environnement sans Docker. Les adresses anciennes restent réservées intentionnellement. Les durées et quotas sont des constantes explicites ; les ajuster demande une revue et des tests.

## Résultats locaux du 21 octobre 2026

- `node --test` : **80 tests réussis, 0 échec**, environ 19,4 s (le total du runner inclut le chargement du module de fixtures).
- Build Vite : réussi, 3579 modules. Avertissement de taille du bundle >500 ko ; pas d’erreur de compilation.
- ESLint ciblé sur serveur et nouveaux composants : réussi ; `git diff --check` : réussi.
- `scripts/check-auth-browser.mjs` avec Playwright et Edge headless : réussi à **390×844 et 1440×1000**, aucune erreur JavaScript, page compte sans débordement horizontal. Contrôle visuel de la capture mobile effectué. Vérification/réutilisation des liens, connexion, erreurs, compte, déconnexion et reset réels sur serveur local ; refus SMTP absent également vérifié.
- `scripts/check-account-sync-browser.mjs` : réussi ; import des plans locaux, deux appareils, modifications rapides, décrément unique après nouvelle note, isolation des comptes, erreur d’enregistrement et reprise, idempotence après perte d’accusé de réception.
- SMTP : configuration TLS/secret et modèles testés avec transport capturé ; aucune livraison réelle effectuée.
- Docker/ARM64 : non exécuté, Docker absent de cet environnement ; aucun déploiement, aucune migration réelle.

Le test navigateur est facultatif pour l’exécution de la suite Node et utilise un Playwright disponible dans l’environnement (pas de dépendance navigateur imposée au serveur) :

```sh
node scripts/check-auth-browser.mjs CHEMIN_VERS_PLAYWRIGHT_INDEX_MJS msedge
node scripts/check-account-sync-browser.mjs CHEMIN_VERS_PLAYWRIGHT_INDEX_MJS msedge
```

Omettre `msedge` si Chromium Playwright est installé. Captures uniquement dans `.notesgym-test-data`, ignoré par Git. Aucun test ne doit pointer vers un serveur réel.

## Fichiers livrés

| Groupe | Fichiers créés ou modifiés |
| --- | --- |
| Backend | `server.js`, `server/auth-store.js`, `server/auth.js`, `server/data-lock.js`, `server/mailer.js`, `server/migrate-auth.js` |
| React | `src/App.jsx`, `src/api/base44Client.js`, `src/lib/AuthContext.jsx`, `src/lib/NavigationTracker.jsx`, `src/components/LoginScreen.jsx`, `src/components/auth/AuthScreen.jsx`, `src/components/auth/AccountScreen.jsx`, `src/components/menu/MenuHome.jsx` |
| Docker/configuration | `Dockerfile`, `docker-compose.yml`, `.env.example`, `package.json`, `pnpm-lock.yaml` |
| Tests/QA | `test/auth-v2.test.js`, `test/helpers/legacy-fixture.js`, `test/server-web.test.js`, `test/account-simulation-api.test.js`, `scripts/check-auth-browser.mjs`, `scripts/check-account-sync-browser.mjs` |
| Documentation | `README.md`, `docs/auth-v2-audit.md`, `docs/auth-v2-deployment.md` |

Les pages notes/dashboard/statistiques/insights et les algorithmes analytiques ne sont pas modifiés. La seule entrée ajoutée au menu ouvre `/account`.
