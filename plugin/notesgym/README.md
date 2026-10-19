# NotesGym — paquet de développement

Ce paquet utilise le format portable Agent Plugins décrit dans la [documentation officielle](https://developers.openai.com/plugins/build/plugins).

Le nom public est **NotesGym**. La description française et les exemples figurent dans `plugin.json` ; la description anglaise est son champ `description`.

`mcp.json` pointe intentionnellement vers localhost. Il n’est pas prêt pour l’annuaire public. Après validation du déploiement, remplacer l’endpoint et le client OAuth par les valeurs réelles ; conserver l’authentification OAuth. Ne jamais inclure de mot de passe, clé de signature ou jeton dans ce paquet. Le client public utilise PKCE, sans secret.

Le logo existant `public/favicon.png` peut être réutilisé après validation éditoriale. Aucune capture ou approbation n’est fournie. Les URLs de confidentialité, les coordonnées du responsable et l’identité vérifiée restent à renseigner avec des informations réelles.

Voir [le guide complet](../../docs/chatgpt-plugin.md), notamment les critères bloquant toute publication. Aucun paquet n’a été soumis à OpenAI.
