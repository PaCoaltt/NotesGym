import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { generateKeyPairSync, randomBytes, createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { executeGradeTool, ownGrades, toolDefinitions } from '../integration/grade-service.js';
import { analyzeSemester } from '../src/lib/analytics/subjects.js';
import { generateInsights } from '../src/lib/analytics/insights.js';
import { calculateCompensation } from '../src/lib/analytics/compensation.js';
import { createChatGptIntegration } from '../integration/chatgpt.js';

const note = { matiere: 'Math', note: 4, coefficient: 1, annee: '2026', semestre: 'Semestre 1', date: '2026-09-01' };
const user = { id: 'a', email: 'a@example.invalid' };

test('shared service: exclusions, pagination, isolation, simulations, strict schemas', () => {
  const notes = [
    { ...note, id: '1', created_by: user.email }, { ...note, id: '2', note: 6, coefficient: 2, created_by: user.email },
    { ...note, id: '3', note: 1, exclue_bulletin: true, created_by: user.email },
    { ...note, id: '4', note: 1, matiere_hors_bulletin: true, created_by: user.email },
    { ...note, id: '5', note: 1, archived: true, created_by: user.email },
    { ...note, id: 'secret-b', note: 1, created_by: 'b@example.invalid', commentaire: 'private' },
  ];
  const own = ownGrades(notes, user); const active = own.filter(n => !n.archived);
  assert.equal(executeGradeTool('get_overview', {}, own).average, analyzeSemester(active).average);
  assert.equal(executeGradeTool('get_overview', {}, own).average, 16 / 3);
  assert.deepEqual(executeGradeTool('get_overview', {}, own).compensation, calculateCompensation(active));
  assert.deepEqual(executeGradeTool('get_insights', {}, own).insights, JSON.parse(JSON.stringify(generateInsights(active))));
  const page = executeGradeTool('get_grades', { limit: 1 }, own);
  assert.equal(page.total, 2); assert.equal(page.grades.length, 1); assert.equal(page.nextOffset, 1);
  assert.equal(executeGradeTool('get_grades', { offset: 500 }, own).nextOffset, null);
  assert.equal(executeGradeTool('get_grades', { include_excluded: true, include_archived: true }, own).total, 5);
  for (const filter of [{ year: 'unknown' }, { semester: 'unknown' }, { subject: 'unknown' }]) assert.equal(executeGradeTool('get_grades', filter, own).total, 0);
  const original = JSON.stringify(notes);
  assert.equal(executeGradeTool('simulate_grade', { year: '2026', semester: 'Semestre 1', grades: [{ subject: 'Math', grade: 2, coefficient: 2 }] }, own).after, 4);
  assert.equal(JSON.stringify(notes), original);
  for (const args of [{ userId: 'b' }, { limit: 101 }, { offset: -1 }, { include_archived: 'true' }]) assert.throws(() => executeGradeTool('get_grades', args, own));
  assert.throws(() => executeGradeTool('simulate_grade', { year: '2026', semester: 's', grades: [{ subject: 'Math', grade: 7 }] }, own));
  assert.equal(executeGradeTool('get_overview', {}, []).average, null);
  assert.equal(executeGradeTool('analyze_subject', { subject: 'Missing' }, own).subject, null);
  assert.ok(!toolDefinitions.get_predictions);
});

async function fixture(t, overrides = {}) {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const publicBase = overrides.NOTESGYM_PUBLIC_URL || base;
  const proxyHeaders = publicBase !== base ? { host: new URL(publicBase).host, 'x-forwarded-proto': 'https', 'cf-connecting-ip': '192.0.2.10' } : {};
  // Node fetch intentionally overwrites Host. Use a real local HTTP request to
  // simulate TLS offloading while preserving the configured public Host.
  const appFetch = (url, options = {}) => publicBase === base ? fetch(url, options) : new Promise((resolve, reject) => {
    const target = new URL(url); const body = options.body?.toString();
    const headers = { ...options.headers };
    if (body) headers['content-length'] = Buffer.byteLength(body);
    const req = httpRequest(new URL(target.pathname + target.search, base), { method: options.method || 'GET', headers }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('error', reject);
      res.on('end', () => {
        const responseHeaders = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2) responseHeaders.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
        const response = new Response(Buffer.concat(chunks), { status: res.statusCode, headers: responseHeaders });
        Object.defineProperty(response, 'url', { value: String(url) }); resolve(response);
      });
    });
    req.on('error', reject); req.end(body);
  });
  const root = path.join(process.cwd(), '.notesgym-test-data'); await mkdir(root, { recursive: true });
  const dir = await mkdtemp(path.join(root, 'mcp-'));
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...privateKey.export({ format: 'jwk' }), kid: 'test', use: 'sig', alg: 'RS256' };
  const childEnv = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('NOTESGYM_'))),
    NODE_ENV: 'test', PORT: String(port), NOTESGYM_DATA_DIR: dir, NOTESGYM_MCP_ENABLED: 'true', NOTESGYM_PUBLIC_URL: base,
    NOTESGYM_USERS: 'a@example.invalid:test-only,b@example.invalid:test-only', NOTESGYM_OAUTH_JWKS: JSON.stringify({ keys: [jwk] }),
    NOTESGYM_OAUTH_COOKIE_KEYS: JSON.stringify([randomBytes(32).toString('hex')]),
    NOTESGYM_OAUTH_CLIENTS: JSON.stringify(['test-client', 'other-client'].map(client_id => ({ client_id, redirect_uris: [publicBase + '/test-callback'] }))), ...overrides };
  let child;
  const start = async () => {
    child = spawn(process.execPath, ['server.js'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Startup timed out')); }, 15000); let errors = '';
      child.stderr.on('data', data => { errors += data; });
      child.once('exit', () => { clearTimeout(timeout); reject(new Error('Startup failed: ' + errors)); });
      child.stdout.on('data', data => { if (String(data).includes('running on')) { clearTimeout(timeout); resolve(); } });
    });
  };
  const stop = () => new Promise(resolve => { if (!child || child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); });
  const restart = async (changes = {}) => { await stop(); Object.assign(childEnv, changes); await start(); };
  t.after(stop);
  await start();
  function browser() {
    const cookies = new Map();
    return async (url, options = {}) => {
      const target = new URL(url, publicBase);
      const transportURL = new URL(target.pathname + target.search, base);
      const res = await appFetch(transportURL, { ...options, redirect: 'manual', headers: { ...proxyHeaders,
        cookie: [...cookies.values()].filter(c => target.pathname === c.path || target.pathname.startsWith(c.path.endsWith('/') ? c.path : c.path + '/'))
          .sort((a, b) => b.path.length - a.path.length).map(c => `${c.name}=${c.value}`).join('; '), ...options.headers,
      } });
      for (const cookie of res.headers.getSetCookie()) {
        const part = cookie.split(';')[0]; const eq = part.indexOf('='); const name = part.slice(0, eq);
        const cookiePath = /;\s*path=([^;]+)/i.exec(cookie)?.[1] || target.pathname.slice(0, target.pathname.lastIndexOf('/') + 1);
        cookies.set(name + ':' + cookiePath, { name, value: part.slice(eq + 1), path: cookiePath });
      }
      return res;
    };
  }
  const login = async email => {
    const request = browser();
    const res = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'test-only' }) });
    assert.equal(res.status, 200);
    assert.match(res.headers.get('set-cookie'), /HttpOnly/); assert.match(res.headers.get('set-cookie'), /SameSite=Lax/);
    if (overrides.NOTESGYM_SECURE_COOKIES === 'true') assert.match(res.headers.get('set-cookie'), /; Secure/);
    return request;
  };
  async function authorize(request, { scope = 'openid notes:read', decision = 'allow', clientId = 'test-client' } = {}) {
    const verifier = randomBytes(32).toString('base64url');
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: publicBase + '/test-callback', response_type: 'code', scope,
      resource: publicBase + '/mcp', code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url'), state: 'test-state' });
    let res = await request('/oauth/auth?' + params);
    for (let i = 0; i < 10; i++) {
      if ([302, 303].includes(res.status)) {
        const location = res.headers.get('location');
        if (location.startsWith(publicBase + '/test-callback')) return { callback: new URL(location), verifier, clientId };
        res = await request(location); continue;
      }
      const html = await res.text();
      assert.equal(res.status, 200, html);
      const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
      assert.ok(csrf, html);
      // Current interaction path is in the provider cookie's path, but Location is
      // tracked explicitly by the redirect above in a wrapper below.
      const action = /<form method="post"(?: action="([^"]+)")?/.exec(html)?.[1];
      assert.ok(!action, 'Consent uses the same interaction URL');
      // Fetch response.url remains the exact URL despite redirect: manual.
      res = await request(res.url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: publicBase }, body: new URLSearchParams({ csrf, decision }) });
    }
    throw new Error('Too many OAuth redirects');
  }
  const exchange = async (authorization, override = {}) => {
    const res = await appFetch(base + '/oauth/token', { method: 'POST', headers: { ...proxyHeaders, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', client_id: authorization.clientId || 'test-client', redirect_uri: publicBase + '/test-callback',
        code: authorization.callback.searchParams.get('code') || '', code_verifier: authorization.verifier, resource: publicBase + '/mcp', ...override }) });
    return { status: res.status, body: await res.json() };
  };
  return { base, dir, login, browser, authorize, exchange, restart, proxyHeaders, fetch: appFetch };
}

