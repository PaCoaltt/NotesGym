// Run locally and redirect output to an ignored file. These are local TEST keys.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { ...privateKey.export({ format: 'jwk' }), kid: randomBytes(8).toString('hex'), use: 'sig', alg: 'RS256' };
if (process.argv[2] === '--file') {
  const file = process.argv[3];
  if (!file) throw new Error('Usage: --file NEW_KEY_FILE');
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify({ cookieKeys: [randomBytes(32).toString('hex')], jwks: { keys: [key] } }) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('Persistent test keys created. Existing files are never replaced.');
  process.exit(0);
}
process.stdout.write(`NOTESGYM_OAUTH_COOKIE_KEYS='${JSON.stringify([randomBytes(32).toString('hex')])}'\n`);
process.stdout.write(`NOTESGYM_OAUTH_JWKS='${JSON.stringify({ keys: [key] })}'\n`);
