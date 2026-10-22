# Auth V2 — revue ciblée du 22 octobre 2026

Travail effectué exclusivement sur `feature/auth-v2`, à partir du commit `8f690e4`. Arbre propre au début. Aucun accès au Raspberry Pi, à la production ou à des données réelles ; aucun déploiement, merge ou changement d’interface. Tests uniquement dans `.notesgym-test-data` et sur la boucle locale.

## Constats confirmés et corrections

| Constat | Classe et gravité | Reproduction avant correction | Correction |
| --- | --- | --- | --- |
| Disparition de notes.json pendant l’exécution traitée comme un tableau vide | Défaut d’intégrité confirmé, gravité moyenne ; impact potentiellement important, mais disparition du fichier requise hors de l’API | Après suppression du fichier synthétique, POST /api/notes retournait 201 et recréait un fichier incomplet | Lectures métier strictes dans server.js. Seul le contrôle initial d’un nouveau volume peut utiliser un repli explicite. Lecture/création/simulations retournent 500 tant que le fichier manque ; aucun remplacement automatique |
| Extraits d’un JSON malformé présents dans les erreurs de parsing | Fuite de contenu dans les diagnostics locaux, gravité faible ; pas de fuite HTTP démontrée | JSON.parse produisait un SyntaxError avec un extrait synthétique. Le démarrage imprime les erreurs ; le CLI imprime error.message | Diagnostics limités à « Invalid JSON store: nom.json », sans cause contenant le texte privé, dans server.js et server/migrate-auth.js |
| Mot de passe modifié : suppression du jeton de vérification de l’adresse inchangée | Défaut fonctionnel confirmé / amélioration de révocation, pas une vulnérabilité de prise de contrôle | Deux nouveaux tests échouaient car le lien verify était supprimé après reset/change-password | Révocation limitée aux types reset/email lors d’un changement de mot de passe ; les sessions restent toutes révoquées. Aucun jeton vérifiant une ancienne adresse ne survit à un changement d’email confirmé |

Les quatre reproductions initiales ont été réellement exécutées et ont échoué sur le code antérieur : réinitialisation/préservation de verify, changement/préservation de verify, parsing privé, disparition de notes.json. Elles passent après correction. La disparition du fichier est un scénario d’erreur de stockage/administration, pas une suppression réalisable par un utilisateur non autorisé à travers l’application.

## Signalements non confirmés

- **Prolongation indéfinie du blocage : non confirmée.** L’UPSERT existant modifie uniquement count. Le début de fenêtre est implicitement `until - windowMs`, chaque clé utilisant une durée constante. Les entrées sont supprimées lorsque `until <= now`, puis une nouvelle entrée commence à count=1. Aucun changement du SQL, des quotas, du schéma ou de l’horloge : ajout d’un commentaire et de tests seulement.
- **Contournement concurrent du quota : non confirmé.** BEGIN IMMEDIATE couvre nettoyage, plafond de clés, incrément et décision. Quatre workers, quatre connexions SQLite et 100 tentatives simultanées donnent exactement 23 admissions pour une limite de 23. Échéance inchangée et compteur final de 100 vérifiés.
- **Double consommation d’un jeton : non confirmée.** Le jeton est revérifié dans la transaction avant la mutation. Deux resets lancés avant la fin du hachage n’aboutissent qu’une fois ; deux vérifications du même lien aussi. Le changement d’email qui se termine pendant le hachage d’un reset invalide celui-ci avant son commit.
- **Crash/fuite de secret lors d’un échec SMTP : non confirmés.** Rejets asynchrones et exceptions synchrones du transport sont interceptés ; le logger ne reçoit qu’un message constant. Les tests injectent volontairement des erreurs contenant texte du mail et faux secret SMTP ; aucun ne ressort dans les logs.
- **Transfert de notes au changement d’email : non confirmé.** UUID prioritaire, correspondance historique réservée et refus d’un propriétaire forgé restent couverts par les tests HTTP. Les JSON et hachages historiques, les métadonnées et les plans sont préservés ; le renforcement du hachage SQLite après connexion historique réussie reste le comportement voulu.
- **CSRF ou confiance dans des en-têtes proxy non autorisés : aucun contournement démontré dans cette revue.** Les tests existants refusent origine hostile/opaque, Fetch Metadata cross-site, formulaires simples et faux en-têtes proxy. Cela ne constitue pas une preuve générale d’absence de vulnérabilité.

Le plafond de 20 000 clés actives du limiteur est inchangé et testé : une nouvelle clé est refusée au plafond, une clé existante reste évaluable, les entrées expirées sont supprimées et l’espace SQLite peut être réutilisé. Le fichier ne doit pas nécessairement rétrécir après chaque nettoyage ; aucun VACUUM intrusif n’est ajouté.

## Politique de jetons après correction

