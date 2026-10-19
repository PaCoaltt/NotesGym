import { DatabaseSync, backup } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export async function backupOAuth(source, destination) {
  if (path.resolve(source) === path.resolve(destination) || fs.existsSync(destination)) throw new Error('Backup destination must be a new file');
  fs.mkdirSync(path.dirname(path.resolve(destination)), { recursive: true, mode: 0o700 });
  fs.closeSync(fs.openSync(destination, 'wx', 0o600));
  const db = new DatabaseSync(source, { readOnly: true });
  try {
    if (db.prepare('PRAGMA quick_check').get().quick_check !== 'ok' || db.prepare('PRAGMA user_version').get().user_version !== 1) throw new Error('Invalid OAuth source store');
    await backup(db, destination);
  } finally { db.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try {
    if (process.argv.length !== 4) throw new Error('Usage: node scripts/chatgpt-oauth-backup.mjs SOURCE.sqlite NEW_BACKUP.sqlite');
    await backupOAuth(process.argv[2], process.argv[3]); console.log('OAuth backup completed. Protect the matching key configuration separately.');
  } catch { console.error('OAuth backup failed; no backup success is claimed.'); process.exitCode = 1; }
}
