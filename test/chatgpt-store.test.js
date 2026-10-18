import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, copyFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { openOAuthStore } from '../integration/oauth-store.js';
import { backupOAuth } from '../scripts/chatgpt-oauth-backup.mjs';
import { proxyPolicy, rateLimiter } from '../integration/security.js';
import { DatabaseSync } from 'node:sqlite';

function fixture() {
  const root = path.join(process.cwd(), '.notesgym-test-data'); mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(path.join(root, 'oauth-store-'));
  return { dir, file: path.join(dir, 'oauth.sqlite'), secret: 'synthetic-cookie-key'.repeat(4), binding: 'synthetic-issuer-and-keys' };
}

test('SQLite adapter preserves constraints, consumed artifacts, isolation and encrypted data', async () => {
  const config = fixture(); let clock = Date.now();
  let store = openOAuthStore({ ...config, now: () => clock });
  const session = new store.adapter('Session'); const grants = new store.adapter('Grant'); const tokens = new store.adapter('AccessToken');
  await session.upsert('session', { uid: 'unique', accountId: 'A' }, 60);
  await assert.rejects(session.upsert('other-session', { uid: 'unique', accountId: 'B' }, 60));
  assert.equal((await session.findByUid('unique')).accountId, 'A');
  for (const [jti, accountId, clientId] of [['a1', 'A', 'C1'], ['a2', 'A', 'C2'], ['b1', 'B', 'C1']]) {
    await grants.upsert(jti, { jti, accountId, clientId }, 60);
    await tokens.upsert('token-' + jti, { grantId: jti, accountId, clientId, sensitive: 'never-plaintext' }, 10);
  }
  const code = new store.adapter('AuthorizationCode');
  await code.upsert('code', { grantId: 'a1' }, 60); await code.consume('code');
  await assert.rejects(code.consume('code'), /already consumed/);
  assert.ok(!readFileSync(config.file).includes(Buffer.from('never-plaintext')));
  store.close(); store = openOAuthStore({ ...config, now: () => clock });
  try {
    assert.ok((await new store.adapter('AuthorizationCode').find('code')).consumed);
    assert.equal(store.listGrants('A', 'C1').length, 1);
    store.revokeAccount('A', 'C1');
    assert.equal(await new store.adapter('AccessToken').find('token-a1'), undefined);
    assert.equal(store.listGrants('A', 'C2').length, 1); assert.equal(store.listGrants('B').length, 1);
    clock += 11000;
    assert.equal(await new store.adapter('AccessToken').find('token-b1'), undefined);
    assert.ok(store.cleanup() >= 2); assert.equal(store.healthy(), true);
  } finally { store.close(); }
  assert.throws(() => openOAuthStore({ ...config, binding: 'changed-issuer' }), /issuer or keys changed/);
  const unrelated = path.join(config.dir, 'unrelated.sqlite');
  const other = new DatabaseSync(unrelated); other.exec('CREATE TABLE unrelated (value TEXT)'); other.close();
  chmodSync(unrelated, 0o600);
  const bytes = readFileSync(unrelated);
  assert.throws(() => openOAuthStore({ ...config, file: unrelated }), /not an OAuth store/);
  assert.deepEqual(readFileSync(unrelated), bytes, 'an unrelated database is not initialized or migrated');
});

test('online backup recovers a consistent encrypted store; restoration can invalidate all OAuth records', async () => {
  const config = fixture(); const store = openOAuthStore(config);
  const backup = path.join(config.dir, 'backup.sqlite');
  try {
    await new store.adapter('Grant').upsert('g', { jti: 'g', accountId: 'A', clientId: 'C' }, 600);
    await backupOAuth(config.file, backup);
    await assert.rejects(backupOAuth(config.file, backup), /new file/);
  } finally { store.close(); }
  const restoredFile = path.join(config.dir, 'restored.sqlite'); copyFileSync(backup, restoredFile);
  const recovered = openOAuthStore({ ...config, file: restoredFile });
  try { assert.equal(recovered.listGrants('A').length, 1); recovered.revokeAll(); assert.equal(recovered.listGrants('A').length, 0); }
  finally { recovered.close(); }
});

test('proxy client IP is accepted only from an explicit peer; spoofed headers cannot bypass quotas', () => {
  const env = { NOTESGYM_TRUST_PROXY: 'true', NOTESGYM_TRUSTED_PROXY_IPS: '127.0.0.1,::1' };
  const policy = proxyPolicy(env);
  const request = (remoteAddress, ip) => ({ socket: { remoteAddress }, headers: { 'cf-connecting-ip': ip } });
  assert.equal(policy.clientIP(request('198.51.100.1', '192.0.2.1')), '198.51.100.1');
  assert.equal(policy.clientIP(request('::ffff:127.0.0.1', '192.0.2.1')), '192.0.2.1');
  assert.throws(() => policy.clientIP(request('127.0.0.1', '192.0.2.1,192.0.2.2')), { status: 400 });
  assert.throws(() => proxyPolicy({ NOTESGYM_TRUST_PROXY: 'true' }), /Trusted proxy/);
  const allow = rateLimiter({ limit: 1 });
  assert.equal(allow(policy.clientIP(request('198.51.100.1', '192.0.2.1'))), true);
  assert.equal(allow(policy.clientIP(request('198.51.100.1', '192.0.2.2'))), false);
  assert.equal(allow(policy.clientIP(request('127.0.0.1', '192.0.2.2'))), true);
});
