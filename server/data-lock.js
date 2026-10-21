import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// One local writer per volume, including the migration CLI. No network shares.
export async function lockData(directory) {
  await fs.mkdir(directory, { recursive: true });
  const filename = path.join(directory, '.writer.sqlite');
  const db = new DatabaseSync(filename);
  try {
    db.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;');
    await fs.chmod(filename, 0o600);
  } catch (error) {
    db.close();
    if (error.errcode === 5 || /locked|busy/i.test(error.message)) throw new Error('Data volume already in use; stop NotesGym before migration/start');
    throw error;
  }
  // The OS releases this lock after crashes as well, even across PID namespaces.
  return async () => { db.exec('ROLLBACK'); db.close(); };
}
