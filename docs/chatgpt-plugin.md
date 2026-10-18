# NotesGym × ChatGPT — V1.1, tests externes contrôlés

État : intégration stabilisée et testée localement, **configuration externe et essai réel dans ChatGPT encore nécessaires**. Publication publique bloquée. Aucun déploiement, aucune soumission OpenAI et aucune migration de données réelles ne sont effectués. Le travail continue sur `feature/chatgpt-mcp`, PR #20. Consulter les [résultats exacts](chatgpt-validation.md), [l’analyse des 50 avis initiaux](chatgpt-vulnerabilities.md) et la [checklist externe](chatgpt-external-tests.md).

## 1. Architecture et audit

L’audit de `server.js`, `src/api/base44Client.js`, `src/lib/AuthContext.jsx`, `src/lib/analytics/`, `src/lib/lab/`, `src/pages/Insights.jsx`, des tests et des fichiers Docker confirme :

- API `/api/notes` GET/POST et `/api/notes/:id` PATCH/DELETE, plus archivage, exclusions et paramètres de simulation par compte.
- Authentification par cookie HttpOnly et sessions dans une `Map` en mémoire ; mot de passe haché avec scrypt et sel propre à chaque compte.
- Fichiers JSON `users.json`, `notes.json`, `simulation-settings.json`. Les notes sont isolées par `created_by === user.email` ; les paramètres de simulation par identifiant interne de compte.
- L’API de simulation possède déjà une transaction sérialisée. L’ancienne file générale ne sérialisait que l’écriture finale : deux créations de notes pouvaient lire le même instantané et perdre une mise à jour.
- Insights utilise `analyzeSemester` et `generateInsights`. Les moteurs de projection et backtesting existent et sont testés. Certains choix de correspondance historique sont toutefois conservés dans le navigateur.

La V1 ajoute trois modules :

| Module | Rôle |
| --- | --- |
| `integration/grade-service.js` | Schémas Zod stricts, filtres, minimisation et appels directs au moteur existant |
| `integration/chatgpt.js` | SDK MCP officiel, transport Streamable HTTP sans état de session MCP, serveur OAuth `oidc-provider` |
| `integration/security.js` | Limites de requêtes, contrôle d’origine, rate limiting borné et en-têtes HTTP |
| `integration/oauth-store.js` | Adaptateur SQLite officiel de cycle de vie oidc-provider, transactions, index et payloads chiffrés |
| `integration/oauth-config.js`, `oauth-keys.js`, `preflight.js` | Configuration commune, clés persistantes et vérification préalable hors réseau |

Le serveur HTTP existant monte `/mcp`, `/oauth/*` et `/chatgpt` uniquement lorsque `NOTESGYM_MCP_ENABLED=true`. Aucune formule scolaire existante n’a été modifiée. L’interface reçoit seulement un lien « NotesGym × ChatGPT » dans son menu. L’application habituelle reste disponible lorsque MCP est désactivé.

OAuth et MCP partagent volontairement un processus avec NotesGym : la résolution du compte réutilise la session existante sans exposer une API interne supplémentaire, ni partager un volume JSON entre plusieurs écrivains. Le fichier Compose MCP lance une **instance de test indépendante**, avec son propre volume. Un futur découpage en services devra passer par un stockage transactionnel ou une API interne authentifiée ; il ne faut pas monter le même JSON dans deux serveurs écrivains.

## 2. Fonctionnalités disponibles

Tous les outils ont des entrées/sorties strictes, `readOnlyHint=true`, `destructiveHint=false`, `idempotentHint=true`, `openWorldHint=false`, et exigent `notes:read`.

