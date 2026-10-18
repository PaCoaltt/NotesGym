# Premier essai externe contrôlé — checklist manuelle

Cette procédure prépare un essai avec deux comptes synthétiques. Elle ne vaut ni déploiement autorisé, ni publication. Aucun DNS, tunnel, compte réel ou service public n’a été créé pendant l’implémentation. Les données scolaires JSON de production ne doivent jamais être montées dans cette pile.

## Avant d’ouvrir le réseau

- [ ] Relire [la validation](chatgpt-validation.md) et [les deux avis de build restants](chatgpt-vulnerabilities.md). Construire uniquement le dépôt vérifié ; ne pas exposer Vite ou une compilation de contenu utilisateur.
- [ ] Installer Docker/Compose/Buildx sur le poste de validation ou le Pi 5 ARM64, sans utiliser une pile de production.
- [ ] Copier `.env.example` vers `.env.mcp.local`, privé et ignoré de Git. Définir deux comptes jetables par variable d’environnement et quelques notes synthétiques, avec plusieurs années/semestres et exclusions. Ne pas inscrire leurs mots de passe dans Git ou la PR.
- [ ] Choisir une origine HTTPS réelle et stable avant de créer la base OAuth de cette instance. Les manifests du dépôt restent volontairement sur localhost.
- [ ] Créer les clés une fois, explicitement. Préférer `NOTESGYM_OAUTH_KEYS_FILE`, mode 0600, dossier privé ; ne pas définir en même temps les deux variables de clés historiques. Vérifier l’ACL sous Windows ou l’UID 1000 et les modes 0700/0600 sur Pi. Ne jamais régénérer au redémarrage.
- [ ] Utiliser un volume de test dédié, qui contient `/data/oauth/oauth.sqlite`, son WAL/SHM et éventuellement le fichier de clés privé. Confirmer qu’aucun volume scolaire de production n’est présent et qu’un seul processus NotesGym y écrit.

## Vérifications Docker à effectuer sur une machine équipée

Ces commandes n’ont pas été exécutées ici, Docker étant absent :

```sh
docker compose --env-file .env.mcp.local -f docker-compose.mcp.yml config --quiet
docker buildx build --platform linux/arm64 -f Dockerfile.mcp -t notesgym-mcp:test-arm64 --load .
```

Le deuxième contrôle nécessite un builder ARM64 natif ou une émulation correctement installée. Ne pas interpréter l’absence de résultat local comme une réussite ARM64. `config --quiet` évite d’afficher les secrets de l’environnement.

Après autorisation distincte de lancer l’instance de test, vérifier l’état healthy, l’UID non root, l’écriture dans le seul volume dédié et la conservation de celui-ci après arrêt/redémarrage. Le healthcheck teste `/api/health` et SQLite lorsque l’intégration est activée. Vérifier aussi la lisibilité réelle des clés par cet UID, sans élargir les permissions à 777.

## TLS et Cloudflare Tunnel, à configurer manuellement

