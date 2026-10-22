import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request as httpRequest } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createServer as createSMTPServer } from 'node:net';
import { proxyPolicy, rateLimiter, readPublicOrigin } from '../server/security.js';

import { legacyFixture } from './helpers/legacy-fixture.js';
import { AuthStore } from '../server/auth-store.js';

const publicOrigin = 'https://notesgym.lupachat.ch';
const note = { matiere: 'Math', note: 4, coefficient: 1, annee: '2026', semestre: 'Semestre 1', date: '2026-09-01' };

async function fixture(t, settings = {}, prepare) {
  const root = path.join(process.cwd(), '.notesgym-test-data');
  await mkdir(root, { recursive: true });
  const dir = await mkdtemp(path.join(root, 'web-'));
  await legacyFixture(dir, ['a@example.invalid', 'b@example.invalid']);
  if (prepare) await prepare(dir);
  const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(NOTESGYM_|SMTP_)/i.test(key))),
    NODE_ENV: 'production', PORT: '0', NOTESGYM_DATA_DIR: dir,
    ...settings };
  let child; let base; let diagnostics = '';
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    await new Promise(resolve => { child.once('exit', resolve); child.kill(); });
  };
  t.after(stop);
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Startup timed out')); }, 15000);
      let output = ''; let errors = '';
      child.stderr.on('data', chunk => { errors += chunk; diagnostics += chunk; });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('Startup failed: ' + errors)); });
      child.stdout.on('data', chunk => {
        output += chunk;
        const port = /localhost:(\d+)/.exec(output)?.[1];
        if (port) { clearTimeout(timeout); resolve('http://127.0.0.1:' + port); }
      });
    });
  };
  await start();
  // Preserve public Host and Fetch Metadata. Transport stays on loopback HTTP,
  // exactly like the application side of a TLS-terminating reverse proxy.
  const request = (route, options = {}) => new Promise((resolve, reject) => {
    const body = typeof options.body === 'string' ? options.body : options.body ? JSON.stringify(options.body) : undefined;
    const headers = { host: new URL(publicOrigin).host, 'x-forwarded-proto': 'https', 'cf-connecting-ip': '192.0.2.10',
      'content-type': 'application/json', ...options.headers };
    if (body !== undefined) headers['content-length'] = Buffer.byteLength(body);
    const req = httpRequest(base + route, { method: options.method || 'GET', headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
      res.on('end', () => {
        const responseHeaders = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2) responseHeaders.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
        resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: responseHeaders }));
      });
    });
    req.setTimeout(5000, () => req.destroy(new Error('Request timed out')));
    req.on('error', reject); req.end(body);
  });
  const login = async (email = 'a@example.invalid', headers = {}) => {
    const res = await request('/api/auth/login', { method: 'POST', headers: { origin: publicOrigin, 'sec-fetch-site': 'same-origin', ...headers },
      body: { email, password: 'test-only' } });
    assert.equal(res.status, 200, await res.clone().text());
    return { cookie: res.headers.get('set-cookie').split(';')[0], user: (await res.json()).user, headers: res.headers };
  };
  const waitForDiagnostic = predicate => new Promise((resolve, reject) => {
    const check = () => { if (predicate(diagnostics)) { clearTimeout(timer); child.stderr.off('data', check); resolve(); } };
    const timer = setTimeout(() => { child.stderr.off('data', check); reject(new Error('Expected diagnostic not received')); }, 10000);
    child.stderr.on('data', check); check();
  });
  return { request, login, dir, waitForDiagnostic, get diagnostics() { return diagnostics; }, restart: async () => { await stop(); await start(); } };
}

