# NotesGym × ChatGPT — V1 de test

État : intégration locale fonctionnelle, **publication publique bloquée**. Aucun déploiement, aucune soumission OpenAI et aucune migration de données réelles ne sont effectués. La branche `feature/chatgpt-mcp` a été créée depuis `origin/main` après `git fetch origin main`, avec un répertoire de travail initialement propre.

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

Les calculs excluent les archives, les évaluations exclues et les matières hors bulletin. `get_grades` peut inclure explicitement ces données. Aucun calcul ne réintègre automatiquement les archives. Sans filtre année/semestre, les outils agrègent les données actives de toutes les périodes : demander une période pour une interprétation scolaire précise. Une chaîne d’année est un libellé libre, comme dans NotesGym. Les résultats ne font pas une décision officielle de promotion.

Les moyennes renvoient la précision du moteur ; l’interface Insights les affiche à deux décimales. La compensation conserve l’arrondi à la demi-note de `calculateCompensation`. Une tendance « insufficient » et une moyenne `null` sont des résultats valides. Les catégories de confiance fondées sur l’effectif ne sont pas des probabilités.

`get_predictions` est intentionnellement absent. Les simulations annuelles enregistrées et le rapprochement historique côté navigateur ne sont pas exposés. Pour ajouter cet outil, définir et persister ses hypothèses côté compte, contrôler la correspondance avec l’écran et tester l’isolation des paramètres et prédictions. Aucun résultat fictif n’est retourné à sa place.

Les notes renvoyées ne contiennent ni email, ni `created_by`, ni commentaire, ni titre d’évaluation. Les sorties sont plafonnées à 64 Kio ; les analyses portent sur au plus 10000 notes après filtrage et 200 matières en sortie. Les erreurs de calcul sont des résultats MCP `isError` avec un objet JSON `{error:{code,message}}` dans le contenu ; les requêtes MCP invalides produisent les erreurs JSON-RPC du SDK.

## 3. Prérequis

Utiliser Node.js 24 pour la pile MCP et pnpm 10.11.0. Le serveur NotesGym traditionnel conserve son image Node 20 ; les dépendances OAuth sont chargées uniquement si l’intégration est activée. Docker n’est pas nécessaire pour les tests automatisés.

La V1 n’utilise pas l’API de génération OpenAI et ne demande aucune clé API OpenAI. Elle nécessite des clés locales OAuth, des comptes de test et des URI de retour explicitement enregistrées. Les autorisations OAuth sont volatiles : tout redémarrage déconnecte les clients. Le code refuse l’activation MCP avec `NODE_ENV=production` jusqu’à la mise en place d’un adaptateur OAuth durable et sa revue.

## 4. Lancement local

Ne pas utiliser le volume ou le dossier de données de production. Depuis la branche de travail :

```sh
corepack pnpm@10.11.0 install --frozen-lockfile
cp .env.example .env.mcp.local
node scripts/chatgpt-dev-keys.mjs >> .env.mcp.local
```

Sous PowerShell, utiliser `Copy-Item .env.example .env.mcp.local`, puis `node scripts/chatgpt-dev-keys.mjs | Add-Content -Encoding utf8 .env.mcp.local`. L’exécution du générateur sans redirection affiche des clés : **ne pas copier cette sortie dans une conversation ou un ticket**. Le fichier `.env.mcp.local` est ignoré par Git et Docker.

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

Les jetons MCP sont opaques, indépendants des cookies et résolus par l’instance de l’issuer. Chaque requête vérifie existence, expiration, audience exacte, scope, autorisation encore active et existence du compte. L’identifiant interne vient exclusivement du jeton ; le serveur retrouve l’email actuel du compte et charge uniquement ses notes. Aucun `userId`, email ou identifiant de compte n’est accepté dans les arguments des outils.

Le code d’autorisation expire après 60 secondes ; un jeton après 600 secondes au maximum ; une autorisation après une heure. `NOTESGYM_OAUTH_ACCESS_TTL_SECONDS` permet uniquement de réduire le TTL à un entier de 1 à 600, notamment pour tester l’expiration. Le stockage OAuth par défaut est réservé au développement. Il est borné par la bibliothèque ; les références de consentement et formulaires sont aussi bornés et expirés.

Les métadonnées n’annoncent pas de scope email ; les comptes existants n’ayant pas de preuve de vérification d’email, aucune assertion `email_verified=true` n’est inventée. La compatibilité avec les restrictions de domaine des espaces Enterprise reste à compléter.

## 6. Docker et Raspberry Pi 5

Le Compose existant reste inchangé. Une pile séparée utilise Node 24, un utilisateur non root, un système de fichiers en lecture seule et un volume de test dédié :

```sh
docker compose -f docker-compose.mcp.yml up --build
```

Pour cette commande, configurer dans `.env.mcp.local` : `NOTESGYM_PUBLIC_URL=http://localhost:8081`, un client dont la redirection correspond réellement au client de test, et `NOTESGYM_MCP_ENABLED=true`. Le port interne reste 8080 et le port hôte 8081. La variable de dossier est remplacée par `/data`. Utiliser exactement `localhost` pour les requêtes si c’est l’origine configurée.

Le choix des images Alpine Node officielles permet un build ARM64 sur Raspberry Pi 5 64 bits ; ce build n’a pas été exécuté ici. Pas de conteneur Cloudflare démarré automatiquement. Pas de partage de volume avec la production, pas de réplica et pas de second serveur sur le même dossier. Arrêter avec `docker compose -f docker-compose.mcp.yml down`, sans suppression de volume.

