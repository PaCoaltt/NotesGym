import fs from 'node:fs';
const before = JSON.parse(fs.readFileSync('docs/chatgpt-dependency-audit-before.json', 'utf8'));
const after = JSON.parse(fs.readFileSync('docs/chatgpt-dependency-audit.json', 'utf8'));
const lock = fs.readFileSync('pnpm-lock.yaml', 'utf8');
const contexts = {
  jspdf: 'Export navigateur : texte et formes uniquement. Les voies Node/fichiers, HTML, polices externes, annotations et images hostiles des avis ne sont pas appelées. Mise à jour néanmoins retenue, avec test du vrai rapport.',
  dompurify: 'Dépendance optionnelle de jsPDF pour html(), non appelée par le rapport NotesGym. Aucun HTML scolaire fourni à ce parseur.',
  quill: 'Paquet installé mais aucun import dans src ; aucun éditeur Quill exposé. Parent react-quill retiré.',
  moment: 'Aucun import applicatif ; paquet retiré, sans changement de date affichée.',
  'react-router': 'SPA BrowserRouter, pas de framework/SSR React Router côté serveur. Le scénario de redirection de l’avis n’est pas configuré ; correctif de maintenance appliqué.',
  'brace-expansion': 'Outils de build/lint : motifs du dépôt, jamais un argument MCP ou une note. Pas de build à partir de contenu scolaire.',
  'js-yaml': 'Configuration ESLint du dépôt ; aucun YAML fourni par un utilisateur n’est analysé dans une route serveur.',
  nanoid: 'Chaîne PostCSS de build ; les identifiants des sessions/notes utilisent crypto, pas nanoid avec paramètres utilisateurs.',
  postcss: 'Compile le CSS du dépôt ; les requêtes/notes utilisateur ne sont jamais compilées comme CSS.',
  browserslist: 'Chaîne Babel/build, configuration et fichiers contrôlés du dépôt, sans valeur fournie aux routes HTTP.',
  'baseline-browser-mapping': 'Données de cibles navigateur pendant le build, sans sélection contrôlée par un utilisateur de NotesGym.',
  braces: 'Chokidar/Tailwind pendant le build : une pile peut être épuisée par un motif de glob profondément imbriqué. Aucun motif utilisateur à cette entrée ; ne pas construire des dépôts non fiables.',
  'source-map-js': 'Traitement des source maps du build ; aucune source map hostile acceptée par le backend.',
  'postcss-selector-parser': 'Tailwind parse les sélecteurs du dépôt ; pas de CSS utilisateur. Le correctif 7.1.6 impose un remplacement majeur de la dépendance 6.x, différé plutôt que forcé.'
};
const clean = value => String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
const versions = name => [...new Set([...lock.matchAll(new RegExp('^  ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '@([^:(\\s]+)', 'gm'))].map(m => m[1]))].join(', ') || 'retiré';
const rows = before.findings.map(a => {
  const remains = after.findings.some(b => b.advisory === a.advisory);
  const paths = [...new Set(a.occurrences.flatMap(f => f.paths))].join('; ');
  let environments = [...new Set(a.occurrences.flatMap(f => f.environments))].join(', ');
  if (['postcss', 'braces', 'source-map-js', 'postcss-selector-parser', 'nanoid'].includes(a.package)) environments += ' ; aussi installé via le peer Tailwind en V1, retiré du runtime en V1.1';
  return `| [${a.advisory}](${a.url}) ${clean(a.title)} | ${a.severity} | ${a.package} ${a.occurrences.map(f => f.version).join(', ')} | ${clean(paths)} | ${environments} | ${contexts[a.package]} | ${a.patched === '<0.0.0' ? 'Pas de correctif annoncé' : clean(a.patched)} | ${remains ? 'Résiduel' : 'Corrigé/retiré'} ; verrou actuel : ${versions(a.package)} |`;
});
fs.writeFileSync('docs/chatgpt-vulnerabilities.md', `# Analyse des dépendances V1 → V1.1

L’état initial de 50 avis est conservé dans [le rapport avant correction](chatgpt-dependency-audit-before.json). L’état actuel figure dans [l’audit complet](chatgpt-dependency-audit.json) et [l’audit production](chatgpt-dependency-audit-production.json). Ces rapports proviennent du registre via pnpm 10.11.0 et du verrou réel ; aucun « audit fix --force » n’a été utilisé. Les 48 avis absents du rapport actuel ont été corrigés par mise à jour ou retrait de la chaîne concernée. Aucun avis critique ne reste.

## Choix de correction

- jsPDF 2.5.2 → 4.2.1 : seule mise à jour majeure directe, motivée par les correctifs de sécurité. Le générateur PDF existant a été extrait sans modification de ses calculs pour tester son exécution réelle (trois systèmes, deux semestres, exclusions, plusieurs pages, format PDF et absence de mutation). L’import nommé est compatible avec Node et Vite. Le module de conversions, sans JSX, porte désormais l’extension .js ; interface inchangée. La revue visuelle du PDF dans un navigateur reste manuelle.
- React Router DOM 7.18.1 → 7.18.4 et PostCSS 8.5.16 → 8.5.30 : mises à jour ciblées de maintenance. Les autres transitives ont été mises à jour dans les plages déjà permises par leurs parents.
- react-quill/Quill et moment : aucun import dans le code, retrait du manifeste.
- tailwindcss-animate : utilisé uniquement par tailwind.config.js ; déplacement en devDependencies. Son peer Tailwind faisait installer la chaîne de build dans l’image runtime V1. L’audit --prod confirme son retrait. Le build conserve toutes les animations générées.

## Deux avis résiduels, uniquement dans le build

braces 3.0.3 (élevé, aucun correctif publié par le registre) et postcss-selector-parser 6.1.4 (modéré, corrigé à partir de 7.1.6) restent sous Tailwind 3. Ils ne sont pas dans l’installation --prod ni importés par le serveur MCP/HTTP. Leur exploitabilité dépend de motifs/sélecteurs hostiles pendant une construction. Les tests externes contrôlés doivent utiliser une image construite depuis ce dépôt vérifié ; ne pas exposer Vite, un compilateur CSS ou un service de build aux utilisateurs. Une migration Tailwind ou un correctif amont reste à suivre. Cette justification réduit l’exposition ; elle ne déclare pas les bibliothèques non vulnérables.

## Tableau exhaustif des 50 avis initiaux

Les environnements ci-dessous distinguent l’usage applicatif et la présence dans la chaîne de dépendances initiale. « production » comprend les dépendances frontend installées au build ; cela ne signifie pas qu’elles sont exécutées par le backend. Pour Tailwind, la présence accidentelle via un peer en V1 est explicitement indiquée.

| Avis et condition signalée | Gravité | Paquet/version initiale | Chaîne initiale | Présence/usage | Conditions dans NotesGym | Correctif publié | Résultat |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}

Régénération : node scripts/chatgpt-audit.mjs docs/chatgpt-dependency-audit.json ; node scripts/chatgpt-audit.mjs docs/chatgpt-dependency-audit-production.json --prod ; node scripts/chatgpt-audit-table.mjs. Un audit sans avis connus ne constitue pas une revue de sécurité complète.
`);
console.log('Vulnerability analysis generated for ' + rows.length + ' initial advisories.');