test('HTTPS reverse proxy login, sessions, notes and simulation plans survive without OAuth', async t => {
  const configs = [
    ['explicit public HTTPS origin, no proxy trust required', { NOTESGYM_PUBLIC_URL: publicOrigin }],
    ['explicit origin with trusted Cloudflare proxy', { NOTESGYM_PUBLIC_URL: publicOrigin + '/', NOTESGYM_TRUST_PROXY: 'true', NOTESGYM_TRUSTED_PROXY_IPS: '127.0.0.1' }],
    ['trusted HTTPS proxy without explicit public URL', { NOTESGYM_TRUST_PROXY: 'true', NOTESGYM_TRUSTED_PROXY_IPS: '127.0.0.1' }],
  ];
  for (const [name, settings] of configs) await t.test(name, async t => {
    const f = await fixture(t, settings);
    const usersBefore = await readFile(path.join(f.dir, 'users.json'));
    const a = await f.login(); const b = await f.login('b@example.invalid');
    assert.match(a.headers.get('set-cookie'), /HttpOnly; SameSite=Lax; Path=\/; Secure; Max-Age=/);
    assert.equal(a.user.passwordHash, undefined); assert.equal(a.user.salt, undefined);
    assert.equal((await f.request('/api/auth/login', { method: 'POST', headers: { origin: publicOrigin }, body: { email: 'a@example.invalid', password: 'wrong' } })).status, 401);
    const headers = { cookie: a.cookie, origin: publicOrigin, 'sec-fetch-site': 'same-origin' };
    assert.equal((await f.request('/api/auth/me', { headers })).status, 200);
    assert.equal((await f.request('/api/notes', { method: 'POST', headers: { origin: publicOrigin }, body: note })).status, 401);
    const created = await f.request('/api/notes', { method: 'POST', headers, body: note });
    assert.equal(created.status, 201); const grade = await created.json();
    const plan = await f.request('/api/simulation-settings', { method: 'PATCH', headers,
      body: { accountId: a.user.id, requestId: randomUUID(), changes: { '2026': { Math: { remaining: 4, coefficient: 2 } } } } });
    assert.equal(plan.status, 200); assert.equal((await plan.json()).plans['2026'].Math.remaining, 4);
    assert.deepEqual(await (await f.request('/api/notes', { headers: { cookie: b.cookie } })).json(), []);
    assert.equal((await f.request('/api/notes/' + grade.id, { method: 'PATCH', headers: { ...headers, cookie: b.cookie }, body: { note: 5 } })).status, 404);
    const logout = await f.request('/api/auth/logout', { method: 'POST', headers, body: {} });
    assert.equal(logout.status, 200); assert.match(logout.headers.get('set-cookie'), /Secure; Max-Age=0/);
    assert.equal((await f.request('/api/auth/me', { headers })).status, 401);
    await f.restart();
    assert.equal((await f.request('/api/auth/me', { headers: { cookie: b.cookie } })).status, 200, 'unrevoked session survives a server process restart');
    const fresh = await f.login();
    const notes = await (await f.request('/api/notes', { headers: { cookie: fresh.cookie } })).json();
    assert.equal(notes.length, 1); assert.equal(notes[0].id, grade.id); assert.equal(notes[0].note, 4);
    assert.equal((await (await f.request('/api/simulation-settings', { headers: { cookie: fresh.cookie } })).json()).plans['2026'].Math.remaining, 4);
    assert.deepEqual(await readFile(path.join(f.dir, 'users.json')), usersBefore, 'existing account IDs, password hashes and salts remain byte-identical');
    assert.deepEqual((await readdir(f.dir)).filter(name => name.endsWith('.json')).sort(), ['notes.json', 'simulation-settings.json', 'users.json']);
  });
});