test('real OAuth PKCE and MCP SDK: consent, isolation, invalid requests, revocation, read-only', async t => {
  const f = await fixture(t);
  const a = await f.login('a@example.invalid'); const b = await f.login('b@example.invalid');
  const write = (request, data) => request('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  await write(a, note); await write(b, { ...note, matiere: 'Secret B', note: 1 });
  const metadata = await (await fetch(f.base + '/.well-known/oauth-protected-resource/mcp')).json();
  assert.equal(metadata.resource, f.base + '/mcp');
  const discovery = await (await fetch(f.base + '/oauth/.well-known/openid-configuration')).json();
  assert.equal(discovery.issuer, f.base + '/oauth');
  assert.equal(discovery.authorization_endpoint, f.base + '/oauth/auth');
  assert.deepEqual(await (await fetch(f.base + '/.well-known/oauth-authorization-server/oauth')).json(), discovery);
  assert.deepEqual(discovery.code_challenge_methods_supported, ['S256']);
  assert.equal((await fetch(f.base + '/mcp', { method: 'POST' })).status, 401);
  assert.equal((await fetch(f.base + '/mcp', { method: 'POST', headers: { authorization: 'Bearer invalid-token' } })).status, 401);
  const denied = await f.authorize(a, { decision: 'deny' }); assert.equal(denied.callback.searchParams.get('error'), 'access_denied');
  const authA = await f.authorize(a); assert.equal(authA.callback.searchParams.get('state'), 'test-state');
  const tokenA = await f.exchange(authA); assert.equal(tokenA.status, 200, JSON.stringify(tokenA.body)); assert.equal(tokenA.body.expires_in, 600);
  assert.equal((await f.exchange(authA)).status, 400, 'authorization code is single-use');
  // A replay revokes the original code grant by design; obtain a fresh authorization.
  const activeA = await f.exchange(await f.authorize(a)); assert.equal(activeA.status, 200);
  const tokenB = await f.exchange(await f.authorize(b)); assert.equal(tokenB.status, 200);
  const client = async token => {
    const c = new Client({ name: 'NotesGym integration test', version: '1' });
    await c.connect(new StreamableHTTPClientTransport(new URL(f.base + '/mcp'), { requestInit: { headers: { authorization: 'Bearer ' + token } } }));
    t.after(() => c.close()); return c;
  };
  const ca = await client(activeA.body.access_token); const cb = await client(tokenB.body.access_token);
  const tools = (await ca.listTools()).tools;
  assert.equal(tools.length, 6); assert.ok(tools.every(x => x.annotations.readOnlyHint && !x.annotations.destructiveHint && x.outputSchema));
  const call = async (c, name, args = {}) => c.callTool({ name, arguments: args });
  const gradesA = await call(ca, 'get_grades'); const gradesB = await call(cb, 'get_grades');
  assert.equal(gradesA.structuredContent.grades[0].subject, 'Math'); assert.equal(gradesB.structuredContent.grades[0].subject, 'Secret B');
  assert.ok(!JSON.stringify(gradesA).includes('example.invalid'));
  assert.equal((await call(ca, 'get_subjects')).structuredContent.subjects[0].subject, 'Math');
  assert.equal((await call(ca, 'get_overview')).structuredContent.average, 4);
  assert.equal((await call(ca, 'analyze_subject', { subject: 'Math' })).structuredContent.subject.average, 4);
  assert.ok((await call(ca, 'get_grades', { userId: 'b' })).isError);
  assert.ok((await call(ca, 'get_grades', { limit: 101 })).isError);
  assert.ok((await call(ca, 'get_grades', { offset: -1 })).isError);
  const malformed = await fetch(f.base + '/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + activeA.body.access_token, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'unknown/method' }) });
  assert.ok((await malformed.json()).error, 'Unknown MCP methods return a JSON-RPC error');
  const before = await readFile(path.join(f.dir, 'notes.json'), 'utf8');
  const settingsBefore = await readFile(path.join(f.dir, 'simulation-settings.json'), 'utf8');
  assert.equal((await call(ca, 'simulate_grade', { year: '2026', semester: 'Semestre 1', grades: [{ subject: 'Math', grade: 6 }] })).structuredContent.after, 5);
  assert.equal(await readFile(path.join(f.dir, 'notes.json'), 'utf8'), before);
  assert.equal(await readFile(path.join(f.dir, 'simulation-settings.json'), 'utf8'), settingsBefore);
  assert.ok(!JSON.stringify(await call(ca, 'get_insights')).includes('Secret B'));
  const badPkce = await f.authorize(a);
  assert.equal((await f.exchange(badPkce, { code_verifier: randomBytes(32).toString('base64url') })).status, 400);
  const concurrentCode = await f.authorize(b, { clientId: 'other-client' });
  const concurrentExchanges = await Promise.all([f.exchange(concurrentCode), f.exchange(concurrentCode)]);
  assert.equal(concurrentExchanges.filter(r => r.status === 200).length, 1, 'a concurrent replay can never issue two tokens');
  const rpc = { method: 'POST', headers: { authorization: 'Bearer ' + activeA.body.access_token, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{broken' };
  assert.equal((await fetch(f.base + '/mcp', rpc)).status, 400);
  assert.equal((await fetch(f.base + '/mcp', { ...rpc, headers: { ...rpc.headers, origin: 'https://attacker.invalid' } })).status, 403);
  assert.equal((await a('/chatgpt/disconnect', { method: 'POST', body: 'csrf=wrong' })).status, 403);
  const management = await (await a('/chatgpt')).text(); const csrf = /name="csrf" value="([^"]+)"/.exec(management)[1];
  assert.equal((await a('/chatgpt/disconnect', { method: 'POST', headers: { origin: f.base }, body: new URLSearchParams({ csrf }) })).status, 200);
  assert.equal((await fetch(f.base + '/mcp', { ...rpc, body: '{}' })).status, 401);
  assert.equal((await call(cb, 'get_grades')).structuredContent.total, 1, 'B remains authorized after A revokes');
});

test('OAuth negative cases: scope, audience, redirect, PKCE, CSRF and token revocation endpoint', async t => {
  const f = await fixture(t);
  const request = await f.login('a@example.invalid');
  const noScope = await f.exchange(await f.authorize(request, { scope: 'openid' }));
  assert.equal(noScope.status, 200, JSON.stringify(noScope.body));
  const check = token => fetch(f.base + '/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: '{}' });
  assert.equal((await check(noScope.body.access_token)).status, 403);
  const auth = await f.authorize(request);
  assert.equal((await f.exchange(auth, { resource: 'https://other.invalid/mcp' })).status, 400);
  const params = new URLSearchParams({ client_id: 'test-client', redirect_uri: 'https://attacker.invalid/callback', response_type: 'code', scope: 'notes:read', resource: f.base + '/mcp' });
  const redirect = await request('/oauth/auth?' + params);
  assert.equal(redirect.status, 400, 'unregistered redirects never receive an authorization code');
  params.set('redirect_uri', f.base + '/test-callback');
  const noPkce = await request('/oauth/auth?' + params);
  assert.ok(noPkce.status === 400 || noPkce.headers.get('location')?.includes('error=invalid_request'));
  const token = await f.exchange(await f.authorize(request)); assert.equal(token.status, 200);
  const revoked = await fetch(f.base + '/oauth/token/revocation', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: 'test-client', token: token.body.access_token }) });
  assert.equal(revoked.status, 200);
  assert.equal((await check(token.body.access_token)).status, 401);
  assert.equal((await request('/api/notes', { method: 'POST', headers: { origin: 'https://attacker.invalid' }, body: '{}' })).status, 403);
});

test('access tokens expire and foreign issuer tokens are rejected', async t => {
  const f = await fixture(t, { NOTESGYM_OAUTH_ACCESS_TTL_SECONDS: '1' });
  const other = await fixture(t);
  const token = await f.exchange(await f.authorize(await f.login('a@example.invalid')));
  assert.equal(token.status, 200); assert.equal(token.body.expires_in, 1);
  const options = { method: 'POST', headers: { authorization: 'Bearer ' + token.body.access_token }, body: '{}' };
  assert.equal((await fetch(other.base + '/mcp', options)).status, 401);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await fetch(f.base + '/mcp', options)).status, 401);
});

