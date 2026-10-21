# Audit auth v2 (dépôt uniquement, avant modifications fonctionnelles)

Branche de départ : `auth-v1`. Aucun accès à la production, aux JSON réels ou au Raspberry Pi. Aucun AGENTS.md trouvé. Lecture intégrale de server.js et server/security.js, AuthContext, LoginScreen, App, ProtectedRoute, client API, configuration des routes et Docker ; inventaire des tests et recherche des références sur src/server/test/documentation.

## Constats et dépendances

- users.json : tableau `{id,email,role,passwordHash,salt,created_date}`. UUID et scrypt Node historique (N=16384,r=8,p=1,64 octets). NOTESGYM_USERS ajoute les absents au démarrage sans écraser les présents. Aucun statut de vérification.
- notes.json : tableau de notes avec UUID, created_by=email, métadonnées métier, dates et archivage. Toutes les routes de lecture, modification, archivage et suppression filtrent par email. Les simulations chargent ces mêmes notes par email.
- simulation-settings.json : tableau `{user_id,plans,revision,requestIds}`. UUID stable indispensable ; plans et knownNoteIds doivent rester intacts. Les routes PATCH/migrate vérifient accountId. Les fonctions analytiques consomment les notes fournies par l'API, sans autre autorisation.
- Frontend : Dashboard et PatchNotesPopup indexent les préférences par UUID ; Insights utilise UUID puis email en repli ; useSimulationSettings importe encore les anciens plans locaux. Les requêtes notes utilisent une clé de cache commune : purger le cache au changement de compte est nécessaire.
- sessions en mémoire : perte au redémarrage. Cookies HttpOnly/Lax et Secure selon origine publique. Limites IP en mémoire, pas de limite par compte. scrypt synchrone bloque la boucle Node. Protection Origin/Fetch Metadata existante mais les contenus de formulaires simples doivent aussi être refusés.
- JSON écrits via fichier temporaire, fsync et rename. La file API sérialise les transactions complètes : la conserver pour notes/simulations. Un seul processus écrivain par volume obligatoire. La corruption est propagée, jamais remplacée silencieusement.
- README proposait des opérations de destruction globale ; retirer ces instructions du parcours de déploiement. Compose contient des mots de passe d'exemple et impose le provisionnement manuel.

## Architecture retenue

Node 24 LTS et SQLite intégré (`node:sqlite`), WAL, foreign_keys, busy_timeout, transactions immédiates pour les mutations auth. Notes et simulations restent en JSON : déplacer aussi ces données multiplierait inutilement les risques. SQLite contient utilisateurs, sessions hachées, jetons hachés, quotas persistants et correspondances historiques email→UUID. Les notes nouvelles portent user_id ; le repli historique passe exclusivement par cette correspondance, jamais par l'email actuel. Les anciennes adresses sont réservées : impossible de reprendre les notes d'autrui par réinscription.

Better Auth a été évalué (SQLite, vérification, extensibilité TOTP et hachage personnalisable). Son adoption nécessite un deuxième modèle user/account et des adaptations des jetons et des routes existantes. Cette implémentation choisit un module limité et explicite autour des primitives Node/OpenSSL pour conserver exactement UUID, scrypt et contrats API ; Nodemailer assure le transport SMTP. Ce choix implique une maintenance sécurité applicative et une revue indépendante avant mise en production. Aucun algorithme cryptographique ni client SMTP maison. Scrypt v2 asynchrone N=32768,r=8,p=3,64 octets ; mise à niveau après vérification réussie des anciens mots de passe. Prévoir une table de facteurs et une étape de challenge avant création de session pour TOTP (non implémenté).

Références vérifiées : https://better-auth.com/docs/authentication/email-password ; https://better-auth.com/docs/reference/options ; https://nodejs.org/api/sqlite.html ; https://nodemailer.com/smtp ; https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html .

## Inconnues de production à lever avant migration réelle

Version/image réellement déployée, chemin et nom effectifs du volume, format réel des JSON, doublons/casse d'emails, comptes uniquement dans NOTESGYM_USERS, notes orphelines, sauvegarde restaurable, SMTP et contrôle des adresses historiques, IP directe du tunnel. Le CLI inspecte une copie, refuse les formats inattendus, doublons et associations ambiguës ; aucune résolution automatique. Les comptes présents uniquement dans l'environnement doivent d'abord être matérialisés par l'ancienne version, ou traités manuellement sur une copie. Aucun mot de passe de l'environnement n'est importé ni réinitialisé.

Migration hors ligne, séparée du démarrage, construit une nouvelle base temporaire puis la publie atomiquement ; sauvegarde byte-identique des JSON et manifeste SHA-256 avant publication. Aucun JSON historique modifié ou effacé. Échec avant publication : aucune base active partielle. Retour arrière : arrêter, sauvegarder tout le volume courant puis restaurer la sauvegarde complète avec l'ancienne image ; les inscriptions et modifications ultérieures doivent être réconciliées, jamais écrasées aveuglément.

Comptes historiques : choix obligatoire `require-verification` (accès protégé après confirmation) ou `preserve-access` (accès historique maintenu, statut non vérifié affiché). Seuls les comptes importés peuvent bénéficier de cette exception ; nouveaux comptes toujours bloqués avant vérification. Changement d'email : mot de passe actuel, confirmation nouvelle adresse, révocation sessions ; l'ancienne association reste réservée.

## Inventaire des références et contrôle complémentaire

- `server.js` : ancien provisionnement NOTESGYM_USERS/users.json, cookies/sessions, auth/me/login/logout, filtrage de toutes les notes et chargement des notes pour simulations ; remplacés ou raccordés au module auth. Le seul accès résiduel à NOTESGYM_USERS refuse un démarrage mal configuré.
- `src/lib/AuthContext.jsx`, `src/api/base44Client.js`, `src/App.jsx`, `LoginScreen.jsx`, `ProtectedRoute.jsx`, `PageNotFound.jsx` : contexte, client et gardes. Les clés de cache communes sont purgées à la connexion/déconnexion/expiration. ProtectedRoute est un ancien composant inutilisé par App ; les routes actives passent par AuthenticatedApp.
- `src/pages/Dashboard.jsx`, `src/components/PatchNotesPopup.jsx` : clés locales par user.id, inchangées. `src/pages/Insights.jsx` et `src/components/insights/useSimulationSettings.js` : clé UUID, repli email/local et migration locale, inchangés.
- `test/server-web.test.js`, `test/account-simulation-api.test.js`, `scripts/check-account-sync-browser.mjs` : fixtures d’anciens comptes adaptées à la migration explicite ; plus de provisionnement par mot de passe d’environnement. Les données du script predictive sont simulées indépendamment du serveur.
- Docker, `.env.example`, README : suppression du provisionnement permanent et des instructions de destruction ; les anciennes documentations historiques ne sont pas des procédures de déploiement v2.
- `NavigationTracker.jsx` transmettait l’URL complète à la fenêtre parent via postMessage : retiré query/fragment pour éviter la fuite des jetons des nouveaux liens. Changement nécessaire à la sécurité des parcours email.

Le verrou définitif utilise une connexion SQLite exclusive distincte, libérée par le système après panne, sans fichier PID persistant. Les tables/schéma et la publication de base sont exclusivement des opérations locales ; aucun accès à la production n’a été utilisé pour valider ces choix.