test('web CSRF checks reject hostile origins, opaque origins, cross-site requests and spoofed proxy identity', async t => {
  const f = await fixture(t, { NOTESGYM_PUBLIC_URL: publicOrigin, NOTESGYM_TRUST_PROXY: 'true', NOTESGYM_TRUSTED_PROXY_IPS: '127.0.0.1' });
  const a = await f.login();
  const cases = [
    { origin: 'https://attacker.invalid' }, { origin: 'null' }, { origin: 'http://notesgym.lupachat.ch' },
    { origin: publicOrigin + '.attacker.invalid' }, { origin: publicOrigin, 'sec-fetch-site': 'cross-site' },
    { origin: 'https://attacker.invalid', 'x-forwarded-host': 'attacker.invalid', forwarded: 'host=attacker.invalid;proto=https' },
  ];
  for (const headers of cases) {
    for (const route of ['/api/auth/login', '/api/auth/logout', '/api/notes']) {
      const res = await f.request(route, { method: 'POST', headers: { cookie: a.cookie, ...headers }, body: note });
      assert.equal(res.status, 403); assert.deepEqual(await res.json(), { error: 'Cross-origin request refused' });
    }
  }
  assert.equal((await f.request('/api/auth/me', { headers: { cookie: a.cookie } })).status, 200, 'hostile logout cannot destroy the session');
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data']) {
    assert.equal((await f.request('/api/auth/logout', { method: 'POST', headers: { origin: publicOrigin, cookie: a.cookie, 'content-type': type }, body: {} })).status, 415);
  }
  assert.deepEqual(await (await f.request('/api/notes', { headers: { cookie: a.cookie } })).json(), []);
  await f.login('a@example.invalid', { 'x-forwarded-proto': 'http', 'x-forwarded-host': 'attacker.invalid' });
  const untrusted = await fixture(t);
  const spoofed = await untrusted.request('/api/auth/login', { method: 'POST', headers: { origin: publicOrigin }, body: { email: 'a@example.invalid', password: 'test-only' } });
  assert.equal(spoofed.status, 403, 'untrusted forwarded HTTPS cannot change the expected HTTP origin');
  const local = await untrusted.login('a@example.invalid', { origin: 'http://notesgym.lupachat.ch' });
  assert.doesNotMatch(local.headers.get('set-cookie'), /; Secure/);
});

test('standalone HTTP login and secure-cookie override remain supported', async t => {
  for (const secure of [false, true]) {
    const f = await fixture(t, { NOTESGYM_SECURE_COOKIES: String(secure) });
    const a = await f.login('a@example.invalid', { host: 'localhost:8080', origin: 'http://localhost:8080', 'x-forwarded-proto': 'https' });
    assert.equal(a.headers.get('set-cookie').includes('; Secure'), secure);
  }
});

test('removed integration URLs expose no service; classic application pages remain available', async t => {
  const f = await fixture(t, { NOTESGYM_PUBLIC_URL: publicOrigin });
  for (const route of ['/mcp', '/oauth/auth', '/oauth/token', '/chatgpt', '/chatgpt/interaction/old', '/.well-known/oauth-authorization-server/oauth', '/.well-known/oauth-protected-resource/mcp']) {
    for (const method of ['GET', 'POST']) assert.equal((await f.request(route, { method })).status, 404, method + ' ' + route);
  }
  for (const route of ['/', '/Dashboard', '/Home', '/Insights', '/Statistics', '/Lab', '/login', '/register', '/verify-email', '/forgot-password', '/reset-password', '/account']) assert.equal((await f.request(route)).status, 200, route);
  assert.deepEqual(await (await f.request('/api/health')).json(), { ok: true });
});

test('JSON transactions preserve concurrent changes; input limits and corruption protection remain', async t => {
  const f = await fixture(t, { NOTESGYM_PUBLIC_URL: publicOrigin }); const a = await f.login();
  const headers = { cookie: a.cookie, origin: publicOrigin };
  const post = body => f.request('/api/notes', { method: 'POST', headers, body });
  const created = await Promise.all(Array.from({ length: 20 }, (_, i) => post({ ...note, nom_evaluation: 'synthetic-' + i })));
  assert.ok(created.every(res => res.status === 201));
  const notes = await (await f.request('/api/notes', { headers })).json(); assert.equal(notes.length, 20);
  assert.ok(notes.every(grade => grade.user_id === a.user.id));
  const patch = body => f.request('/api/notes/' + notes[0].id, { method: 'PATCH', headers, body });
  await Promise.all([patch({ note: 5 }), patch({ coefficient: 3 })]);
  const merged = (await (await f.request('/api/notes', { headers })).json()).find(n => n.id === notes[0].id);
  assert.equal(merged.note, 5); assert.equal(merged.coefficient, 3);
  for (const grade of [0, 6.1, -1, 'bad']) assert.equal((await post({ ...note, note: grade })).status, 400);
  assert.equal((await post({ ...note, commentaire: 'x'.repeat(66000) })).status, 413);
  assert.equal((await post('{broken')).status, 400);
  const res = await f.request('/api/notes', { headers });
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff'); assert.equal(res.headers.get('cache-control'), 'no-store');
  const corrupt = '{synthetic-corruption';
  await writeFile(path.join(f.dir, 'notes.json'), corrupt);
  const failedRead = await f.request('/api/notes', { headers }); assert.equal(failedRead.status, 500);
  assert.deepEqual(await failedRead.json(), { error: 'Server error' }); assert.equal((await post(note)).status, 500);
  assert.equal(await readFile(path.join(f.dir, 'notes.json'), 'utf8'), corrupt);
  for (let i = 0; i < 20; i++) await f.request('/api/auth/login', { method: 'POST', headers, body: {} });
  assert.equal((await f.request('/api/auth/login', { method: 'POST', headers, body: {} })).status, 429);
});

