import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const hash = value => value == null ? null : crypto.createHash('sha256').update(String(value)).digest('hex');

export function inspectOAuthStore(file, binding) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (db.prepare('PRAGMA user_version').get().user_version !== 1 || db.prepare('PRAGMA quick_check').get().quick_check !== 'ok') throw new Error('Invalid OAuth database');
    if (db.prepare("SELECT value FROM metadata WHERE key='binding'").get()?.value !== hash(binding)) throw new Error('OAuth issuer or keys changed');
    return true;
  } finally { db.close(); }
}

/** oidc-provider's adapter contract, with no OAuth protocol implementation here.
 * Dedicated encrypted SQLite store; academic JSON files are never migrated. */
export function openOAuthStore({ file, secret, binding, now = Date.now }) {
  const directory = path.dirname(path.resolve(file));
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file)) fs.closeSync(fs.openSync(file, 'wx', 0o600));
  for (const target of [directory, file]) {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077))) throw new Error('OAuth storage requires private directory/file permissions (0700/0600)');
  }
  const key = crypto.createHash('sha256').update('NotesGym OAuth SQLite encryption v1\0').update(secret).digest();
  const db = new DatabaseSync(file);
  const transaction = work => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  try {
    db.exec('PRAGMA busy_timeout=5000;');
    const version = db.prepare('PRAGMA user_version').get().user_version;
    if (![0, 1].includes(version)) throw new Error('Unsupported OAuth storage schema');
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    if (version === 0 && tables.length) throw new Error('Refusing a nonempty database that is not an OAuth store');
    if (version === 1 && (!tables.some(t => t.name === 'metadata') || db.prepare("SELECT value FROM metadata WHERE key='binding'").get()?.value !== hash(binding))) {
      throw new Error('OAuth issuer or keys changed: restore the original configuration; automatic key replacement is refused');
    }
    db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA secure_delete=ON; PRAGMA trusted_schema=OFF;');
    transaction(() => {
      db.exec(`CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS records (
          model TEXT NOT NULL, id_hash TEXT NOT NULL, payload BLOB NOT NULL,
          expires_at INTEGER, consumed INTEGER, grant_hash TEXT, uid_hash TEXT, user_code_hash TEXT,
          account_hash TEXT, client_hash TEXT, PRIMARY KEY (model, id_hash)
        ) STRICT;
        CREATE UNIQUE INDEX IF NOT EXISTS records_uid ON records(model, uid_hash) WHERE uid_hash IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS records_user_code ON records(model, user_code_hash) WHERE user_code_hash IS NOT NULL;
        CREATE INDEX IF NOT EXISTS records_grant ON records(grant_hash);
        CREATE INDEX IF NOT EXISTS records_expiry ON records(expires_at);
        CREATE INDEX IF NOT EXISTS records_account ON records(model, account_hash, client_hash);`);
      const previous = db.prepare("SELECT value FROM metadata WHERE key='binding'").get();
      const expected = hash(binding);
      if (previous && previous.value !== expected) throw new Error('OAuth issuer or keys changed: restore the original configuration; automatic key replacement is refused');
      if (!previous) db.prepare("INSERT INTO metadata(key,value) VALUES ('binding',?)").run(expected);
      db.exec('PRAGMA user_version=1');
    });
  } catch (error) { db.close(); throw error; }

  function encode(model, idHash, payload) {
    const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(model + ':' + idHash));
    const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  }
  function decode(row) {
    if (!row) return undefined;
    try {
      const bytes = Buffer.from(row.payload); const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28)); cipher.setAAD(Buffer.from(row.model + ':' + row.id_hash));
      const result = JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
      if (row.consumed != null) result.consumed = row.consumed;
      return result;
    } catch { throw new Error('OAuth storage integrity check failed'); }
  }
  const live = '(expires_at IS NULL OR expires_at > ?)';
  const lookup = (model, column, value) => decode(db.prepare(`SELECT * FROM records WHERE model=? AND ${column}=? AND ${live}`).get(model, hash(value), now()));
  const cleanup = () => transaction(() => {
    db.prepare("DELETE FROM records WHERE grant_hash IN (SELECT id_hash FROM records WHERE model='Grant' AND expires_at <= ?)").run(now());
    return Number(db.prepare('DELETE FROM records WHERE expires_at <= ?').run(now()).changes);
  });
  class Adapter {
    constructor(model) { this.model = model; }
    async upsert(id, payload, expiresIn) {
      const expiry = [Number.isFinite(expiresIn) ? now() + Math.max(0, expiresIn) * 1000 : null, Number.isFinite(payload.exp) ? payload.exp * 1000 : null].filter(v => v != null);
      transaction(() => {
        if (db.prepare('SELECT COUNT(*) AS count FROM records').get().count >= 100000 && !lookup(this.model, 'id_hash', id)) throw new Error('OAuth storage capacity reached');
        const idHash = hash(id);
        db.prepare(`INSERT INTO records(model,id_hash,payload,expires_at,consumed,grant_hash,uid_hash,user_code_hash,account_hash,client_hash)
          VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(model,id_hash) DO UPDATE SET
          payload=excluded.payload, expires_at=excluded.expires_at, consumed=COALESCE(records.consumed,excluded.consumed),
          grant_hash=excluded.grant_hash, uid_hash=excluded.uid_hash, user_code_hash=excluded.user_code_hash,
          account_hash=excluded.account_hash, client_hash=excluded.client_hash`).run(this.model, idHash, encode(this.model, idHash, payload),
          expiry.length ? Math.min(...expiry) : null, payload.consumed || null, hash(payload.grantId), hash(payload.uid), hash(payload.userCode), hash(payload.accountId), hash(payload.clientId));
      });
    }
    async find(id) { return lookup(this.model, 'id_hash', id); }
    async findByUid(uid) { return lookup(this.model, 'uid_hash', uid); }
    async findByUserCode(code) { return lookup(this.model, 'user_code_hash', code); }
    async consume(id) {
      const changed = db.prepare(`UPDATE records SET consumed=? WHERE model=? AND id_hash=? AND consumed IS NULL AND ${live}`).run(Math.floor(now() / 1000), this.model, hash(id), now());
      if (!changed.changes) throw new Error('OAuth artifact unavailable or already consumed');
    }
    async destroy(id) { db.prepare('DELETE FROM records WHERE model=? AND id_hash=?').run(this.model, hash(id)); }
    async revokeByGrantId(id) { db.prepare('DELETE FROM records WHERE grant_hash=?').run(hash(id)); }
  }
  const listGrants = (accountId, clientId) => db.prepare(`SELECT * FROM records WHERE model='Grant' AND account_hash=? ${clientId ? 'AND client_hash=?' : ''} AND ${live}`)
    .all(hash(accountId), ...(clientId ? [hash(clientId)] : []), now()).map(decode);
  const revokeAccount = (accountId, clientId) => transaction(() => {
    for (const grant of listGrants(accountId, clientId)) {
      db.prepare("DELETE FROM records WHERE grant_hash=? OR (model='Grant' AND id_hash=?)").run(hash(grant.jti), hash(grant.jti));
    }
  });
  cleanup();
  const timer = setInterval(cleanup, 60000); timer.unref();
  return { adapter: Adapter, listGrants, revokeAccount, cleanup,
    revokeAll: () => transaction(() => db.exec('DELETE FROM records')),
    healthy: () => db.prepare('PRAGMA quick_check').get().quick_check === 'ok',
    close: () => { clearInterval(timer); db.close(); } };
}