| Événement | Vérification actuelle (verify) | Récupération (reset) | Changement d’adresse (email) | Sessions |
| --- | --- | --- | --- | --- |
| Renvoi d’un lien de type T | Seul le précédent T est remplacé | Idem | Idem | Conservées |
| Confirmation de l’adresse initiale | Consommé | Conservé | Conservé | Conservées |
| Changement/réinitialisation du mot de passe | Conservé jusqu’à son expiration/usage | Révoqué | Révoqué | Toutes révoquées |
| Confirmation d’une nouvelle adresse | Révoqué | Révoqué | Consommé/révoqué | Toutes révoquées |

La vérification simple prouve seulement la possession de l’adresse actuelle et ne modifie pas les identifiants de connexion. La conserver après changement de mot de passe n’accorde pas de session à son détenteur. Un lien email a été autorisé par le mot de passe précédent : il doit être annulé après changement de ce mot de passe. Un reset livré à l’ancienne adresse ne doit jamais agir sur le compte après changement d’adresse confirmé ; cela justifie la révocation de tous les types à ce moment-là. Aucun autre événement ne gagne une révocation générale supplémentaire.

## Emails

`server/mailer.js` a été relu ; sa configuration TLS, ses délais et ses options de logs n’ont pas nécessité de modification. Le relais de test TCP écoute uniquement sur 127.0.0.1 et refuse STARTTLS : le vrai Nodemailer échoue avant toute livraison. Trois tentatives produisent trois diagnostics génériques, le backend reste disponible et les réponses inscription/doublon/récupération/renvoi ne différencient pas inutilement les comptes. Le mot de passe correct d’un compte non vérifié continue de donner 403.

Le transport simulé couvre ensuite un renvoi réussi après exception synchrone puis rejet asynchrone, l’invalidation des liens précédents et la conservation des types indépendants. Même jamais livrés, reset expire exactement à 30 minutes et verify exactement à 24 heures selon l’horloge injectable. Les jobs terminés sont retirés de mailJobs. Les fixtures HTTP retirent désormais aussi toutes les variables SMTP héritées pour éviter tout contact accidentel avec un relais extérieur.

**Aucune file durable ajoutée.** Le renvoi contrôlé répond au besoin actuel ; une garantie de livraison après crash n’a pas été demandée et ne serait pas prouvée par cette revue. Une éventuelle outbox SQLite devrait être justifiée séparément, notamment pour protéger les liens réutilisables nécessaires à une reprise sans violer l’exigence de ne conserver que l’empreinte des jetons. Aucun Redis, RabbitMQ, nouveau service ou dépendance ajouté.

## Périmètre de la revue complémentaire

- **server.js** : autorisations des notes et simulations, priorité de user_id, sérialisation des transactions API, CSRF/JSON, cookies, démarrage, lectures et écritures des JSON. Seuls les défauts de lecture/diagnostic décrits ci-dessus nécessitent une correction.
- **server/security.js** : limites de corps, contrôles Origin/Fetch Metadata, origine publique, pairs proxy IP/CIDR explicites, lecture CF-Connecting-IP. Code inchangé.
- **server/auth.js / auth-store.js** : validation des champs, quotas persistants par IP/adresse/action, sessions hachées/expiration/révocation, disponibilité des adresses réservées, jetons, transactions et envois. Révocation sélective des jetons ajustée ; limiteur existant conservé.
- **server/migrate-auth.js** : sources byte-identiques, sauvegarde/manifeste, doublons et associations ambiguës, intégrité SQLite, détection d’une source changée, publication sans écrasement, idempotence, restauration testée sur un répertoire distinct. Diagnostic de parsing neutralisé ; aucun changement de format ou d’import.
- **server/data-lock.js** : connexion SQLite exclusive séparée et libération système. Code inchangé ; redémarrages et refus d’un deuxième écrivain vérifiés par la suite.

## Tests exécutés

| Vérification | Résultat réel |
| --- | --- |
| Suite initiale `node --test` avant correction | 80 tests réussis, 0 échec |
| Quatre reproductions avant correction | 4 échecs attendus, confirmant les comportements décrits |
| Tests limiteur sur SQL original | Réussis, dont quatre connexions simultanées |
| Suite finale `node --test` | **98 tests réussis, 0 échec**, environ 21 s selon le runner |
| `node node_modules/vite/bin/vite.js build` | Réussi, 3579 modules ; avertissement de taille du bundle >500 ko |
| `node node_modules/eslint/bin/eslint.js .` | Réussi, avec les tests auth explicitement inclus dans les règles Node |
| `node node_modules/typescript/bin/tsc -p jsconfig.json --noEmit` | **Échec : 20 erreurs préexistantes**, mêmes diagnostics observés avant et après corrections ; aucun fichier frontend modifié |
| `git diff --check` | Réussi après rédaction du rapport ; avertissements Git de conversion LF/CRLF uniquement |