## 7. Exposition HTTPS

Pour un test externe futur, créer une origine HTTPS réelle et stable. Aucun domaine NotesGym MCP ni DNS n’est supposé disponible. Configurer le tunnel vers l’instance de test, puis adapter `NOTESGYM_PUBLIC_URL`, les URI de retour et les métadonnées du paquet. `NOTESGYM_SECURE_COOKIES=true` est obligatoire avec HTTPS. Activer `NOTESGYM_TRUST_PROXY=true` seulement si l’origine n’est accessible qu’au proxy de confiance ; bloquer les accès directs et écraser les en-têtes transférés à la frontière.

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
- Conservation serveur : fichiers scolaires déjà existants ; OAuth volatil, expirations décrites ci-dessus ; aucun journal de notes ou jetons ajouté. Le compte utilisateur reste dans le stockage NotesGym habituel.
- Destinataires : client MCP choisi, potentiellement OpenAI lors d’une connexion ChatGPT ; Cloudflare et hébergeur si utilisés. Leurs conditions de traitement/conservation doivent être expliquées. Une révocation n’efface pas les résultats déjà transmis à une conversation.
- À définir : responsable et contact, base légale, droits et traitement des demandes d’effacement/export, consentement parental selon les situations, durées des sauvegardes/logs, pays et transferts, sous-traitants et analyse adaptée aux mineurs. Ce texte technique ne constitue pas une politique publiée.

## 10. Publication officielle et packaging

Les sources officielles consultées pour cette implémentation sont [Plugins](https://developers.openai.com/plugins), [authentification](https://developers.openai.com/plugins/build/auth), [packaging](https://developers.openai.com/plugins/build/plugins), [soumission](https://developers.openai.com/plugins/deploy/submission) et [revue MCP](https://developers.openai.com/plugins/deploy/app-review). Le contrat protocolaire est décrit par la [spécification MCP d’autorisation](https://modelcontextprotocol.io/specification/latest/basic/authorization) et l’implémentation OAuth par la [documentation oidc-provider](https://github.com/panva/node-oidc-provider/blob/main/docs/README.md).

`plugin/notesgym/` contient les manifests portables `plugin.json` et `mcp.json`, le nom public NotesGym, les descriptions française/anglaise et des prompts. L’URL est locale et volontairement inutilisable comme soumission publique. Le logo existant peut être réutilisé. Aucune capture artificielle, URL de politique fictive, identité vérifiée ou approbation n’est annoncée.

Avant toute soumission :

- [ ] Adapter OAuth à un stockage durable sécurisé, avec révocation cohérente entre processus, rotation des clés, sauvegarde/restauration et tests de redémarrage ; lever ensuite le blocage production après revue.
- [ ] Corriger/évaluer les vulnérabilités du projet ; auditer les dépendances exactes, l’application et le proxy.
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
| 20 créations concurrentes et modifications de champs distincts préservées | Limitation des tentatives de connexion, refus d’activation en production |

Les tests créent uniquement des données synthétiques sous `.notesgym-test-data`, ignoré par Git. La suite historique couvre aussi simulations, backtesting, archives, exclusions et isolation des paramètres de simulation. Aucune prédiction MCP n’étant exposée, il n’y a pas de test de prédiction MCP à annoncer.

Le stockage JSON est conservé sans migration : toutes les transactions API sont sérialisées dans un seul processus, écriture atomique par renommage, synchronisation du fichier temporaire et mode de création 0600. La lecture d’un fichier corrompu échoue au lieu de remplacer silencieusement ses données par un tableau vide. Les sessions expirées sont purgées et leur nombre borné. Les limites sont 64 Kio par requête applicative, 20 connexions/10 minutes/IP, 600 requêtes API/minute/IP et 120 requêtes d’intégration/minute/IP. L’IP vient de la connexion réseau, jamais d’un en-tête client non fiable ; derrière un tunnel, le quota peut être partagé, d’où la limitation complémentaire à configurer au proxy. La bibliothèque borne aussi son parsing OAuth.

Les API de mutation refusent les origines tierces et `Sec-Fetch-Site: cross-site`. Les cookies de session ajoutent Secure si l’origine configurée est HTTPS ou avec `NOTESGYM_SECURE_COOKIES=true` ; les instances locales HTTP existantes restent utilisables. En hébergement public, configurer impérativement HTTPS. Des en-têtes anti-sniffing, anti-framing et de minimisation du Referer sont ajoutés. Les erreurs internes ne divulguent plus les messages du système de fichiers. Les nouvelles notes sont validées sur l’échelle suisse 1–6 ; les anciens fichiers ne sont pas réécrits pour normaliser d’anciennes valeurs. Les sauvegardes restent indispensables : un renommage atomique ne remplace pas une stratégie de reprise après panne matérielle.

SQLite serait pertinent pour plusieurs processus et un stockage OAuth durable. Aucune migration partielle n’est introduite ici. Une future migration devra arrêter les écrivains, sauvegarder les trois JSON avec empreintes, importer dans une transaction vers un nouveau fichier, valider comptes/relations/nombres/valeurs et comparer les calculs avant bascule. Conserver les JSON intacts et documenter l’export des écritures intervenues après bascule avant retour arrière. Aucun de ces traitements ne doit viser la production dans un test.

Résultats et limites d’exécution sont consignés dans [chatgpt-validation.md](chatgpt-validation.md). Docker/ARM64, tunnel, mTLS, navigateur réel et portail OpenAI n’ont pas été validés ici. La V1 est destinée aux tests avec comptes synthétiques ; elle n’est pas prête pour publication publique.
