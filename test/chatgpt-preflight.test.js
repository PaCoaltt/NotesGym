import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { preflight } from '../integration/preflight.js';
import { readOAuthConfig } from '../integration/oauth-config.js';
import { openOAuthStore } from '../integration/oauth-store.js';

test('key provisioning is explicit and never overwrites; preflight is offline and does not initialize storage', () => {
  const root = path.join(process.cwd(), '.notesgym-test-data'); fs.mkdirSync(root, { recursive: true });
  const dir = fs.mkdtempSync(path.join(root, 'preflight-')); const keyFile = path.join(dir, 'keys.json');
  const command = ['scripts/chatgpt-dev-keys.mjs', '--file', keyFile];
  const first = spawnSync(process.execPath, command, { encoding: 'utf8', windowsHide: true }); assert.equal(first.status, 0);
  const before = fs.readFileSync(keyFile);
  assert.notEqual(spawnSync(process.execPath, command, { windowsHide: true }).status, 0);
  assert.deepEqual(fs.readFileSync(keyFile), before);
  const env = { NODE_ENV: 'production', NOTESGYM_MCP_ENABLED: 'true', NOTESGYM_PUBLIC_URL: 'https://notesgym.example.invalid',
    NOTESGYM_OAUTH_KEYS_FILE: keyFile, NOTESGYM_OAUTH_DB: path.join(dir, 'unused', 'oauth.sqlite'), NOTESGYM_TRUST_PROXY: 'true',
    NOTESGYM_TRUSTED_PROXY_IPS: '127.0.0.1', NOTESGYM_OAUTH_CLIENTS: JSON.stringify([{ client_id: 'synthetic', redirect_uris: ['https://client.example.invalid/callback'] }]) };
  assert.equal(preflight(env, { external: true }).ok, true);
  const cli = spawnSync(process.execPath, ['scripts/chatgpt-preflight.mjs', '--external'], { env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('NOTESGYM_'))), ...env }, encoding: 'utf8', windowsHide: true });
  assert.equal(cli.status, 0); assert.equal(JSON.parse(cli.stdout).ok, true); assert.ok(!cli.stdout.includes('cookieKeys'));
  assert.equal(fs.existsSync(path.join(dir, 'unused')), false);
  assert.throws(() => preflight({ ...env, NOTESGYM_TRUSTED_PROXY_IPS: '' }, { external: true }), /Trusted proxy/);
  assert.throws(() => preflight({ ...env, NOTESGYM_PUBLIC_URL: 'http://localhost:8080' }, { external: true }), /HTTPS/);
  assert.throws(() => preflight({ ...env, NOTESGYM_OAUTH_COOKIE_KEYS: '[]' }), /ambiguous/);
  const config = readOAuthConfig(env);
  const binding = JSON.stringify({ issuer: config.issuer, cookieKeys: config.cookieKeys, jwks: config.jwks });
  const store = openOAuthStore({ file: config.file, secret: config.cookieKeys[0], binding }); store.close();
  assert.equal(preflight(env, { external: true }).ok, true);
  const changed = JSON.parse(before); changed.cookieKeys = ['x'.repeat(64)];
  fs.writeFileSync(keyFile, JSON.stringify(changed));
  assert.throws(() => preflight(env, { external: true }), /issuer or keys changed/);
});
