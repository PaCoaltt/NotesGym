# Consentement OAuth Firefox : Origin null

Correction du 19 octobre 2026 sur `feature/chatgpt-mcp`, PR #20.

## Cause et reproduction

Le premier essai ChatGPT/Firefox 158 rapporté par l’opérateur affiche le consentement, puis reçoit HTTP 403 `Cross-origin request refused`. Les éléments HAR fournis dans la demande indiquent un POST URL-encodé, `Origin: null` et `Sec-Fetch-Site: same-origin`.

`securityHeaders()` applique `Referrer-Policy: no-referrer`, y compris à la page de consentement. Pour un POST de navigation (mode différent de `cors`), l’algorithme [Fetch « append a request Origin header »](https://fetch.spec.whatwg.org/#append-a-request-origin-header) prévoit de remplacer l’origine sérialisée par `null` avec cette politique. Mozilla documente expressément son application aux [POST de formulaires dans le bug 1504085](https://bugzilla.mozilla.org/show_bug.cgi?id=1504085). `null` ne prouve donc pas ici que le document émetteur possède une origine opaque : il peut s’agir d’une origine masquée par la politique de confidentialité. Les métadonnées Fetch décrivent séparément le contexte de navigation ; `same-origin` n’est pas contradictoire.

La politique envoyée par NotesGym explique ainsi la combinaison rapportée, sans qu’un iframe sandboxé ou une origine hostile soit nécessaire. Ce diagnostic repose sur le code, les informations HAR fournies et les sources primaires ; aucun nouvel essai dans Firefox 158 ou ChatGPT réel n’a été exécuté pendant cette correction. Les extraits HAR fournis ne précisent pas `Sec-Fetch-Mode` et `Sec-Fetch-Dest` : le correctif exige respectivement `navigate` et `document`, valeurs attendues pour ce formulaire. Leur présence doit être confirmée lors du prochain essai navigateur.

Le test d’intégration ajouté démarre le vrai serveur sur loopback avec comptes, clés, données et base OAuth synthétiques isolés. Il récupère une interaction et son CSRF, puis soumet le formulaire avec ces en-têtes. Avant correction, le test échoue avec **403 au lieu de 303**, corps `{"error":"Cross-origin request refused"}`. La première tentative dans le bac à sable n’avait pas atteint le test, car les dépendances pnpm liées étaient inaccessibles ; l’exécution autorisée hors bac à sable a reproduit le refus.

## Correction et garanties

L’exception est locale au gestionnaire POST et à la route exacte `/chatgpt/interaction/[A-Za-z0-9_-]+`, uniquement pour la valeur littérale `Origin: null`. `sameOrigin()` n’a pas changé. Aucune règle CORS globale ni autorisation d’origine opaque n’a été ajoutée aux API.

Avant toute approbation ou tout refus OAuth, le parcours exige :

1. Une session NotesGym authentifiée ; les contrôles Host, proxy déclaré et limites de requêtes existants s’appliquent toujours.
2. `Sec-Fetch-Site: same-origin`, `Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`, et le type MIME exact `application/x-www-form-urlencoded` (paramètres MIME possibles). Une métadonnée requise absente ou différente entraîne 403. Un Referer fourni doit être une URL de la même origine ; son absence reste normale avec `no-referrer`.
3. Un jeton CSRF aléatoire présent dans la Map serveur, valable cinq minutes, lié au compte, à l’empreinte des cookies et au chemin exact. Il est consommé synchroniquement avant tout appel OAuth asynchrone. Son expiration est aussi vérifiée après lecture du corps pour couvrir un formulaire expirant pendant cette lecture.
4. Une interaction valide résolue par oidc-provider à partir de ses cookies signés, dont l’UID correspond à celui du formulaire et au chemin demandé.

L’exception de provenance seule ne termine aucune interaction et ne crée aucun grant. Les sessions, CSRF et interactions restent obligatoires. Les en-têtes `Sec-Fetch-*` apportent une défense de navigateur complémentaire ; ils ne remplacent pas l’authentification ni le secret CSRF. Les protections `no-store`, `no-referrer`, CSP et anti-iframe restent présentes.

`Origin: null` reste refusé sur `/api/*`, `/mcp`, `/chatgpt/disconnect` et les chemins non conformes. Une origine explicite hostile et un contexte réellement cross-site restent refusés, même avec un CSRF valide. Aucune modification des calculs scolaires, des données d’instance ou des clés OAuth existantes.

## Résultats exacts

Exécutés sous Windows avec Node.js **24.19.0**, dépendances déjà installées, hors bac à sable pour accéder aux liens pnpm :

| Commande | Résultat |
| --- | --- |
| `node --test --test-name-pattern='Firefox no-referrer' test/chatgpt-mcp.test.js` avant correction | 1 test, 0 réussi, 1 échec ; 403 `Cross-origin request refused` au lieu de 303 |
| `node --test --test-name-pattern='Firefox no-referrer\|opaque' test/chatgpt-mcp.test.js` après correction | 36 tests réussis (5 tests parents et 31 sous-tests), 0 échec, 0 ignoré ; 6906,3598 ms |
| `npm test` | 104 tests réussis, 0 échec, 0 annulé, 0 ignoré ; 21901,0615 ms ; sortie 0 |
| `npm run lint` | Sortie 0, aucun diagnostic ESLint |
| `npm run build` | Sortie 0 ; Vite 6.4.3, 3577 modules, 9,33 s ; JS 1057,42 kB, gzip 311,66 kB |
| `git diff --check` | Sortie 0 ; avertissements LF/CRLF Windows uniquement |

Les nouveaux tests couvrent : autorisation (303), refus (`access_denied`, aucun code), échange PKCE (200), proxy HTTPS de confiance simulé, Referer même origine accepté, CSRF absent/invalide/rejoué, rejeu concurrent (exactement un 303 et un 403), compte différent, autre session du même compte, autre chemin d’interaction, cookie d’interaction absent, absence d’authentification (401), invalidation des formulaires après redémarrage, contextes cross-site/same-site/none ou incomplets, fetch CORS/no-cors, iframe, mauvais types MIME, origine hostile et Referer hostile/malformé. Les API et MCP sont testés avec `Origin: null`, y compris avec un bearer OAuth valide pour MCP. L’expiration à cinq minutes est contrôlée dans le code ; son échéance n’a pas fait l’objet d’une attente de cinq minutes dans ces tests.

La fixture HTTP conserve désormais Host et Sec-Fetch-Mode : le `fetch` de Node réécrivait ce dernier en `cors`, ce qui empêchait une simulation fidèle. Pendant l’écriture des tests, des assertions ont aussi été ajustées : une autorisation déjà consentie pouvait contourner le formulaire, et un redémarrage invalide d’abord la session applicative (401), nécessitant une reconnexion pour vérifier le refus du formulaire (403). Ces essais intermédiaires ne sont pas comptés comme des réussites finales.

Le build conserve son avertissement de bundle supérieur à 500 kB. Aucun audit de dépendances supplémentaire, essai Firefox/ChatGPT réel, tunnel, déploiement, fusion ou validation Docker/ARM64 n’est inclus. Au prochain essai externe, confirmer les métadonnées de navigation dans le HAR, l’autorisation et le refus sur le formulaire, puis la connexion MCP ; ne pas joindre cookies, corps CSRF, codes ou jetons à la PR.
