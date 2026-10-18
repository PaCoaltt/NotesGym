# Validation de la V1 NotesGym × ChatGPT

Vérifications exécutées le 18 octobre 2026 sous Windows, Node.js **24.19.0**, après installation avec **pnpm 10.11.0**, verrou figé. Base de la branche : `origin/main` à `0493230276e89e3d48d31b03657f07c3e085a010`.

| Vérification | Résultat réel |
| --- | --- |
| `npx --yes pnpm@10.11.0 install --frozen-lockfile --ignore-scripts` | Réussite ; 673 paquets installés, verrou respecté |
| `node --test test/chatgpt-mcp.test.js` | 6 tests réussis, 0 échec lors de l’exécution ciblée |
| `npm test` | 57 tests réussis, 0 échec, 0 ignoré ; inclut 51 tests historiques et les 6 tests d’intégration |
| `npm run lint` | Réussite, code de sortie 0 ; lint étendu aux nouveaux modules serveur et tests |
| `npm run build` | Réussite avec Vite 6.4.3 ; 3577 modules ; JS principal 1056,52 Kio, gzip 311,37 Kio |
| `git diff --check` | Réussite ; avertissements Git de conversion LF/CRLF sous Windows, sans erreur de whitespace |
| Audit pnpm | 50 avis : 4 faibles, 21 modérés, 23 élevés, 2 critiques ; publication bloquée avant revue/correction |
| Docker, Compose, ARM64 | Non exécutés : Docker absent de l’environnement |
| ChatGPT réel, tunnel, domaine, portail | Non exécutés : aucun endpoint HTTPS ni compte/connexion de test configuré |

Le build signale un bundle supérieur à 500 Kio. Cette mission n’effectue pas de refonte ou découpage du frontend.

L’audit complet est résumé dans [chatgpt-dependency-audit.json](chatgpt-dependency-audit.json), avec les identifiants et liens des avis. Les paquets concernés incluent notamment jsPDF, DOMPurify, Quill et plusieurs dépendances de construction déjà présentes au manifeste initial. Le nombre d’avis n’est pas le nombre de paquets vulnérables. L’ajout MCP ne corrige pas ces avis, et aucune commande `audit fix --force` ou mise à jour majeure non testée n’a été appliquée.

Certaines premières tentatives ont échoué à cause du bac à sable : récupération Git refusée, téléchargement npm/pnpm inaccessible, résolution de paquets pnpm refusée et accès esbuild bloqué. Elles ont été relancées avec autorisation hors du bac à sable. Une première installation npm sans verrou a servi au démarrage, puis a été remplacée par l’installation pnpm exacte avant validation finale. `npm audit` a échoué avec ENOLOCK car le projet utilise `pnpm-lock.yaml` ; l’audit pnpm a ensuite produit les résultats ci-dessus.

Pendant le développement, les premiers tests OAuth ont révélé une erreur de montage du préfixe `/oauth` et un scope de consentement incomplet ; les deux ont été corrigés avant les tests réussis. Ces essais ne sont pas présentés comme des résultats de revue OpenAI.

Les tests automatisés vérifient des échanges OAuth HTTP réels, l’utilisation du SDK MCP client, les six outils, les moyennes et arrondis partagés, l’isolation A/B, le consentement/refus, PKCE, les codes à usage unique, la découverte, le scope et la ressource, l’expiration, les jetons d’un autre issuer, les deux modes de révocation, les paramètres invalides et l’absence d’écriture des simulations. Le stockage est testé avec 20 créations simultanées, des modifications concurrentes, un JSON corrompu non écrasé, les limites d’entrée, le rate limiting et les erreurs sans détail interne.

Tous les comptes et notes utilisés pour ces essais sont synthétiques et isolés dans `.notesgym-test-data`. Aucune donnée de production n’a été lue ou migrée. OAuth reste volontairement volatil et interdit en mode production. Le paquet local n’a pas été soumis à OpenAI et n’est pas prêt pour publication.
