import { readOAuthConfig } from '../integration/oauth-config.js';
import { openOAuthStore } from '../integration/oauth-store.js';
if (!process.argv.includes('--all-authorizations')) throw new Error('Explicit --all-authorizations flag required (OAuth records only)');
const { file, cookieKeys, jwks, issuer } = readOAuthConfig(process.env);
const store = openOAuthStore({ file, secret: cookieKeys[0], binding: JSON.stringify({ issuer, cookieKeys, jwks }) });
try { store.revokeAll(); console.log('All OAuth authorizations invalidated. Academic accounts and notes are untouched.'); }
finally { store.close(); }