test('JSON transactions preserve concurrent changes; input limits and sanitized errors', async t => {
  const f = await fixture(t); const a = await f.login('a@example.invalid');
  const post = body => a('/api/notes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const created = await Promise.all(Array.from({ length: 20 }, (_, i) => post({ ...note, nom_evaluation: 'synthetic-' + i })));
  assert.ok(created.every(r => r.status === 201));
  const notes = await (await a('/api/notes')).json(); assert.equal(notes.length, 20);
  const target = notes[0].id;
  const patch = body => a('/api/notes/' + target, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  await Promise.all([patch({ note: 5 }), patch({ coefficient: 3 })]);
  const merged = (await (await a('/api/notes')).json()).find(n => n.id === target);
  assert.equal(merged.note, 5); assert.equal(merged.coefficient, 3);
  for (const grade of [0, 6.1, -1, 'bad']) assert.equal((await post({ ...note, note: grade })).status, 400);
  assert.equal((await post({ ...note, commentaire: 'x'.repeat(66000) })).status, 413);
  assert.equal((await a('/api/notes', { method: 'POST', body: '{broken' })).status, 400);
  const res = await a('/api/notes'); assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const corrupt = '{synthetic-corruption';
  await writeFile(path.join(f.dir, 'notes.json'), corrupt);
  const failedRead = await a('/api/notes'); assert.equal(failedRead.status, 500);
  assert.deepEqual(await failedRead.json(), { error: 'Server error' });
  assert.equal((await post(note)).status, 500);
  assert.equal(await readFile(path.join(f.dir, 'notes.json'), 'utf8'), corrupt, 'corruption is never silently replaced');
  for (let i = 0; i < 20; i++) await a('/api/auth/login', { method: 'POST', body: '{}' });
  assert.equal((await a('/api/auth/login', { method: 'POST', body: '{}' })).status, 429);
});

test('production requires explicit activation and HTTPS', async () => {
  await assert.rejects(createChatGptIntegration({ env: { NODE_ENV: 'production' } }), /Explicit MCP activation/);
  await assert.rejects(createChatGptIntegration({ env: { NODE_ENV: 'production', NOTESGYM_MCP_ENABLED: 'true' } }), /HTTPS is required/);
});

test('SQLite OAuth sessions, grants, codes and revocation survive real process restarts', async t => {
  const f = await fixture(t);
  const a = await f.login('a@example.invalid'); const b = await f.login('b@example.invalid');
  const issuedA = await f.exchange(await f.authorize(a));
  const issuedB = await f.exchange(await f.authorize(b));
  const otherClient = await f.exchange(await f.authorize(a, { clientId: 'other-client' }));
  assert.equal(otherClient.status, 200);
  const pendingCode = await f.authorize(a);
  const rpc = token => fetch(f.base + '/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_grades', arguments: {} } }) });
  await f.restart();
  assert.equal((await fetch(f.base + '/api/health')).status, 200);
  for (const token of [issuedA, issuedB, otherClient]) assert.equal((await rpc(token.body.access_token)).status, 200);
  assert.equal((await f.exchange(pendingCode)).status, 200, 'unexpired code is recovered');
  assert.equal((await f.exchange(pendingCode)).status, 400, 'consumption survives persistence');
  const recoveredSession = await f.exchange(await f.authorize(b));
  assert.equal(recoveredSession.status, 200, 'OAuth cookie session resumes without a new NotesGym login');
  const freshA = await f.login('a@example.invalid');
  const html = await (await freshA('/chatgpt')).text();
  const csrf = /name="csrf" value="([^"]+)"/.exec(html)[1];
  assert.equal((await freshA('/chatgpt/disconnect', { method: 'POST', headers: { origin: f.base }, body: new URLSearchParams({ csrf }) })).status, 200);
  await f.restart();
  assert.equal((await rpc(otherClient.body.access_token)).status, 401, 'all A clients stay revoked after another restart');
  assert.equal((await rpc(recoveredSession.body.access_token)).status, 200, 'B remains authorized');
  await assert.rejects(f.restart({ NOTESGYM_OAUTH_COOKIE_KEYS: JSON.stringify(['x'.repeat(64)]) }), /issuer or keys changed/);
});

