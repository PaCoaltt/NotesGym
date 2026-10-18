import fs from 'node:fs';

export function loadOAuthKeys(env) {
  let source;
  try {
    if (env.NOTESGYM_OAUTH_KEYS_FILE) {
      const stat = fs.lstatSync(env.NOTESGYM_OAUTH_KEYS_FILE);
      if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077))) throw new Error();
      source = JSON.parse(fs.readFileSync(env.NOTESGYM_OAUTH_KEYS_FILE, 'utf8'));
      if (env.NOTESGYM_OAUTH_COOKIE_KEYS || env.NOTESGYM_OAUTH_JWKS) throw new Error();
    } else {
      source = { cookieKeys: JSON.parse(env.NOTESGYM_OAUTH_COOKIE_KEYS || '[]'), jwks: JSON.parse(env.NOTESGYM_OAUTH_JWKS || 'null') };
    }
    if (!Array.isArray(source.cookieKeys) || !source.cookieKeys.length || source.cookieKeys.some(k => typeof k !== 'string' || k.length < 32) ||
      !Array.isArray(source.jwks?.keys) || !source.jwks.keys.length || source.jwks.keys.some(k => !k.d || !k.kid)) throw new Error();
    return source;
  } catch { throw new Error('OAuth keys missing, ambiguous, invalid or insufficiently protected; restore the persistent key configuration'); }
}