Les erreurs TypeScript concernent les propriétés ajoutées à Error dans le client API, les props de champs des modales de notes, GradeChart, useSimulationSettings, labTranslations, AuthContext et Dashboard. Elles ne sont ni masquées ni corrigées dans cette intervention ciblée. Les premiers refus de lecture des dépendances pnpm par le bac à sable ont été levés en réexécutant les vérifications avec autorisation ; ils ne sont pas présentés comme des échecs du logiciel.

**18 scénarios ajoutés** : 5 tests de limiteur (bornes, tentatives après blocage, capacité/nettoyage, portée, concurrence et persistance réparties dans ces tests), 11 tests de jetons/SMTP/diagnostics dans auth-v2.test.js et 2 tests HTTP (stockage manquant et SMTP local). La suite conserve ses contrôles des deux politiques historiques, UUID/hachages, isolation des notes, simulations, import répété, échec/restauration et sessions après redémarrage. Le runner inclut aussi le module de fixtures dans son total.

Le script `test:auth` inclut désormais auth-limits.test.js. Aucun nouveau test navigateur exécuté pendant cette revue ; l’interface n’a pas changé. Les tests navigateur initiaux du 21 octobre restent consignés dans le guide de déploiement sans être présentés comme réexécutés aujourd’hui.

## Fichiers concernés

- Corrections : `server.js`, `server/auth.js`, `server/auth-store.js`, `server/migrate-auth.js`.
- Tests : nouveau `test/auth-limits.test.js`, extensions de `test/auth-v2.test.js` et `test/server-web.test.js`, environnement isolé dans `test/account-simulation-api.test.js`.
- Vérifications : `package.json` (script test:auth), `eslint.config.js` (couverture Node des tests auth).
- Documentation : ce rapport et mise à jour de `docs/auth-v2-deployment.md`.

Ni UI, ni algorithmes métier, ni Dockerfile, ni dépendances, ni schéma SQLite modifiés. Pas de migration supplémentaire nécessaire pour ces correctifs.

## Risques plausibles et améliorations restantes

- **Livraison** : les emails en mémoire peuvent être perdus lors d’un arrêt ; le relais réel, certificats, expéditeur autorisé et délivrabilité restent à qualifier. Aucun email extérieur envoyé dans ces tests.
- **Proxies et charge** : l’administrateur doit restreindre le pair du tunnel et son accès direct. Une liste de confiance trop large compromettrait les quotas IP. Le codage textuel d’IPv6 n’est pas normalisé par l’application ; aucun contournement par un visiteur à travers Cloudflare correctement configuré n’a été démontré. Les quotas et coûts scrypt restent à éprouver sous charge sur ARM64.
- **Énumération temporelle** : les comptes encore en scrypt-v1 suivent un coût différent des comptes v2/fictifs. Un canal temporel est plausible, non démontré à distance ici. Les réponses publiques sont génériques et les quotas demeurent actifs. Ne pas prétendre que le temps de réponse est constant.
- **Cookies** : host-only, HttpOnly, Lax et Secure en HTTPS sont conservés. Le préfixe __Host- n’est pas utilisé ; durcissement possible à prévoir avec une stratégie de transition des sessions et le support HTTP local, sans changer silencieusement les cookies actuels.
- **Stockage** : verrou local, un seul écrivain, aucune protection contre un administrateur modifiant les fichiers à la main ni contre toutes les pannes disque. Les fsync des fichiers ne remplacent pas une qualification des entrées de répertoire après rename/hardlink et des coupures brutales. Sauvegarde externe complète et restauration répétée indispensables ; aucun essai de panne électrique effectué.
- **Migration** : un ancien serveur ignore le verrou v2 et doit être arrêté. Une restauration postérieure à l’ouverture de v2 nécessite le rapprochement des inscriptions et modifications ultérieures. Ne pas écraser le volume courant avec une sauvegarde ancienne.
- **Maintenance** : module auth applicatif à maintenir, 2FA et suppression de compte non implémentées ; erreurs TypeScript existantes à traiter séparément. Cette revue ciblée n’est pas un audit exhaustif ni une certification.

## Conclusion

**Oui, ces corrections permettent de passer aux tests SMTP réels, Docker ARM64 et migration/restauration sur un volume de test distinct**, après configuration explicite de cet environnement isolé. Les deux défauts reproduits sont corrigés, les contrôles de jetons sont renforcés et aucun échec n’est constaté dans la suite de tests, le build ou ESLint. Le contrôle TypeScript reste en échec préexistant, à suivre comme dette de validation.

Cette conclusion ne vaut pas validation de production : image ARM64, délivrabilité réelle et contenu effectif d’un volume de production n’ont pas été inspectés ni testés. Aucune autorisation de déploiement n’est présumée.

Références primaires consultées : [transactions SQLite](https://www.sqlite.org/lang_transaction.html), [récupération de mot de passe OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [transport SMTP Nodemailer](https://nodemailer.com/smtp).