test('expired token stays invalid after process restart', async t => {
  const f = await fixture(t, { NOTESGYM_OAUTH_ACCESS_TTL_SECONDS: '1' });
  const token = await f.exchange(await f.authorize(await f.login('a@example.invalid')));
  await new Promise(resolve => setTimeout(resolve, 1100)); await f.restart();
  assert.equal((await fetch(f.base + '/mcp', { method: 'POST', headers: { authorization: 'Bearer ' + token.body.access_token } })).status, 401);
});

test('explicit production mode behind a trusted HTTPS proxy supports PKCE, issuer validation and restart', async t => {
  const origin = 'https://notesgym.example.invalid';
  const f = await fixture(t, { NODE_ENV: 'production', NOTESGYM_PUBLIC_URL: origin, NOTESGYM_TRUST_PROXY: 'true', NOTESGYM_TRUSTED_PROXY_IPS: '127.0.0.1' });
  const request = await f.login('a@example.invalid');
  const authorization = await f.authorize(request);
  assert.equal(authorization.callback.searchParams.get('iss'), origin + '/oauth');
  const token = await f.exchange(authorization); assert.equal(token.status, 200);
  await f.restart();
  const metadata = await (await f.fetch(f.base + '/.well-known/oauth-protected-resource/mcp', { headers: f.proxyHeaders })).json();
  assert.equal(metadata.resource, origin + '/mcp'); assert.deepEqual(metadata.authorization_servers, [origin + '/oauth']);
  const options = { method: 'POST', headers: { ...f.proxyHeaders, authorization: 'Bearer ' + token.body.access_token, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) };
  assert.equal((await f.fetch(f.base + '/mcp', options)).status, 200);
  assert.equal((await f.fetch(f.base + '/mcp', { ...options, headers: { ...options.headers, 'x-forwarded-proto': 'http' } })).status, 400);
  assert.equal((await f.fetch(f.base + '/mcp', { ...options, headers: { ...options.headers, host: 'attacker.invalid' } })).status, 400);
});