| Outil | Résultat et limites |
| --- | --- |
| `get_grades` | Filtres `year`, `semester`, `subject`, `include_archived`, `include_excluded` ; `offset` de 0 à 100000 et `limit` de 1 à 100, défaut 25 ; total et prochain offset |
| `get_subjects` | Moyenne pondérée par matière, nombre d’évaluations et coefficient moyen des évaluations retenues ; ce coefficient n’est pas un coefficient de branche |
| `get_overview` | Moyenne du moteur Insights, tendance, volatilité, confiance, matières extrêmes et compensation GBJB calculée par le moteur existant |
| `analyze_subject` | Moyenne, évolution récente, tendance, volatilité et anomalie lorsque le moteur dispose de suffisamment d’observations |
| `simulate_grade` | 1 à 20 notes hypothétiques de 1 à 6, coefficients positifs ≤ 100 ; année et semestre obligatoires ; aucune écriture |
| `get_insights` | Insights réels et éléments numériques justificatifs ; titres/descriptions sous forme des clés de traduction existantes |

Les calculs excluent les archives, les évaluations exclues et les matières hors bulletin. `get_grades` peut inclure explicitement les exclusions ; tous les outils d’analyse acceptent `include_archived=true` pour une analyse historique volontaire. Aucun calcul ne réintègre automatiquement les archives. Une chaîne d’année reste un libellé libre. Les résultats ne font pas une décision officielle de promotion.

La politique de période est commune aux six outils. Par défaut, une année et un semestre ne sont inférés que s’il existe une seule période active non exclue compatible avec les filtres explicites. Si plusieurs périodes restent possibles, `PERIOD_REQUIRED` retourne jusqu’à 100 `availablePeriods` et `truncated` ; ChatGPT doit demander une précision, sans moyenne globale silencieuse. Chaque résultat réussi contient le champ `period` sélectionné. Le choix ne dépend ni du classement alphabétique des années ni d’une date arbitraire.

- Période précise : `{"year":"2026","semester":"Semestre 1"}`.
- Année entière, semestres combinés explicitement : `{"scope":"year","year":"2026"}`.
- Historique multi-années explicite : `{"scope":"history","years":["2024","2025"],"include_archived":true}`. Au moins deux années distinctes sont requises ; ne pas combiner `year` et `years`. Un semestre peut limiter cet historique.
- `simulate_grade` exige toujours `year` et `semester` ; aucune hypothèse n’est ajoutée à une autre période.

Les moyennes renvoient la précision du moteur ; l’interface Insights les affiche à deux décimales. La compensation conserve l’arrondi à la demi-note de `calculateCompensation`. Une tendance « insufficient » et une moyenne `null` sont des résultats valides. Les catégories de confiance fondées sur l’effectif ne sont pas des probabilités.

`get_predictions` est intentionnellement absent. Les simulations annuelles enregistrées et le rapprochement historique côté navigateur ne sont pas exposés. Pour ajouter cet outil, définir et persister ses hypothèses côté compte, contrôler la correspondance avec l’écran et tester l’isolation des paramètres et prédictions. Aucun résultat fictif n’est retourné à sa place.

Les notes renvoyées ne contiennent ni email, ni `created_by`, ni commentaire, ni titre d’évaluation. Les sorties sont plafonnées à 64 Kio ; les analyses portent sur au plus 10000 notes après filtrage et 200 matières en sortie. Les erreurs de calcul sont des résultats MCP `isError` avec un objet JSON `{error:{code,message}}` dans le contenu ; les requêtes MCP invalides produisent les erreurs JSON-RPC du SDK.

## 3. Prérequis

Utiliser Node.js 24 pour la pile MCP et pnpm 10.11.0. Le serveur NotesGym traditionnel conserve son image Node 20 ; les dépendances OAuth sont chargées uniquement si l’intégration est activée. Docker n’est pas nécessaire pour les tests automatisés.

La V1.1 n’utilise pas l’API de génération OpenAI et ne demande aucune clé API OpenAI. Elle nécessite des clés OAuth persistantes, des comptes de test et des URI de retour explicitement enregistrées. Node 24 fournit SQLite nativement : pas de compilation d’un module SQLite npm pour ARM64. Les sessions, autorisations et jetons OAuth survivent désormais aux redémarrages dans leurs durées de validité. Le mode production est techniquement autorisé uniquement avec activation explicite, origine HTTPS, proxy déclaré et configuration valide ; cela ne vaut pas autorisation de déploiement ou validation publique.

