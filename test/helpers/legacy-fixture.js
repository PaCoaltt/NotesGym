import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { migrateAuth } from '../../server/migrate-auth.js';

// Synthetic users only; never reads NOTESGYM_USERS or the repository data folder.
export async function legacyFixture(directory, emails, { password = 'test-only', notes = [], simulations = [], policy = 'preserve-access', migrate = true } = {}) {
  const users = emails.map(email => {
    const salt = crypto.randomBytes(16).toString('hex');
    return { id: crypto.randomUUID(), email, role: 'user', created_date: '2026-01-01T00:00:00.000Z', salt, passwordHash: crypto.scryptSync(password, salt, 64).toString('hex') };
  });
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'users.json'), JSON.stringify(users));
  await fs.writeFile(path.join(directory, 'notes.json'), JSON.stringify(typeof notes === 'function' ? notes(users) : notes));
  await fs.writeFile(path.join(directory, 'simulation-settings.json'), JSON.stringify(typeof simulations === 'function' ? simulations(users) : simulations));
  if (migrate) await migrateAuth(directory, { apply: true, policy });
  return users;
}
