# Validation de la V1.1 NotesGym × ChatGPT

Vérifications exécutées le 18 octobre 2026 sous Windows, Node.js **24.19.0**, SQLite natif **3.53.3**, pnpm **10.11.0**. La V1.1 continue la branche et la PR #20 depuis `292b563`, sans modification de main ni données réelles. La V1 initiale comptait 57 tests et 50 avis de dépendances ; les résultats ci-dessous sont ceux de la stabilisation.

| Vérification | Résultat réel |
| --- | --- |
| Mises à jour pnpm ciblées | Réussite, verrou mis à jour ; aucun audit fix --force |
| OAuth + préflight ciblés | 10 tests réussis, 0 échec, avec redémarrages réels et proxy HTTPS simulé |
| `npm test` | 68 tests réussis, 0 échec, 0 ignoré ; 51 tests historiques et 17 tests d’intégration/stabilisation |
| `npm run lint` | Réussite, code de sortie 0 ; lint étendu aux nouveaux modules serveur et tests |
| `npm run build` | Réussite avec Vite 6.4.3 ; 3577 modules ; JS principal 1057,42 Kio, gzip 311,66 Kio |
| `git diff --check` | Réussite ; avertissements Git de conversion LF/CRLF sous Windows, sans erreur de whitespace |
| Audit pnpm complet | 2 avis résiduels : 1 élevé (braces), 1 modéré (postcss-selector-parser), uniquement dans la chaîne de build |
| Audit pnpm --prod | 0 avis connu ; 48 des 50 avis initiaux corrigés/retirés |
| Adaptateur SQLite et backup/restore | Réussite : unicité, chiffrement, récupération, expiration, nettoyage, consommation, révocation compte/client, invalidation après restauration |
| Préflight CLI --external | Réussite sur configuration synthétique HTTPS, hors réseau ; ne crée aucune base ; détecte les clés modifiées sur une base existante |
| Docker, Compose, ARM64 | Non exécutés : Docker absent de l’environnement |
| ChatGPT réel, tunnel, domaine, portail | Non exécutés : aucun endpoint HTTPS ni compte/connexion de test configuré |

Le build signale un bundle supérieur à 500 Kio. Cette mission n’effectue pas de refonte ou découpage du frontend.

Le [tableau exhaustif des 50 avis](chatgpt-vulnerabilities.md) précise versions, gravité, chemins, présence production/build, conditions d’exploitation et correction. Les [rapports avant](chatgpt-dependency-audit-before.json), [après](chatgpt-dependency-audit.json) et [production](chatgpt-dependency-audit-production.json) sont versionnés. jsPDF est passé de 2.5.2 à 4.2.1 avec un test du vrai rapport ; React Router et PostCSS ont reçu des mises à jour de maintenance, les transitives des mises à jour compatibles. Quill/moment inutilisés ont été retirés ; le plugin Tailwind de build a été reclassé en devDependency pour retirer sa chaîne du runtime. Les avis résiduels ne sont pas déclarés corrigés : leur exposition est limitée aux constructions de sources fiables. Le nombre d’avis n’est pas le nombre de paquets vulnérables.

Certaines premières tentatives ont échoué à cause du bac à sable : récupération Git refusée, téléchargement npm/pnpm inaccessible, résolution de paquets pnpm refusée et accès esbuild bloqué. Elles ont été relancées avec autorisation hors du bac à sable. Une première installation npm sans verrou a servi au démarrage, puis a été remplacée par l’installation pnpm exacte avant validation finale. `npm audit` a échoué avec ENOLOCK car le projet utilise `pnpm-lock.yaml` ; l’audit pnpm a ensuite produit les résultats ci-dessus.

Pendant la V1.1, les tests ont notamment identifié l’import par défaut de jsPDF incompatible avec Node, corrigé en import nommé, ainsi qu’un défaut du transport de test : fetch remplaçait Host et ne simulait pas le proxy attendu. Le test HTTPS utilise désormais un vrai client HTTP local préservant cet en-tête. Les essais échoués ne sont pas présentés comme des validations. Le test historique interdisant toute production a été remplacé par des cas de configuration refusée et un flux complet en production explicite avec proxy simulé.

Les tests vérifient des échanges OAuth HTTP réels et le SDK MCP client, les six outils, les moyennes/arrondis partagés, A/B et plusieurs clients, le consentement/refus, PKCE, la découverte, le scope/ressource/issuer, les jetons expirés ou d’un autre issuer, les deux modes de révocation et l’absence d’écriture des simulations. Les nouvelles vérifications redémarrent réellement le processus : sessions/grants/codes récupérés, révocation persistante, expiration maintenue, remplacement des clés refusé. Les périodes couvrent deux années actives, plusieurs semestres, archives, exclusions, demande de précision et historique volontaire. Le stockage JSON conserve ses tests de 20 créations simultanées, modifications concurrentes et corruption non écrasée. Le rate limiting ignore les en-têtes IP forgés d’un pair non fiable. La revue visuelle du PDF dans un navigateur, les modes Unix/ACL réels sur Pi et le TLS Cloudflare ne sont pas simulés comme des résultats matériels.

Tous les comptes, clés et notes d’essai sont synthétiques et isolés dans `.notesgym-test-data`. Les processus de test filtrent les variables NOTESGYM héritées avant d’injecter leur configuration pour ne pas réutiliser un chemin ou une clé d’instance réelle. Une base SQLite étrangère est refusée sans initialisation ni modification, vérifiée octet pour octet. Aucune donnée réelle n’a été lue ou migrée. OAuth persiste désormais en SQLite ; le mode production demande activation explicite, HTTPS et proxy déclaré. Cela ne lève ni les vérifications matérielles/externe restantes ni l’exigence d’autorisation avant déploiement. Le paquet local n’a pas été soumis à OpenAI et n’est pas prêt pour publication.