## 4. Lancement local

Ne pas utiliser le volume ou le dossier de données de production. Depuis la branche de travail :

```sh
corepack pnpm@10.11.0 install --frozen-lockfile
cp .env.example .env.mcp.local
node scripts/chatgpt-dev-keys.mjs >> .env.mcp.local
```

Sous PowerShell, utiliser `Copy-Item .env.example .env.mcp.local`, puis `node scripts/chatgpt-dev-keys.mjs | Add-Content -Encoding utf8 .env.mcp.local`. L’exécution du générateur sans redirection affiche des clés : **ne pas copier cette sortie dans une conversation ou un ticket**. Le fichier `.env.mcp.local` est ignoré par Git et Docker.

Cette ancienne configuration reste compatible. Pour une nouvelle instance, préférer une création explicite, une seule fois : `node scripts/chatgpt-dev-keys.mjs --file .notesgym-test-data/manual-mcp/oauth/keys.json`. Le fichier est créé en mode 0600 et n’est jamais écrasé. Définir `NOTESGYM_OAUTH_KEYS_FILE` vers ce fichier et laisser les deux variables de clés historiques vides. Le démarrage ne génère aucune clé. Sous Windows, protéger le fichier et le dossier par ACL ; les modes Unix ne remplacent pas cette vérification.

Renseigner dans ce fichier un compte jetable avec `NOTESGYM_USERS=email_de_test:mot_de_passe_local`, mettre `NOTESGYM_MCP_ENABLED=true`, et garder le dossier de test indiqué dans l’exemple. Aucun compte de démonstration ni mot de passe public n’est créé dans le dépôt. Un compte déjà présent n’est ni réinitialisé ni modifié par `NOTESGYM_USERS`.

```sh
corepack pnpm@10.11.0 run build
node --env-file=.env.mcp.local server.js
```

Se connecter à `http://localhost:8080`, puis ouvrir `/chatgpt`. Un client MCP local doit utiliser ce même hostname, car le contrôle Host est strict. Le test automatisé réalise entièrement le flux OAuth et les appels SDK :

```sh
node --test test/chatgpt-mcp.test.js
```

## 5. Authentification et isolation

La ressource canonique est `${NOTESGYM_PUBLIC_URL}/mcp`, l’issuer `${NOTESGYM_PUBLIC_URL}/oauth`. L’URL de base doit être une origine sans chemin, identifiants, requête ou fragment.

Les endpoints de découverte sont :

- `/.well-known/oauth-protected-resource/mcp` et `/.well-known/oauth-protected-resource` : ressource, issuer et scope.
- `/.well-known/oauth-authorization-server/oauth` : métadonnées RFC 8414 pour l’issuer avec chemin.
- `/oauth/.well-known/openid-configuration` : découverte OIDC du fournisseur.
- `/oauth/auth`, `/oauth/token`, `/oauth/token/revocation` : endpoints fournis par la bibliothèque.

Le client utilise Authorization Code avec PKCE S256 obligatoire. La bibliothèque vérifie le code à usage unique, son expiration, le client, le vérificateur PKCE et l’URI de retour exacte. `resource` doit correspondre à la ressource canonique. Seuls des clients publics préenregistrés avec `token_endpoint_auth_method=none` sont acceptés ; ni implicit grant, ni client credentials, ni refresh token ne sont activés. DCR et CIMD ne sont pas annoncés.

Sur la page de consentement, l’utilisateur se connecte d’abord à NotesGym dans un autre onglet, recharge la page, vérifie le compte/client et autorise ou refuse. La session NotesGym authentifie uniquement cette interaction ; elle ne permet pas d’appeler MCP. Le consentement utilise un formulaire CSRF aléatoire, à usage unique, lié à la session, au compte, à l’interaction et au chemin, expirant après cinq minutes. Les valeurs rendues sont échappées ; la page interdit les scripts et l’inclusion en iframe.