test('proxy client IP is accepted only from an explicit peer; spoofed headers cannot bypass quotas', () => {
  const policy = proxyPolicy({ NOTESGYM_TRUST_PROXY: 'true', NOTESGYM_TRUSTED_PROXY_IPS: '127.0.0.1,::1' });
  const request = (remoteAddress, ip) => ({ socket: { remoteAddress }, headers: { 'cf-connecting-ip': ip } });
  assert.equal(policy.clientIP(request('198.51.100.1', '192.0.2.1')), '198.51.100.1');
  assert.equal(policy.clientIP(request('::ffff:127.0.0.1', '192.0.2.1')), '192.0.2.1');
  assert.throws(() => policy.clientIP(request('127.0.0.1', '192.0.2.1,192.0.2.2')), { status: 400 });
  assert.throws(() => proxyPolicy({ NOTESGYM_TRUST_PROXY: 'true' }), /Trusted proxy/);
  const allow = rateLimiter({ limit: 1 });
  assert.equal(allow(policy.clientIP(request('198.51.100.1', '192.0.2.1'))), true);
  assert.equal(allow(policy.clientIP(request('198.51.100.1', '192.0.2.2'))), false);
  assert.equal(allow(policy.clientIP(request('127.0.0.1', '192.0.2.2'))), true);
});

test('public URL configuration is canonical and fails clearly on malformed origins', () => {
  assert.equal(readPublicOrigin({ NOTESGYM_PUBLIC_URL: publicOrigin + '/' }), publicOrigin);
  assert.equal(readPublicOrigin({}), undefined);
  for (const url of ['invalid', 'ftp://example.invalid', publicOrigin + '/path', publicOrigin + '?q=1', publicOrigin + '#fragment', 'https://user:password@example.invalid']) {
    assert.throws(() => readPublicOrigin({ NOTESGYM_PUBLIC_URL: url }), /NOTESGYM_PUBLIC_URL/);
  }
});