Le [modèle inactif cloudflared](../deploy/cloudflared.mcp.example.yml) vise un tunnel exécuté sur l’hôte, vers le port local 8081. Il contient uniquement des placeholders et ne crée aucune ressource. Le paramètre de Host suit la [documentation Cloudflare des paramètres d’origine](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/origin-parameters/) ; le traitement de l’IP doit respecter les [conditions des en-têtes Cloudflare](https://developers.cloudflare.com/fundamentals/reference/http-headers/), notamment les workers intermédiaires. Ce modèle n’a pas été exécuté ou validé par cloudflared ici.

- [ ] Ne pas démarrer un tunnel dans le cadre du préflight. Faire préparer domaine, certificat et tunnel par l’opérateur après son autorisation.
- [ ] Garder le port hôte sur `127.0.0.1:8081` ; bloquer toute entrée réseau directe. Si le tunnel est conteneurisé, ajuster explicitement son routage et son réseau privé plutôt que publier l’origine sur toutes les interfaces.
- [ ] Configurer le proxy/tunnel pour conserver le Host public attendu, transmettre `X-Forwarded-Proto: https`, écraser `CF-Connecting-IP` et ignorer toute valeur fournie par un client. Ne pas faire confiance à un worker intermédiaire capable de réécrire l’IP sans l’avoir audité.
- [ ] Définir `NOTESGYM_TRUST_PROXY=true` et `NOTESGYM_TRUSTED_PROXY_IPS` avec les adresses exactes, ou le réseau privé strictement nécessaire, du proxy tel que vu **dans le conteneur**. `127.0.0.1` du poste et l’IP de passerelle Docker peuvent différer. Aucune confiance globale `/0`.
- [ ] Définir `NOTESGYM_PUBLIC_URL` avec l’origine publique réelle, sans chemin ; le serveur dérive `/oauth` comme issuer et `/mcp` comme ressource/audience. Préserver cette identité lors des redémarrages.
- [ ] Prévoir HTTPS, HSTS et limites globales au proxy, absence de cache sur les routes authentifiées, absence de logs des corps/cookies/Authorization et des requêtes OAuth. Le quota par IP au backend ne remplace pas une protection de connexion au proxy ; ses compteurs sont réinitialisés au redémarrage.
- [ ] Vérifier la politique Cloudflare Access et les challenges éventuels : le client MCP doit pouvoir atteindre les métadonnées et le serveur, sans authentification Cloudflare supplémentaire incompatible avec son flux OAuth. Ne pas désactiver le contrôle des comptes NotesGym.

Le code permet le mode production uniquement avec activation MCP explicite, origine HTTPS et proxy de confiance. `NOTESGYM_MCP_ENABLED` reste false par défaut. Dans Compose, `NOTESGYM_RUNTIME_MODE=production` est interpolé seulement si le fichier est passé avec `--env-file` ou la variable est exportée ; `NODE_ENV` dans le seul `env_file` ne remplace pas la configuration Compose.

## Préflight sans réseau

```sh
node --env-file=.env.mcp.local scripts/chatgpt-preflight.mjs --external
```

À exécuter dans le même environnement de chemins/permissions que le futur serveur. Pour des chemins `/data/...`, le lancer dans un conteneur de test approprié. Il vérifie les clés, clients, callbacks, origine, proxy, accès au parent du stockage, permissions et, si la base existe, schéma/intégrité/empreinte. Il ne crée pas de base, ne contacte pas l’origine et n’affiche aucun secret. Un succès ne prouve ni DNS, ni certificat, ni passage du tunnel.

## Connexion actuelle de ChatGPT

Selon la [documentation officielle d’authentification](https://developers.openai.com/plugins/build/auth), le client peut être préenregistré et utiliser Authorization Code avec PKCE S256 sans secret. Cette V1.1 utilise ce mode ; elle n’annonce ni DCR ni CIMD. Les métadonnées OAuth, l’issuer retourné par la réponse d’autorisation et la ressource doivent correspondre exactement.

- [ ] Dans un compte/espace disposant de l’ajout de MCP personnalisé, créer une connexion de test vers l’endpoint HTTPS réel `/mcp`, avec OAuth et client fourni. Ne pas soumettre le paquet à l’annuaire.
- [ ] Relever l’identifiant public du client et l’URI de callback exacte affichée par OpenAI. Les callbacks peuvent dépendre du mode de connexion ; ne pas supposer une ancienne URL. Inscrire l’URI exacte dans `NOTESGYM_OAUTH_CLIENTS` ; aucun wildcard, aucun mot de passe NotesGym, aucun secret client dans le manifest.
- [ ] Mettre à jour la configuration de l’instance de test, refaire le préflight, puis connecter le compte synthétique A. Ouvrir NotesGym dans un autre onglet si la session locale est absente, recharger le consentement, vérifier le compte/client et autoriser. Tester également Refuser.
- [ ] Vérifier la découverte des six outils et leurs annotations de lecture seule. Aucun `get_predictions` n’est annoncé.
- [ ] Demander un aperçu sans période sur plusieurs années : la réponse doit demander une précision et proposer les périodes. Comparer ensuite `year`/`semester` et `scope=year` avec les calculs existants de NotesGym. L’historique multi-années exige `scope=history`, `years` et, pour les archives, `include_archived=true`.
- [ ] Tester une simulation ; confirmer que notes et paramètres de simulation n’ont pas changé. Vérifier l’absence de commentaires/emails dans les résultats.
- [ ] Reconnecter depuis un autre compte/espace de test avec B et vérifier qu’aucune note/insight de A n’est visible. Tester aussi deux clients OAuth et les arguments `userId` invalides.
- [ ] Arrêter puis redémarrer le processus avec les mêmes clés et le même volume. Vérifier l’autorisation encore valide, puis l’expiration d’un jeton et une nouvelle autorisation lorsque nécessaire.
- [ ] Révoquer A depuis le lien NotesGym × ChatGPT ; redémarrer ; vérifier le refus persistant de A et le maintien de B. La révocation n’efface pas une conversation ayant déjà reçu des résultats.

La [protection des domaines Enterprise](https://developers.openai.com/plugins/build/auth) nécessite une identité email réellement vérifiée et UserInfo adapté. NotesGym n’a pas encore cette preuve ; ne pas inventer `email_verified=true`. Choisir un espace compatible pour ce test ou compléter ce mécanisme avant un essai qui l’impose. Le portail, mTLS réel et ses éventuelles exigences additionnelles restent à vérifier sur l’environnement visé.

## Sauvegarde, restauration et retour arrière

- [ ] Tester `scripts/chatgpt-oauth-backup.mjs` vers une destination neuve privée. L’API SQLite prend une sauvegarde cohérente même avec WAL ; ne pas copier seulement le fichier principal d’une base active. Sauvegarder les clés à part, de manière protégée, et conserver les JSON synthétiques cohérents.
- [ ] Restaurer sur une copie de l’instance arrêtée, dans un dossier neuf privé. Garder l’ancien ensemble complet pour retour arrière, sans mélanger son WAL/SHM avec la base restaurée. Restaurer les mêmes clés et issuer ; refaire le préflight.
- [ ] Avant de rouvrir une sauvegarde ancienne, exécuter `node --env-file=.env.mcp.local scripts/chatgpt-oauth-invalidate.mjs --all-authorizations` pour éviter de restaurer une autorisation révoquée depuis la sauvegarde. Reconnecter ensuite les comptes de test. Seuls les enregistrements OAuth sont supprimés.
- [ ] Documenter date, empreintes des sauvegardes, propriétaire, durée de rétention et résultat réel. Ne jamais joindre les clés ou la base OAuth à une PR ou une conversation.
- [ ] En cas de retour au code V1, laisser MCP désactivé : il n’existe pas de migration inverse automatique de SQLite vers l’ancienne Map. Les JSON scolaires ne changent pas de format.

Avant une ouverture publique, restent obligatoires la revue de sécurité de l’installation réelle, les politiques publiques de confidentialité/conditions, la vérification du développeur et une autorisation explicite de soumission et publication. Le premier essai externe est encore bloqué par l’absence de domaine/HTTPS/tunnel et de clients de test réels configurés, ainsi que les contrôles Docker/ARM64 non exécutés.