Les jetons MCP sont opaques, indépendants des cookies et résolus par l’adaptateur SQLite de l’issuer. Chaque requête vérifie existence, expiration, audience exacte, scope, grant encore valide, concordance compte/client entre grant et jeton, client encore configuré et existence du compte. L’identifiant interne vient exclusivement du jeton ; le serveur retrouve l’email actuel du compte et charge uniquement ses notes. Aucun `userId`, email ou identifiant de compte n’est accepté dans les arguments des outils.

Le code d’autorisation expire après 60 secondes ; un jeton après 600 secondes au maximum ; une autorisation/session OAuth après une heure. `NOTESGYM_OAUTH_ACCESS_TTL_SECONDS` permet uniquement de réduire le TTL à un entier de 1 à 600. Les formulaires CSRF, transitoires, doivent être rechargés après un redémarrage ; les sessions navigateur NotesGym restent en mémoire comme auparavant, indépendamment des sessions OAuth persistantes.

`NOTESGYM_OAUTH_DB` désigne par défaut `NOTESGYM_DATA_DIR/oauth/oauth.sqlite`. Ce fichier ne contient aucune note. L’adaptateur utilise des transactions `BEGIN IMMEDIATE`, WAL, `synchronous=FULL`, une clé primaire `(model,id_hash)`, des contraintes d’unicité pour UID et userCode, des index de grant/compte/client/expiration et une consommation atomique. La révocation d’un compte supprime ses grants et leurs artefacts dans une transaction ; la révocation d’un jeton utilise le mécanisme de la bibliothèque. Les lectures refusent les enregistrements expirés ; nettoyage au démarrage et chaque minute ; plafond de 100000 enregistrements.

Les payloads sont chiffrés AES-256-GCM avec données associées modèle/identifiant ; les index d’identifiants sont hachés. La clé de chiffrement est dérivée avec séparation de domaine de la première clé de cookie. Les fichiers sont privés (0600), le dossier OAuth privé (0700), avec refus des permissions trop larges et des liens symboliques directs sur Unix. La base est liée par empreinte à l’issuer, au JWKS et aux clés de cookies : un changement accidentel arrête le démarrage. Restaurer les mêmes clés et la même origine ; ne pas régénérer pour contourner l’erreur. La rotation volontaire devra être planifiée avec révocation/reconnexion et sauvegardes cohérentes, pas par remplacement automatique.

Les métadonnées n’annoncent pas de scope email ; les comptes existants n’ayant pas de preuve de vérification d’email, aucune assertion `email_verified=true` n’est inventée. La compatibilité avec les restrictions de domaine des espaces Enterprise reste à compléter.

## 6. Docker et Raspberry Pi 5

Le Compose existant reste inchangé. Une pile séparée utilise Node 24, un utilisateur non root, un système de fichiers en lecture seule et un volume de test dédié :

```sh
docker compose -f docker-compose.mcp.yml up --build
```

Pour cette commande, configurer dans `.env.mcp.local` : `NOTESGYM_PUBLIC_URL=http://localhost:8081`, un client dont la redirection correspond réellement au client de test, et `NOTESGYM_MCP_ENABLED=true`. Le port interne reste 8080 et le port hôte 8081. La variable de dossier est remplacée par `/data`. Utiliser exactement `localhost` pour les requêtes si c’est l’origine configurée.

Le choix des images Alpine Node officielles permet un build ARM64 sur Raspberry Pi 5 64 bits ; ce build n’a pas été exécuté ici. Pas de conteneur Cloudflare démarré automatiquement. Pas de partage de volume avec la production, pas de réplica et pas de second serveur sur le même dossier. Arrêter avec `docker compose -f docker-compose.mcp.yml down`, sans suppression de volume.

