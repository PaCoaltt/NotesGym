import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { promisify } from 'node:util';
import { httpError } from './security.js';

const scrypt = promisify(crypto.scrypt);
export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');
export const SESSION_TTL_MS = 30 * 86400000;
export function emailAddress(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/.test(value.trim())) throw httpError(400, 'Adresse email invalide.');
  return value.trim().toLowerCase();
}
export function newPassword(password, confirmation) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw httpError(400, 'Le mot de passe doit contenir entre 12 et 128 caractères.');
  if (password !== confirmation) throw httpError(400, 'Les mots de passe ne correspondent pas.');
  return password;
}
export async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return `scrypt-v2:${salt}:${hash.toString('hex')}`;
}
const dummy = `scrypt-v2:${'0'.repeat(32)}:${'0'.repeat(128)}`;
export async function passwordMatches(password, encoded = dummy) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [version, salt, expected] = encoded.split(':');
  if (!['scrypt-v1', 'scrypt-v2'].includes(version) || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(expected)) throw new Error('Invalid password record');
  const actual = await scrypt(password, salt, 64, version === 'scrypt-v1' ? {} : { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  return crypto.timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
export function publicUser(user) {
  return { id: user.id, email: user.email, role: user.role, created_date: user.created_date, email_verified: Boolean(user.email_verified), legacy_access: Boolean(user.legacy_access) };
}

export class AuthStore {
  constructor(filename, { create = false, now = Date.now } = {}) {
    this.now = now;
    if (filename !== ':memory:') {
      if (create) fs.closeSync(fs.openSync(filename, 'wx', 0o600));
      else fs.statSync(filename); // Opening a store must never implicitly initialize one.
    }
    this.db = new DatabaseSync(filename, { open: true, readOnly: false });
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    if (create) this.db.exec(`
      CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta VALUES('schema','1');
      CREATE TABLE users(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, role TEXT NOT NULL,
        password TEXT NOT NULL, created_date TEXT NOT NULL, email_verified INTEGER NOT NULL DEFAULT 0,
        legacy_access INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE email_owners(email TEXT PRIMARY KEY COLLATE NOCASE, user_id TEXT NOT NULL REFERENCES users(id));
      CREATE TABLE sessions(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
      CREATE INDEX sessions_user ON sessions(user_id);
      CREATE TABLE tokens(hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
        target_email TEXT NOT NULL, expires_at INTEGER NOT NULL);
      CREATE INDEX tokens_user ON tokens(user_id,kind);
      CREATE TABLE limits(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);
    `);
    if (this.db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value !== '1') throw new Error('Unsupported auth schema');
  }
  transaction(operation) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  close() { this.db.close(); }
  byEmail(email) { return this.db.prepare('SELECT * FROM users WHERE email=?').get(email); }
  byId(id) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id); }
  owner(email) { return typeof email === 'string' ? this.db.prepare('SELECT user_id FROM email_owners WHERE email=?').get(email)?.user_id : undefined; }
  owns(note, user) {
    // A present stable ID is authoritative; never fall back from a different ID.
    return note.user_id != null ? note.user_id === user.id : this.owner(note.created_by) === user.id;
  }
  available(email, id) {
    const owner = this.owner(email); const current = this.byEmail(email);
    return (!owner || owner === id) && (!current || current.id === id);
  }
  insert(user) {
    this.db.prepare('INSERT INTO users(id,email,role,password,created_date,email_verified,legacy_access) VALUES(?,?,?,?,?,?,?)')
      .run(user.id, user.email, user.role || 'user', user.password, user.created_date, Number(user.email_verified || 0), Number(user.legacy_access || 0));
    this.db.prepare('INSERT INTO email_owners VALUES(?,?)').run(user.email, user.id);
  }
  session(userId) {
    const token = randomToken();
    this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(this.now());
    this.db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), userId, this.now() + SESSION_TTL_MS);
    return token;
  }
  current(token) {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return this.db.prepare('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.hash=? AND s.expires_at>?').get(digest(token), this.now()) || null;
  }
  logout(token) { if (token) this.db.prepare('DELETE FROM sessions WHERE hash=?').run(digest(token)); }
  revoke(id) { this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); }
  clearTokens(id, kinds) {
    if (kinds === undefined) this.db.prepare('DELETE FROM tokens WHERE user_id=?').run(id);
    else {
      const remove = this.db.prepare('DELETE FROM tokens WHERE user_id=? AND kind=?');
      for (const kind of kinds) remove.run(id, kind);
    }
  }
  issue(id, kind, email) {
    const token = randomToken();
    this.db.prepare('DELETE FROM tokens WHERE user_id=? AND kind=?').run(id, kind);
    this.db.prepare('DELETE FROM tokens WHERE expires_at<=?').run(this.now());
    this.db.prepare('INSERT INTO tokens VALUES(?,?,?,?,?)').run(digest(token), id, kind, email, this.now() + (kind === 'reset' ? 1800000 : 86400000));
    return token;
  }
  token(raw, kind) {
    if (typeof raw !== 'string' || !/^[a-f0-9]{64}$/.test(raw)) throw httpError(400, 'Lien invalide, expiré ou déjà utilisé.');
    const record = this.db.prepare('SELECT * FROM tokens WHERE hash=? AND kind=? AND expires_at>?').get(digest(raw), kind, this.now());
    if (!record) throw httpError(400, 'Lien invalide, expiré ou déjà utilisé.');
    return record;
  }
  limit(key, count, windowMs) {
    return this.transaction(() => {
      const now = this.now();
      // Fixed window: its start is (until - windowMs). Conflicts increment only
      // count, never until; an expired row is removed before inserting a new one.
      this.db.prepare('DELETE FROM limits WHERE until<=?').run(now);
      // Bound storage even under arbitrary account/address input.
      if (!this.db.prepare('SELECT 1 FROM limits WHERE key=?').get(key) && this.db.prepare('SELECT count(*) AS n FROM limits').get().n >= 20000) return false;
      this.db.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key, now + windowMs);
      return this.db.prepare('SELECT count FROM limits WHERE key=?').get(key).count <= count;
    });
  }
}
