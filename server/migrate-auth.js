import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthStore, digest, emailAddress } from './auth-store.js';
import { lockData } from './data-lock.js';

export const legacyFiles = ['users.json', 'notes.json', 'simulation-settings.json'];
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function inspectLegacy(directory) {
  const bytes = {}; const records = {};
  for (const name of legacyFiles) {
    try { bytes[name] = await fs.readFile(path.join(directory, name)); }
    catch (error) {
      if (error.code !== 'ENOENT' || name !== 'simulation-settings.json') throw error;
      bytes[name] = null; // Older installations may not yet have this store.
    }
    records[name] = bytes[name] ? JSON.parse(bytes[name].toString('utf8')) : [];
    if (!Array.isArray(records[name])) throw new Error(`Expected array: ${name}`);
  }
  const users = records['users.json']; const notes = records['notes.json']; const simulations = records['simulation-settings.json'];
  const ids = new Set(); const emails = new Map();
  for (const user of users) {
    if (!user || !uuid.test(user.id) || ids.has(user.id)) throw new Error('Invalid or duplicate user UUID');
    const email = emailAddress(user.email);
    if (emails.has(email)) throw new Error('Duplicate normalized email; manual resolution required');
    if (!/^[a-f0-9]{128}$/.test(user.passwordHash) || !/^[a-f0-9]{32}$/.test(user.salt)) throw new Error('Unsupported legacy password format');
    if (typeof user.created_date !== 'string' || !Number.isFinite(Date.parse(user.created_date))) throw new Error('Invalid user creation date');
    if (user.role != null && typeof user.role !== 'string') throw new Error('Invalid user role');
    ids.add(user.id); emails.set(email, user.id);
  }
  const noteIds = new Set();
  for (const note of notes) {
    if (!note || typeof note.id !== 'string' || !note.id || noteIds.has(note.id)) throw new Error('Invalid or duplicate note ID');
    noteIds.add(note.id);
    const owner = typeof note.created_by === 'string' ? emails.get(note.created_by.toLowerCase()) : undefined;
    if (!owner || (note.user_id != null && note.user_id !== owner)) throw new Error('Orphan or ambiguous note owner; manual resolution required');
  }
  const simulationIds = new Set();
  for (const record of simulations) {
    if (!record || !ids.has(record.user_id) || simulationIds.has(record.user_id) || !record.plans || typeof record.plans !== 'object' || Array.isArray(record.plans)) throw new Error('Invalid/orphan simulation settings');
    simulationIds.add(record.user_id);
  }
  return { bytes, records, counts: { users: users.length, notes: notes.length, simulations: simulations.length },
    checksums: Object.fromEntries(legacyFiles.map(name => [name, bytes[name] ? digest(bytes[name]) : null])) };
}

export async function migrateAuth(directory, { apply = false, policy, beforePublish } = {}) {
  const release = await lockData(directory);
  let db; let temp;
  try {
    const source = await inspectLegacy(directory);
    const target = path.join(directory, 'auth.sqlite');
    let exists = false;
    try { await fs.access(target); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (exists) {
      db = new AuthStore(target);
      const prior = db.db.prepare("SELECT value FROM meta WHERE key='legacy-source'").get();
      if (!prior || prior.value !== JSON.stringify(source.checksums)) throw new Error('Existing database differs from this source; no import or overwrite performed');
      for (const user of source.records['users.json']) if (!db.byId(user.id) || db.owner(emailAddress(user.email)) !== user.id) throw new Error('Imported identity verification failed');
      return { status: 'already-migrated', ...source.counts };
    }
    if (!apply) return { status: 'dry-run', ...source.counts, checksums: source.checksums };
    if (!['require-verification', 'preserve-access'].includes(policy)) throw new Error('Choose --legacy-policy=require-verification or --legacy-policy=preserve-access');
    const backup = path.join(directory, `auth-v2-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}`);
    await fs.mkdir(backup, { mode: 0o700 });
    for (const name of legacyFiles) if (source.bytes[name]) {
      const handle = await fs.open(path.join(backup, name), 'wx', 0o600);
      try { await handle.writeFile(source.bytes[name]); await handle.sync(); } finally { await handle.close(); }
    }
    const manifest = { version: 1, policy, ...source.counts, checksums: source.checksums };
    await fs.writeFile(path.join(backup, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 });
    for (const name of legacyFiles) if (source.bytes[name] && digest(await fs.readFile(path.join(backup, name))) !== source.checksums[name]) throw new Error('Backup verification failed');
    temp = path.join(directory, `auth.sqlite.staging-${crypto.randomUUID()}`);
    db = new AuthStore(temp, { create: true });
    db.transaction(() => {
      for (const user of source.records['users.json']) db.insert({ ...user, email: emailAddress(user.email), password: `scrypt-v1:${user.salt}:${user.passwordHash}`, legacy_access: policy === 'preserve-access' });
      db.db.prepare('INSERT INTO meta VALUES(?,?)').run('legacy-source', JSON.stringify(source.checksums));
      db.db.prepare('INSERT INTO meta VALUES(?,?)').run('legacy-policy', policy);
    });
    if (db.db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' || db.db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('SQLite validation failed');
    db.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close(); db = null;
    await fs.chmod(temp, 0o600);
    // Fault injection is an in-process test hook, never an environment option.
    if (beforePublish) await beforePublish();
    const current = await inspectLegacy(directory);
    if (JSON.stringify(current.checksums) !== JSON.stringify(source.checksums)) throw new Error('Source changed during migration; refusing publication');
    // Hard link fails if a target appeared, unlike rename which can replace it.
    await fs.link(temp, target);
    await fs.unlink(temp); temp = null;
    return { status: 'migrated', ...source.counts, backup };
  } finally {
    if (db) db.close();
    if (temp) for (const suffix of ['', '-wal', '-shm']) await fs.unlink(temp + suffix).catch(error => { if (error.code !== 'ENOENT') throw error; });
    await release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const allowed = /^(--apply|--data-dir=.+|--legacy-policy=(require-verification|preserve-access))$/;
  try {
    if (args.some(arg => !allowed.test(arg))) throw new Error('Usage: node server/migrate-auth.js --data-dir=/copy [--apply --legacy-policy=require-verification|preserve-access]');
    const directory = args.find(arg => arg.startsWith('--data-dir='))?.slice(11) || process.env.NOTESGYM_DATA_DIR;
    if (!directory) throw new Error('Explicit data directory required');
    console.log(JSON.stringify(await migrateAuth(path.resolve(directory), { apply: args.includes('--apply'), policy: args.find(arg => arg.startsWith('--legacy-policy='))?.slice(16) }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