L’image V1.1 ajoute un healthcheck sur `/api/health`, qui vérifie aussi l’intégrité rapide de SQLite quand MCP est activé. Elle initialise `/data/oauth` pour l’UID 1000, en mode 0700, et conserve WAL et base dans le volume dédié. Ne pas utiliser chmod 777 pour résoudre un problème de volume. Pour créer un fichier de clés dans le volume de test : `docker compose -f docker-compose.mcp.yml run --rm notesgym-chatgpt node scripts/chatgpt-dev-keys.mjs --file /data/oauth/keys.json`, avant le premier démarrage ; renseigner ensuite le chemin interne dans l’environnement. La commande refuse un fichier existant.

Pour sélectionner explicitement le mode de runtime avec Compose, définir `NOTESGYM_RUNTIME_MODE=production` dans le fichier puis utiliser `docker compose --env-file .env.mcp.local -f docker-compose.mcp.yml ...` afin que cette variable soit interpolée. Le défaut reste development. Le passage à production exige aussi HTTPS et proxy de confiance ; aucune commande up de production n’a été exécutée.

## 7. Exposition HTTPS

Pour un test externe futur, créer une origine HTTPS réelle et stable. Aucun domaine NotesGym MCP ni DNS n’est supposé disponible. Configurer le tunnel vers l’instance de test, puis adapter `NOTESGYM_PUBLIC_URL`, les URI de retour et les métadonnées du paquet. Les cookies sont automatiquement Secure pour une origine HTTPS ; conserver aussi `NOTESGYM_SECURE_COOKIES=true`. L’origine doit être choisie avant de lier la base OAuth : changer d’origine ensuite nécessite une procédure de nouvelle instance OAuth, sans modification des notes.

`NOTESGYM_TRUST_PROXY=true` exige maintenant `NOTESGYM_TRUSTED_PROXY_IPS` (IPs exactes ou CIDRs explicites, jamais /0). Les routes d’intégration refusent un pair hors liste et un `X-Forwarded-Proto` différent de https pour l’origine HTTPS. Le Host doit correspondre à l’origine ; le forwarded host est normalisé côté serveur. Le rate limiting accepte `CF-Connecting-IP` uniquement depuis ces pairs de confiance et valide qu’il s’agit d’une seule IP. Un client direct ne peut pas changer son quota avec un en-tête forgé. L’origine réseau doit rester inaccessible directement et le proxy/tunnel doit écraser les en-têtes de client, particulièrement si des workers/proxies intermédiaires sont ajoutés. Prévoir aussi une limite globale au proxy ; les compteurs applicatifs restent volatils.

Le contrôle Host attend l’hôte public configuré. Le client MCP distant fonctionne côté serveur sans Origin ; toute Origin présente doit correspondre à celle du serveur. Un outil de développement web tiers nécessitera un proxy local approprié ou une future liste d’origines explicitement autorisées, sans désactiver le contrôle global.

Le tunnel et le proxy doivent supporter POST et les réponses MCP, ne pas mettre en cache les routes authentifiées et ne pas enregistrer les corps, cookies, Authorization ou paramètres de requêtes OAuth. Prévoir TLS, HSTS au proxy, limites de connexions, limitation par IP fiable et traitement des certificats clients OpenAI si requis lors de la soumission. Rien de cela n’a été activé sur une infrastructure publique dans cette mission.

## 8. Test dans ChatGPT

La documentation actuelle décrit l’ajout d’un serveur MCP personnalisé dans les paramètres Plugins. Ce parcours requiert un compte/espace compatible et un endpoint HTTPS joignable ; localhost suffit au SDK local, pas à un client ChatGPT distant.

