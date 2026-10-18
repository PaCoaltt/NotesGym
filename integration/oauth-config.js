import path from 'node:path';
import { loadOAuthKeys } from './oauth-keys.js';
import { proxyPolicy } from './security.js';

export function readOAuthConfig(env) {
  if (env.NODE_ENV === 'production' && env.NOTESGYM_MCP_ENABLED !== 'true') throw new Error('Explicit MCP activation required');
  let base;
  try { base = new URL(env.NOTESGYM_PUBLIC_URL || 'http://localhost:8080'); }
  catch { throw new Error('Invalid public origin'); }
  if (base.pathname !== '/' || base.search || base.hash || base.username || base.password) throw new Error('NOTESGYM_PUBLIC_URL must be an origin');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (base.protocol !== 'https:' && !(local && env.NODE_ENV !== 'production')) throw new Error('HTTPS is required');
  const origin = base.origin; const issuer = `${origin}/oauth`; const resource = `${origin}/mcp`;
  const accessTokenTTL = Number(env.NOTESGYM_OAUTH_ACCESS_TTL_SECONDS || 600);
  if (!Number.isInteger(accessTokenTTL) || accessTokenTTL < 1 || accessTokenTTL > 600) throw new Error('Access token TTL must be between 1 and 600 seconds');
  let clients;
  try { clients = JSON.parse(env.NOTESGYM_OAUTH_CLIENTS || '[]'); }
  catch { throw new Error('Invalid JSON configuration: NOTESGYM_OAUTH_CLIENTS'); }
  if (!Array.isArray(clients) || !clients.length) throw new Error('Configure NOTESGYM_OAUTH_CLIENTS');
  const ids = new Set();
  for (const client of clients) {
    if (!client || typeof client.client_id !== 'string' || !client.client_id || ids.has(client.client_id) || !Array.isArray(client.redirect_uris) || !client.redirect_uris.length) throw new Error('Unique clients and exact redirect URIs required');
    ids.add(client.client_id);
    for (const raw of client.redirect_uris) {
      let url;
      try { url = new URL(raw); } catch { throw new Error('Invalid OAuth redirect URI'); }
      if (url.hash || url.username || url.password || raw.includes('*') || (url.protocol !== 'https:' && !(local && env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Invalid OAuth redirect URI');
    }
  }
  const proxy = proxyPolicy(env);
  if (env.NODE_ENV === 'production' && !proxy.enabled) throw new Error('Production HTTP origin requires an explicitly trusted HTTPS proxy');
  return { base, origin, issuer, resource, accessTokenTTL, clients, ...loadOAuthKeys(env), proxy,
    file: path.resolve(env.NOTESGYM_OAUTH_DB || path.join(env.NOTESGYM_DATA_DIR || 'data', 'oauth', 'oauth.sqlite')) };
}
