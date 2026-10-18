export function httpError(status, message) { return Object.assign(new Error(message), { status }); }

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