1. Préparer une instance isolée avec deux comptes ne contenant que des données synthétiques.
2. Créer une connexion MCP personnalisée vers son URL réelle `/mcp`, en mode OAuth avec client fourni.
3. Copier **exactement** l’URI de callback affichée par le gestionnaire OpenAI dans `NOTESGYM_OAUTH_CLIENTS`. Ne pas recopier un ancien callback trouvé dans un exemple. Les identifiants sont publics, aucun secret client n’est nécessaire pour cette V1 PKCE.
4. Recharger la configuration du serveur, lancer la connexion, se connecter à NotesGym dans un autre onglet et confirmer le consentement.
5. Examiner les six outils découverts ; vérifier les annotations de lecture seule et les résultats contre l’écran Insights sur la même période.
6. Tester avec chacun des deux comptes, une révocation et une reconnexion. N’introduire aucune donnée réelle de mineur dans ce scénario.

Exemples : « Affiche mes notes de Math pour 2026, Semestre 1 », « Explique les éléments numériques de mes insights », « Simule un 5 coefficient 2 en Math pour 2026, Semestre 1, sans enregistrer » ; anglais : « Show my subject trends for the school year I specify ».

Ce parcours ChatGPT n’a pas encore été exécuté ; les tests automatisés utilisent un client du SDK MCP officiel et des échanges OAuth HTTP réels.

## 9. Connexion, révocation et confidentialité

Le lien « NotesGym × ChatGPT » du menu ouvre `/chatgpt` et permet de révoquer toutes les autorisations du compte connecté dans l’instance. La suppression des grants et des jetons invalide les requêtes suivantes sans attendre leur expiration. Un autre utilisateur reste connecté. Le endpoint de révocation OAuth peut également invalider un jeton individuel. Se déconnecter de la session NotesGym ne révoque pas à lui seul une autorisation OAuth déjà accordée.

Éléments préparatoires à une politique de confidentialité, à faire valider et publier avec des coordonnées réelles :

- Finalité : consultation des résultats scolaires et calculs à la demande, sans écriture par MCP.
- Données transmises : notes sélectionnées, matières, coefficients, dates, périodes, indicateurs d’exclusion, identifiants de notes et agrégats ; aucun email/commentaire/titre d’évaluation dans les outils.
- Autorisation : consentement explicite `notes:read`, possibilité de refus et révocation dans NotesGym. Le formulaire local affiche l’email uniquement pour vérifier le compte.
- Conservation serveur : fichiers scolaires déjà existants ; OAuth chiffré et persistant avec expirations décrites ci-dessus ; aucun journal de notes ou jetons ajouté. Les sauvegardes OAuth doivent avoir une rétention limitée et être protégées avec leurs clés séparées. Le compte utilisateur reste dans le stockage NotesGym habituel.
- Destinataires : client MCP choisi, potentiellement OpenAI lors d’une connexion ChatGPT ; Cloudflare et hébergeur si utilisés. Leurs conditions de traitement/conservation doivent être expliquées. Une révocation n’efface pas les résultats déjà transmis à une conversation.
- À définir : responsable et contact, base légale, droits et traitement des demandes d’effacement/export, consentement parental selon les situations, durées des sauvegardes/logs, pays et transferts, sous-traitants et analyse adaptée aux mineurs. Ce texte technique ne constitue pas une politique publiée.

## 10. Publication officielle et packaging