test('historical notes and simulation ownership survive email change through real HTTP; every mutation stays isolated', async t => {
  let emailToken; let originalId;
  const f = await fixture(t, { NOTESGYM_PUBLIC_URL: publicOrigin }, async dir => {
    const store = new AuthStore(path.join(dir, 'auth.sqlite'));
    const owner = store.byEmail('a@example.invalid'); originalId = owner.id;
    emailToken = store.issue(owner.id, 'email', 'next@example.invalid');
    await writeFile(path.join(dir, 'notes.json'), JSON.stringify([{ ...note, id: 'historical', created_by: owner.email, created_date: '2026-01-01', custom_metadata: { preserved: true } }]));
    store.close();
  });
  const a = await f.login(); const b = await f.login('b@example.invalid');
  const headers = cookie => ({ origin: publicOrigin, cookie });
  const before = await (await f.request('/api/notes', { headers: headers(a.cookie) })).json();
  const changed = await f.request('/api/auth/verify-email', { method: 'POST', headers: headers(a.cookie), body: { token: emailToken, kind: 'email' } });
  assert.equal(changed.status, 200);
  assert.equal((await f.request('/api/auth/me', { headers: headers(a.cookie) })).status, 401);
  const next = await f.login('next@example.invalid'); assert.equal(next.user.id, originalId);
  assert.deepEqual(await (await f.request('/api/notes', { headers: headers(next.cookie) })).json(), before);
  const plans = await (await f.request('/api/simulation-settings', { headers: headers(next.cookie) })).json();
  assert.equal(plans.accountId, originalId); assert.ok(plans.plans['2026'].Math);
  for (const method of ['PATCH', 'DELETE']) assert.equal((await f.request('/api/notes/historical', { method, headers: headers(b.cookie), body: note })).status, 404);
  for (const [route, body] of [['archive', { years: ['2026'] }], ['subject-report-status', { subject: 'Math', excluded: true }]]) {
    assert.equal((await f.request('/api/notes/' + route, { method: 'PATCH', headers: headers(b.cookie), body })).status, 200);
  }
  assert.deepEqual(await (await f.request('/api/notes', { headers: headers(next.cookie) })).json(), before);
  const forged = await f.request('/api/notes', { method: 'POST', headers: headers(b.cookie), body: { ...note, user_id: originalId, created_by: 'a@example.invalid' } });
  const result = await forged.json(); assert.equal(forged.status, 201); assert.equal(result.user_id, b.user.id);
  assert.equal((await (await f.request('/api/notes', { headers: headers(next.cookie) })).json()).length, 1);
  await f.restart();
  assert.deepEqual(await (await f.request('/api/notes', { headers: headers(next.cookie) })).json(), before);
});

test('a notes store disappearing at runtime is never treated as empty or recreated by a mutation', async t => {
  const f = await fixture(t, { NOTESGYM_PUBLIC_URL: publicOrigin }); const a = await f.login();
  const headers = { origin: publicOrigin, cookie: a.cookie };
  assert.equal((await f.request('/api/notes', { method: 'POST', headers, body: note })).status, 201);
  const filename = path.join(f.dir, 'notes.json'); const snapshot = await readFile(filename);
  await unlink(filename);
  const post = await f.request('/api/notes', { method: 'POST', headers, body: note });
  assert.equal(post.status, 500);
  assert.equal((await f.request('/api/notes', { headers })).status, 500);
  assert.equal((await f.request('/api/simulation-settings', { headers })).status, 500);
  await assert.rejects(readFile(filename), { code: 'ENOENT' });
  await writeFile(filename, snapshot);
  assert.equal((await (await f.request('/api/notes', { headers })).json()).length, 1);
});

test('real local SMTP TLS failure leaves HTTP responses generic, permits resend, and logs no credentials or token', async t => {
  const sockets = new Set(); let connections = 0;
  // Loopback-only rejecting SMTP server. No message or recipient ever leaves the test.
  const smtp = createSMTPServer(socket => {
    connections++; sockets.add(socket); socket.on('close', () => sockets.delete(socket)); socket.on('error', () => {});
    socket.write('220 synthetic-smtp ESMTP\r\n');
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk.toString();
      let end;
      while ((end = buffer.indexOf('\r\n')) !== -1) {
        const command = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (command.startsWith('EHLO')) socket.write('250-synthetic-smtp\r\n250 HELP\r\n');
        else if (command === 'STARTTLS') socket.write('454 Synthetic TLS unavailable\r\n');
        else socket.end('221 Goodbye\r\n');
      }
    });
  });
  await new Promise(resolve => smtp.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => smtp.close(resolve)); });
  const secret = 'SYNTHETIC_SMTP_PASSWORD'; const password = 'Synthetic HTTP password!';
  const f = await fixture(t, { NOTESGYM_PUBLIC_URL: publicOrigin, SMTP_HOST: '127.0.0.1', SMTP_PORT: String(smtp.address().port), SMTP_USER: 'SYNTHETIC_SMTP_USER', SMTP_PASSWORD: secret, SMTP_FROM: 'sender@example.invalid' });
  const post = (action, body) => f.request('/api/auth/' + action, { method: 'POST', headers: { origin: publicOrigin }, body });
  const registered = await post('register', { email: 'new@example.invalid', password, confirmPassword: password });
  const duplicate = await post('register', { email: 'NEW@example.invalid', password, confirmPassword: password });
  assert.equal(registered.status, 200); assert.equal(duplicate.status, 200);
  assert.deepEqual(await duplicate.json(), await registered.json());
  await f.waitForDiagnostic(logs => logs.includes('transactional email delivery failed'));
  for (const action of ['resend-verification', 'forgot-password']) {
    const known = await post(action, { email: 'new@example.invalid' });
    const unknown = await post(action, { email: 'missing@example.invalid' });
    assert.equal(known.status, 200); assert.equal(unknown.status, 200);
    assert.deepEqual(await known.json(), await unknown.json());
  }
  await f.waitForDiagnostic(logs => (logs.match(/transactional email delivery failed/g) || []).length === 3);
  assert.equal(connections, 3);
  for (const privateValue of [secret, 'SYNTHETIC_SMTP_USER', password, 'new@example.invalid', 'missing@example.invalid', '#token=']) assert.ok(!f.diagnostics.includes(privateValue));
  assert.ok(!/[a-f0-9]{64}/.test(f.diagnostics), 'no raw token or hash in diagnostics');
  assert.equal((await f.request('/api/health')).status, 200);
  assert.equal((await post('login', { email: 'new@example.invalid', password })).status, 403);
});

