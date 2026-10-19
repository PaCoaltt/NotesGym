import fs from 'node:fs';
import path from 'node:path';
import { readOAuthConfig } from './oauth-config.js';
import { inspectOAuthStore } from './oauth-store.js';

/** Configuration-only: no network, database initialization, DNS or tunnel. */
export function preflight(env, { external = false } = {}) {
  const config = readOAuthConfig(env);
  if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node 24 or newer required');
  if (env.NOTESGYM_MCP_ENABLED !== 'true') throw new Error('MCP is disabled');
  if (external && (config.base.protocol !== 'https:' || !config.proxy.enabled)) throw new Error('External tests require HTTPS and an explicitly trusted TLS proxy');
  if (external && config.clients.some(c => c.redirect_uris.some(uri => new URL(uri).protocol !== 'https:'))) throw new Error('External callbacks require HTTPS');
  let parent = path.dirname(config.file);
  while (!fs.existsSync(parent)) parent = path.dirname(parent);
  fs.accessSync(parent, fs.constants.R_OK | fs.constants.W_OK);
  if (fs.existsSync(config.file)) {
    const stat = fs.lstatSync(config.file);
    if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077))) throw new Error('OAuth database must be a private regular file');
    const directory = fs.statSync(path.dirname(config.file));
    if (process.platform !== 'win32' && (directory.mode & 0o077)) throw new Error('OAuth directory requires mode 0700');
    inspectOAuthStore(config.file, JSON.stringify({ issuer: config.issuer, cookieKeys: config.cookieKeys, jwks: config.jwks }));
  }
  return { ok: true, mode: external ? 'external-config' : 'local-config', checks: ['explicit activation', 'origin/issuer/resource consistency',
    'unique clients and exact callbacks', 'persistent keys present', 'storage parent accessible', 'proxy trust configuration'],
    manual: ['Confirm disposable data and private volume ownership', 'Run restart/revocation and backup/restore tests',
      'Verify TLS, Host and forwarded headers at the actual proxy', 'Copy the actual ChatGPT callback and test both accounts',
      'Review current dependency audit and Windows ACLs/Linux permissions', 'No deployment, DNS or tunnel performed by this check'] };
}