Les sources officielles consultées pour cette implémentation sont [Plugins](https://developers.openai.com/plugins), [authentification](https://developers.openai.com/plugins/build/auth), [packaging](https://developers.openai.com/plugins/build/plugins), [soumission](https://developers.openai.com/plugins/deploy/submission) et [revue MCP](https://developers.openai.com/plugins/deploy/app-review). Le contrat protocolaire est décrit par la [spécification MCP d’autorisation](https://modelcontextprotocol.io/specification/latest/basic/authorization) et l’implémentation OAuth par la [documentation oidc-provider](https://github.com/panva/node-oidc-provider/blob/main/docs/README.md).

`plugin/notesgym/` contient les manifests portables `plugin.json` et `mcp.json`, le nom public NotesGym, les descriptions française/anglaise et des prompts. L’URL est locale et volontairement inutilisable comme soumission publique. Le logo existant peut être réutilisé. Aucune capture artificielle, URL de politique fictive, identité vérifiée ou approbation n’est annoncée.

Avant toute soumission :

- [x] Adapter OAuth à SQLite, tester expirations, isolation compte/client, sauvegarde/restauration, consommation et révocation après redémarrages ; lever le blocage technique uniquement sous configuration HTTPS/proxy explicite.
- [x] Analyser les 50 avis : 48 corrigés/retirés, deux résiduels dans le build, zéro avis connu dans l’audit --prod.
- [ ] Réaliser la revue de sécurité de l’application, des permissions réelles sur Pi, du proxy et de la rotation volontaire des clés ; suivre les avis résiduels.
- [ ] Déployer avec autorisation sur une origine HTTPS stable, vérifier son domaine et sa disponibilité, mesurer les ressources sur ARM64.
- [ ] Tester réellement ChatGPT, les callbacks exacts et la méthode de client préenregistré proposée par le portail ; compléter CIMD/DCR uniquement si nécessaire.
- [ ] Compléter la vérification d’email et UserInfo si les exigences de l’espace visé l’imposent.
- [ ] Renseigner l’identité développeur vérifiée, les permissions de gestion OpenAI, contacts, confidentialité publique, conditions, pays de disponibilité et éléments de revue réels.
- [ ] Fournir à l’équipe de revue un compte de démonstration synthétique, son mode de connexion et ses identifiants par le mécanisme privé du portail ; jamais dans Git.
- [ ] Remplacer l’endpoint local dans le paquet, vérifier les schemas officiels et le scan du portail, préparer un ZIP propre sans secrets.
- [ ] Exécuter les scénarios ci-dessous et enregistrer les résultats réels.
- [ ] Obtenir l’autorisation explicite du propriétaire avant soumission, puis avant publication. Ne pas confondre création d’un brouillon GitHub et soumission OpenAI.

## 11. Validation, stockage et limites restantes

Scénarios automatisés dans `test/chatgpt-mcp.test.js` :

| Positifs | Négatifs |
| --- | --- |
| Échange réel code + PKCE, découverte et appels SDK | Anonyme, faux jeton, jeton d’un autre issuer, jeton expiré |
| Moyennes identiques au moteur Insights, compensation et exclusions | Scope insuffisant, audience incorrecte, callback non enregistré, PKCE absent/incorrect |
| Deux utilisateurs, résultats et insights séparés | Tentative `userId` dans les arguments, pagination invalide, méthode MCP inconnue, JSON invalide |
| Simulation sans changement du fichier notes | CSRF de révocation invalide, origine hostile, requête > 64 Kio, note hors 1–6 |
| Révocation du compte A avec maintien de B | Rejeu du code et jeton révoqué |
| 20 créations concurrentes et modifications de champs distincts préservées | Limitation des tentatives de connexion, refus d’un mode production sans activation/HTTPS/proxy |

Les tests créent uniquement des données synthétiques sous `.notesgym-test-data`, ignoré par Git. La suite historique couvre aussi simulations, backtesting, archives, exclusions et isolation des paramètres de simulation. Aucune prédiction MCP n’étant exposée, il n’y a pas de test de prédiction MCP à annoncer.

Le stockage scolaire JSON est conservé sans migration : toutes les transactions API sont sérialisées dans un seul processus, écriture atomique par renommage, synchronisation du fichier temporaire et mode de création 0600. La lecture d’un fichier corrompu échoue au lieu de remplacer silencieusement ses données par un tableau vide. Les sessions expirées sont purgées et leur nombre borné. Les limites sont 64 Kio par requête applicative, 20 connexions/10 minutes/IP, 600 requêtes API/minute/IP et 120 requêtes d’intégration/minute/IP. L’IP est celle de la connexion, ou celle transmise par le proxy explicitement autorisé selon la section 7. La bibliothèque borne aussi son parsing OAuth.

Les API de mutation refusent les origines tierces et `Sec-Fetch-Site: cross-site`. Les cookies de session ajoutent Secure si l’origine configurée est HTTPS ou avec `NOTESGYM_SECURE_COOKIES=true` ; les instances locales HTTP existantes restent utilisables. En hébergement public, configurer impérativement HTTPS. Des en-têtes anti-sniffing, anti-framing et de minimisation du Referer sont ajoutés. Les erreurs internes ne divulguent plus les messages du système de fichiers. Les nouvelles notes sont validées sur l’échelle suisse 1–6 ; les anciens fichiers ne sont pas réécrits pour normaliser d’anciennes valeurs. Les sauvegardes restent indispensables : un renommage atomique ne remplace pas une stratégie de reprise après panne matérielle.

SQLite concerne uniquement les nouveaux enregistrements OAuth. Aucune migration des trois JSON scolaires n’est introduite. Leur éventuelle migration future devra conserver sauvegardes, validation et retour arrière comme décrit dans l’audit initial. Un seul processus écrivain NotesGym par volume reste obligatoire, même si l’adaptateur OAuth est transactionnel.

Résultats et limites d’exécution sont consignés dans [chatgpt-validation.md](chatgpt-validation.md). Docker/ARM64, tunnel, mTLS, navigateur réel et portail OpenAI n’ont pas été validés ici. La V1.1 est destinée aux tests contrôlés avec comptes synthétiques ; elle n’est pas prête pour publication publique.

## 12. Préflight, sauvegarde et restauration

`node --env-file=.env.mcp.local scripts/chatgpt-preflight.mjs` contrôle la configuration locale. Ajouter `--external` exige HTTPS, proxy explicite et callbacks HTTPS. Le script ne contacte aucun domaine, ne démarre aucun serveur/tunnel et n’initialise pas de base ; si une base existe, il la contrôle en lecture seule, y compris son empreinte de clés/issuer. Il n’affiche aucune clé ni compte. Un succès valide la configuration locale, pas le DNS, le certificat ou la connexion réelle de ChatGPT.

La sauvegarde SQLite doit utiliser l’API de backup, jamais une copie isolée du .sqlite pendant que WAL est actif : `node scripts/chatgpt-oauth-backup.mjs SOURCE.sqlite NOUVELLE_SAUVEGARDE.sqlite`. La destination doit être nouvelle et privée ; l’outil refuse l’écrasement. Copier les clés persistantes séparément dans un stockage protégé, et sauvegarder les JSON scolaires avec une procédure cohérente, sans les modifier.

Restauration sur une **instance de test arrêtée** : conserver l’état courant complet dans un emplacement de quarantaine, restaurer la sauvegarde dans un dossier neuf privé (0700, fichier 0600, UID 1000 en Docker), utiliser exactement les mêmes clés et issuer. Ne pas mélanger les anciens fichiers WAL/SHM avec la base restaurée. Restaurer des JSON de test cohérents si nécessaire ; aucun fichier réel dans cette procédure.

Une ancienne sauvegarde peut contenir des autorisations révoquées depuis sa création. Avant de rouvrir l’instance restaurée, invalider les seuls enregistrements OAuth avec `node --env-file=.env.mcp.local scripts/chatgpt-oauth-invalidate.mjs --all-authorizations`, puis refaire le préflight et reconnecter les comptes. Cette commande exige un drapeau explicite et ne touche ni les comptes scolaires ni les notes. Le test de restauration vérifie la récupération de l’état chiffré et cette invalidation.

Une rotation de clés ou un changement de domaine volontaire ne se traite pas en éditant les secrets puis en espérant récupérer les anciens grants. Sauvegarder, révoquer les autorisations, préparer une nouvelle base OAuth et de nouvelles clés explicitement, puis demander une reconnexion ; conserver l’ancien ensemble pour un retour arrière contrôlé. Aucun automatisme de rotation ou migration de production n’est lancé ici.
