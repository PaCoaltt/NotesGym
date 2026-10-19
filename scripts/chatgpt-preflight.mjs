import { preflight } from '../integration/preflight.js';
try { console.log(JSON.stringify(preflight(process.env, { external: process.argv.includes('--external') }), null, 2)); }
catch (error) { console.error('Preflight failed: ' + error.message); process.exitCode = 1; }
