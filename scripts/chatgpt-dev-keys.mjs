// Run locally and redirect output to an ignored file. These are local TEST keys.
import { generateKeyPairSync, randomBytes } from 'node:crypto';
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = { ...privateKey.export({ format: 'jwk' }), kid: randomBytes(8).toString('hex'), use: 'sig', alg: 'RS256' };
process.stdout.write(`NOTESGYM_OAUTH_COOKIE_KEYS='${JSON.stringify([randomBytes(32).toString('hex')])}'\n`);
process.stdout.write(`NOTESGYM_OAUTH_JWKS='${JSON.stringify({ keys: [key] })}'\n`);