test('logout expires its cookie and revokes only that session across protected APIs and restart', async t => {
  const f = await fixture(t, { NOTESGYM_PUBLIC_URL: publicOrigin });
  const session = await f.login(); const otherDevice = await f.login();
  const headers = { origin: publicOrigin, cookie: session.cookie };
  const created = await f.request('/api/notes', { method: 'POST', headers, body: note });
  assert.equal(created.status, 201); const grade = await created.json();
  assert.equal((await f.request('/api/simulation-settings', { headers })).status, 200);
  const filenames = ['users.json', 'notes.json', 'simulation-settings.json'];
  const snapshots = await Promise.all(filenames.map(name => readFile(path.join(f.dir, name))));
  const logout = await f.request('/api/auth/logout', { method: 'POST', headers, body: {} });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /^notesgym_session=; HttpOnly; SameSite=Lax; Path=\/; Secure; Max-Age=0$/);
  for (const endpoint of ['/api/auth/me', '/api/notes', '/api/simulation-settings']) {
    assert.equal((await f.request(endpoint, { headers })).status, 401, 'replayed cookie: ' + endpoint);
  }
  for (const [endpoint, method, body] of [
    ['/api/notes', 'POST', note], ['/api/notes/' + grade.id, 'PATCH', { note: 6 }], ['/api/notes/' + grade.id, 'DELETE', {}],
    ['/api/notes/archive', 'PATCH', { years: ['2026'] }], ['/api/notes/subject-report-status', 'PATCH', { subject: 'Math', excluded: true }],
    ['/api/simulation-settings', 'PATCH', { accountId: session.user.id, requestId: randomUUID(), changes: {} }],
    ['/api/simulation-settings/migrate', 'POST', { accountId: session.user.id, plans: {} }],
  ]) assert.equal((await f.request(endpoint, { method, headers, body })).status, 401, endpoint);
  assert.equal((await f.request('/api/auth/logout', { method: 'POST', headers, body: {} })).status, 200, 'logout is idempotent');
  assert.equal((await f.request('/api/auth/me', { headers: { cookie: otherDevice.cookie } })).status, 200);
  await f.restart();
  assert.equal((await f.request('/api/notes', { headers })).status, 401, 'revocation survives a process restart');
  const remaining = await f.request('/api/notes', { headers: { cookie: otherDevice.cookie } });
  assert.equal(remaining.status, 200); assert.equal((await remaining.json())[0].id, grade.id);
  for (let i = 0; i < filenames.length; i++) assert.deepEqual(await readFile(path.join(f.dir, filenames[i])), snapshots[i], filenames[i] + ' is unchanged by logout');
});
