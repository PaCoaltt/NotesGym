import { isIP, BlockList } from 'node:net';

export function httpError(status, message) { return Object.assign(new Error(message), { status }); }

export function proxyPolicy(env = process.env) {
  const enabled = env.NOTESGYM_TRUST_PROXY === 'true';
  const trusted = new BlockList();
  const entries = (env.NOTESGYM_TRUSTED_PROXY_IPS || '').split(',').map(v => v.trim()).filter(Boolean);
  if (enabled && !entries.length) throw new Error('Trusted proxy IPs/CIDRs required');
  for (const entry of entries) {
    const [ip, prefix] = entry.split('/'); const family = isIP(ip);
    if (!family || (prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) === 0 || Number(prefix) > (family === 4 ? 32 : 128)))) throw new Error('Invalid trusted proxy IP/CIDR');
    if (prefix === undefined) trusted.addAddress(ip, family === 4 ? 'ipv4' : 'ipv6');
    else trusted.addSubnet(ip, Number(prefix), family === 4 ? 'ipv4' : 'ipv6');
  }
  const peer = req => (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  const isTrusted = req => enabled && isIP(peer(req)) && trusted.check(peer(req), isIP(peer(req)) === 4 ? 'ipv4' : 'ipv6');
  return { enabled, isTrusted, clientIP: req => {
    const supplied = req.headers['cf-connecting-ip'];
    if (!isTrusted(req) || !supplied) return peer(req) || 'unknown';
    if (typeof supplied !== 'string' || !isIP(supplied)) throw httpError(400, 'Invalid proxy client address');
    return supplied;
  } };
}

export async function readLimitedBody(req, limit = 65536) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw httpError(413, 'Request too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function rateLimiter({ limit = 120, windowMs = 60000, maxKeys = 10000 } = {}) {
  const windows = new Map();
  return key => {
    const now = Date.now();
    for (const [k, entry] of windows) if (entry.until <= now) windows.delete(k);
    let entry = windows.get(key);
    if (!entry) {
      if (windows.size >= maxKeys) return false;
      entry = { count: 0, until: now + windowMs }; windows.set(key, entry);
    }
    return ++entry.count <= limit;
  };
}

export function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

export function sameOrigin(req, base) {
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (site === 'cross-site' || (origin && origin !== new URL(base).origin)) throw httpError(403, 'Cross-origin request refused');
}

// Public HTTPS identity is independent of the HTTP hop from a TLS proxy.
// Forwarded headers may supply the scheme only when the direct peer is trusted.
export function webOrigin(req, publicOrigin, proxy) {
  if (publicOrigin) return publicOrigin;
  const protocol = proxy.isTrusted(req) && req.headers['x-forwarded-proto'] === 'https' ? 'https:' : 'http:';
  return new URL(`${protocol}//${req.headers.host}`).origin;
}

export function readPublicOrigin(env = process.env) {
  if (!env.NOTESGYM_PUBLIC_URL) return undefined;
  let url;
  try { url = new URL(env.NOTESGYM_PUBLIC_URL); } catch { throw new Error('Invalid NOTESGYM_PUBLIC_URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NOTESGYM_PUBLIC_URL must be an HTTP(S) origin without credentials, path, query or fragment');
  }
  return url.origin;
}
