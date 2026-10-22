import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AuthStore, digest, passwordMatches, SESSION_TTL_MS } from '../server/auth-store.js';
import { AuthService } from '../server/auth.js';
import { migrateAuth, inspectLegacy, legacyFiles } from '../server/migrate-auth.js';
import { lockData } from '../server/data-lock.js';
import { legacyFixture } from './helpers/legacy-fixture.js';
import { authMessage, createMailer } from '../server/mailer.js';
import nodemailer from 'nodemailer';
import { spawn } from 'node:child_process';

const password = 'Synthetic password 123!';
async function temp() {
  const root = path.join(process.cwd(), '.notesgym-test-data');
  await fs.mkdir(root, { recursive: true });
  return fs.mkdtemp(path.join(root, 'auth-v2-'));
}
async function fixture(t, { legacy = false, policy = 'preserve-access' } = {}) {
  const dir = await temp();
  const users = legacy ? await legacyFixture(dir, ['first@example.invalid', 'second@example.invalid'], { password, policy,
    notes: u => [{ id: 'legacy-note', created_by: u[0].email, note: 4, arbitrary_metadata: { preserved: true }, archived: true }],
    simulations: u => [{ user_id: u[0].id, revision: 8, requestIds: ['retained'], plans: { Gym3: { Math: { remaining: 5, coefficient: 2, knownNoteIds: ['id:legacy-note'] } } } }],
  }) : [];
  let now = Date.now(); let store = new AuthStore(path.join(dir, 'auth.sqlite'), { create: !legacy, now: () => now });
  const messages = [];
  const options = { publicOrigin: 'https://notesgym.example', mailer: { configured: true, send: async message => { messages.push(message); } }, cookieFlags: () => 'HttpOnly; SameSite=Lax; Path=/; Secure', clientIP: req => req.ip };
  let auth = new AuthService(store, options);
  t.after(() => store.close());
  const call = async (action, body = {}, cookie, ip = '192.0.2.1') => {
    const req = { method: action === 'me' ? 'GET' : 'POST', ip, headers: { cookie } };
    const result = await auth.handle(req, '/api/auth/' + action, body);
    await Promise.all([...auth.mailJobs]);
    return { ...result, cookie: result.headers?.['set-cookie']?.split(';')[0] };
  };
  const link = (kind, to) => {
    const message = messages.findLast(message => (!to || message.to === to) && message.text.includes(`kind=${kind}`));
    assert.ok(message, 'captured email must contain a link');
    return { token: /token=([a-f0-9]{64})/.exec(message.text)[1], kind };
  };
  const register = email => call('register', { email, password, confirmPassword: password });
  const verified = async (email = 'new@example.invalid') => {
    await register(email); await call('verify-email', link('verify', email)); return call('login', { email, password });
  };
  return { dir, users, messages, call, link, register, verified, get store() { return store; }, get auth() { return auth; }, advance: ms => { now += ms; },
    restart: () => { store.close(); store = new AuthStore(path.join(dir, 'auth.sqlite'), { now: () => now }); auth = new AuthService(store, options); } };
}
const rejectsStatus = (promise, status) => assert.rejects(promise, error => error.status === status);

test('registration validates, detects duplicates internally, requires verification and never returns tokens or hashes', async t => {
  const f = await fixture(t);
  await rejectsStatus(f.call('register', { email: 'bad', password, confirmPassword: password }), 400);
  await rejectsStatus(f.call('register', { email: 'a@example.invalid', password: 'short', confirmPassword: 'short' }), 400);
  await rejectsStatus(f.call('register', { email: 'a@example.invalid', password, confirmPassword: 'different' }), 400);
  const first = await f.register('new@example.invalid');
  assert.equal(first.cookie, undefined);
  assert.equal(f.store.byEmail('new@example.invalid').email_verified, 0);
  assert.equal(await passwordMatches(password, f.store.byEmail('new@example.invalid').password), true);
  const duplicate = await f.register('NEW@example.invalid');
  assert.deepEqual(duplicate.data, first.data);
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 1);
  assert.equal(f.messages.length, 1);
  await rejectsStatus(f.call('login', { email: 'new@example.invalid', password }), 403);
  const token = f.link('verify');
  assert.equal(f.store.db.prepare('SELECT hash FROM tokens').get().hash, digest(token.token));
  assert.ok(!JSON.stringify(first).includes(token.token));
  await f.call('verify-email', token);
  await rejectsStatus(f.call('verify-email', token), 400);
  const login = await f.call('login', { email: 'new@example.invalid', password });
  assert.equal(login.data.user.email_verified, true);
  assert.equal(login.data.user.password, undefined);
  assert.match(login.headers['set-cookie'], /HttpOnly; SameSite=Lax; Path=\/; Secure; Max-Age=/);
});

test('wrong credentials are generic, sessions persist after store restart and logout revokes', async t => {
  const f = await fixture(t); const session = await f.verified();
  let message;
  for (const email of ['new@example.invalid', 'missing@example.invalid', 'invalid']) {
    try { await f.call('login', { email, password: 'wrong' }); assert.fail(); }
    catch (error) { assert.equal(error.status, 401); message ??= error.message; assert.equal(error.message, message); }
  }
  const raw = session.cookie.split('=')[1];
  assert.equal(f.store.db.prepare('SELECT hash FROM sessions').get().hash, digest(raw));
  f.restart(); assert.equal((await f.call('me', {}, session.cookie)).data.id, session.data.user.id);
  await f.call('logout', {}, session.cookie);
  await rejectsStatus(f.call('me', {}, session.cookie), 401);
});

test('resend replaces old token, verification expires and quotas persist after restart', async t => {
  const f = await fixture(t); await f.register('new@example.invalid'); const old = f.link('verify');
  await f.call('resend-verification', { email: 'new@example.invalid' }); const fresh = f.link('verify');
  await rejectsStatus(f.call('verify-email', old), 400);
  f.advance(86400001);
  await rejectsStatus(f.call('verify-email', fresh), 400);
  for (let i = 0; i < 3; i++) await f.call('resend-verification', { email: 'missing@example.invalid' });
  f.restart(); await rejectsStatus(f.call('resend-verification', { email: 'missing@example.invalid' }), 429);
});

test('password recovery hides account existence, expires, consumes once and revokes every device', async t => {
  const f = await fixture(t); const a = await f.verified(); const b = await f.call('login', { email: 'new@example.invalid', password });
  const known = await f.call('forgot-password', { email: 'new@example.invalid' });
  const unknown = await f.call('forgot-password', { email: 'unknown@example.invalid' });
  assert.deepEqual(known.data, unknown.data);
  const expired = f.link('reset'); f.advance(1800001);
  await rejectsStatus(f.call('reset-password', { ...expired, password, confirmPassword: password }), 400);
  await f.call('forgot-password', { email: 'new@example.invalid' }); const token = f.link('reset');
  const next = password + '-new';
  await f.call('reset-password', { ...token, password: next, confirmPassword: next });
  await rejectsStatus(f.call('reset-password', { ...token, password: next, confirmPassword: next }), 400);
  for (const session of [a, b]) await rejectsStatus(f.call('me', {}, session.cookie), 401);
  await rejectsStatus(f.call('login', { email: 'new@example.invalid', password }), 401);
  await f.call('login', { email: 'new@example.invalid', password: next });
  assert.ok(f.messages.some(message => message.subject.includes('mot de passe a été modifié')));
});

test('password change requires current password and invalidates sessions plus credential-changing links', async t => {
  const f = await fixture(t); const session = await f.verified();
  await f.call('forgot-password', { email: 'new@example.invalid' }); const reset = f.link('reset');
  await rejectsStatus(f.call('change-password', { currentPassword: 'wrong', password, confirmPassword: password }, session.cookie), 401);
  await f.call('change-password', { currentPassword: password, password: password + 'next', confirmPassword: password + 'next' }, session.cookie);
  await rejectsStatus(f.call('me', {}, session.cookie), 401);
  await rejectsStatus(f.call('reset-password', { ...reset, password, confirmPassword: password }), 400);
});

test('email change preserves stable ownership and permanently reserves historical addresses', async t => {
  const f = await fixture(t, { legacy: true });
  const a = await f.call('login', { email: f.users[0].email, password });
  const b = await f.call('login', { email: f.users[1].email, password });
  const note = (await inspectLegacy(f.dir)).records['notes.json'][0];
  assert.equal(f.store.owns(note, a.data.user), true); assert.equal(f.store.owns(note, b.data.user), false);
  await rejectsStatus(f.call('change-email', { email: 'next@example.invalid', currentPassword: 'bad' }, a.cookie), 401);
  await rejectsStatus(f.call('change-email', { email: f.users[1].email, currentPassword: password }, a.cookie), 409);
  await f.call('change-email', { email: 'next@example.invalid', currentPassword: password }, a.cookie);
  assert.equal(f.store.byId(a.data.user.id).email, f.users[0].email);
  const token = f.link('email'); await f.call('verify-email', token);
  await rejectsStatus(f.call('verify-email', token), 400); await rejectsStatus(f.call('me', {}, a.cookie), 401);
  const next = await f.call('login', { email: 'next@example.invalid', password });
  assert.equal(next.data.user.id, a.data.user.id); assert.equal(next.data.user.email_verified, true);
  assert.equal(f.store.owns(note, next.data.user), true);
  assert.equal(f.store.owns({ ...note, user_id: b.data.user.id }, next.data.user), false);
  assert.equal(f.store.owns({ ...note, user_id: next.data.user.id }, next.data.user), true);
  await f.register(f.users[0].email);
  assert.equal(f.store.byEmail(f.users[0].email), undefined);
  await rejectsStatus(f.call('change-email', { email: f.users[0].email, currentPassword: password }, b.cookie), 409);
});

test('email confirmation rechecks availability inside transaction and cannot replace another account', async t => {
  const f = await fixture(t, { legacy: true });
  const sessions = await Promise.all(f.users.map(user => f.call('login', { email: user.email, password })));
  await f.call('change-email', { email: 'race@example.invalid', currentPassword: password }, sessions[0].cookie);
  const first = f.link('email');
  await f.call('change-email', { email: 'race@example.invalid', currentPassword: password }, sessions[1].cookie);
  await f.call('verify-email', f.link('email'));
  await rejectsStatus(f.call('verify-email', first), 409);
  assert.equal(f.store.byEmail('race@example.invalid').id, f.users[1].id);
});

test('sessions have absolute expiry, and invalid cookies never authenticate', async t => {
  const f = await fixture(t); const session = await f.verified();
  for (const cookie of ['notesgym_session=%ZZ', 'notesgym_session=bad', 'unrelated=1']) await rejectsStatus(f.call('me', {}, cookie), 401);
  f.advance(SESSION_TTL_MS + 1); f.restart(); await rejectsStatus(f.call('me', {}, session.cookie), 401);
});

test('legacy passwords upgrade on successful login without changing source hashes, UUIDs, notes or simulations', async t => {
  const f = await fixture(t, { legacy: true }); const before = await inspectLegacy(f.dir);
  assert.match(f.store.byId(f.users[0].id).password, /^scrypt-v1:/);
  await f.call('login', { email: f.users[0].email, password });
  assert.match(f.store.byId(f.users[0].id).password, /^scrypt-v2:/);
  assert.equal(f.store.byId(f.users[0].id).email_verified, 0);
  assert.deepEqual((await inspectLegacy(f.dir)).checksums, before.checksums);
  assert.equal((await migrateAuth(f.dir, { apply: true, policy: 'require-verification' })).status, 'already-migrated');
  assert.equal(f.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 2);
});

test('strict legacy policy requires email proof and never resets historical passwords', async t => {
  const f = await fixture(t, { legacy: true, policy: 'require-verification' });
  await rejectsStatus(f.call('login', { email: f.users[0].email, password }), 403);
  await f.call('resend-verification', { email: f.users[0].email }); await f.call('verify-email', f.link('verify'));
  assert.equal((await f.call('login', { email: f.users[0].email, password })).data.user.id, f.users[0].id);
});

test('migration dry run, repeated execution, backup verification, injected failure and restoration', async () => {
  const dir = await temp(); await legacyFixture(dir, ['a@example.invalid'], { migrate: false });
  const before = await inspectLegacy(dir);
  assert.equal((await migrateAuth(dir)).status, 'dry-run');
  await assert.rejects(fs.access(path.join(dir, 'auth.sqlite')));
  await assert.rejects(migrateAuth(dir, { apply: true }), /Choose/);
  await assert.rejects(migrateAuth(dir, { apply: true, policy: 'preserve-access', beforePublish: () => { throw new Error('injected interruption'); } }), /injected/);
  await assert.rejects(fs.access(path.join(dir, 'auth.sqlite')));
  assert.deepEqual((await inspectLegacy(dir)).checksums, before.checksums);
  assert.ok(!(await fs.readdir(dir)).some(name => name.includes('staging')));
  const backup = (await fs.readdir(dir)).find(name => name.startsWith('auth-v2-backup'));
  const restore = await temp();
  for (const name of legacyFiles) await fs.copyFile(path.join(dir, backup, name), path.join(restore, name));
  assert.deepEqual((await inspectLegacy(restore)).checksums, before.checksums);
  assert.equal((await migrateAuth(restore, { apply: true, policy: 'preserve-access' })).status, 'migrated');
  assert.equal((await migrateAuth(restore, { apply: true, policy: 'preserve-access' })).status, 'already-migrated');
  assert.deepEqual((await inspectLegacy(restore)).checksums, before.checksums);
});

test('migration refuses duplicate emails, orphan notes/simulations, corrupt sources and changed source after staging', async () => {
  for (const variant of ['duplicate', 'orphan', 'simulation', 'corrupt', 'stable-conflict']) {
    const dir = await temp(); const users = await legacyFixture(dir, ['a@example.invalid'], { migrate: false });
    if (variant === 'duplicate') await fs.writeFile(path.join(dir, 'users.json'), JSON.stringify([...users, { ...users[0], id: crypto.randomUUID(), email: 'A@example.invalid' }]));
    if (variant === 'orphan') await fs.writeFile(path.join(dir, 'notes.json'), JSON.stringify([{ id: 'n', created_by: 'missing@example.invalid' }]));
    if (variant === 'simulation') await fs.writeFile(path.join(dir, 'simulation-settings.json'), JSON.stringify([{ user_id: crypto.randomUUID(), plans: {} }]));
    if (variant === 'corrupt') await fs.writeFile(path.join(dir, 'notes.json'), '{broken');
    if (variant === 'stable-conflict') await fs.writeFile(path.join(dir, 'notes.json'), JSON.stringify([{ id: 'n', created_by: users[0].email, user_id: crypto.randomUUID() }]));
    await assert.rejects(migrateAuth(dir, { apply: true, policy: 'preserve-access' }));
    await assert.rejects(fs.access(path.join(dir, 'auth.sqlite')));
  }
  const dir = await temp(); await legacyFixture(dir, ['a@example.invalid'], { migrate: false });
  await assert.rejects(migrateAuth(dir, { apply: true, policy: 'preserve-access', beforePublish: () => fs.writeFile(path.join(dir, 'notes.json'), '[ ]') }), /Source changed/);
  await assert.rejects(fs.access(path.join(dir, 'auth.sqlite')));
});

test('writer lock rejects a second process/migration and does not erase live lock', async () => {
  const dir = await temp(); const release = await lockData(dir);
  try { await assert.rejects(lockData(dir), /already in use/); await assert.rejects(migrateAuth(dir), /already in use/); }
  finally { await release(); }
  const again = await lockData(dir); await again();
});

test('SMTP unavailable fails closed for registration; templates are text/html and contain no passwords', async t => {
  const f = await fixture(t); const mailer = await createMailer({});
  f.auth.mailer = mailer;
  await rejectsStatus(f.register('a@example.invalid'), 503);
  assert.equal(f.store.byEmail('a@example.invalid'), undefined);
  for (const kind of ['verify', 'reset', 'email', 'password', 'changed']) {
    const message = authMessage('a@example.invalid', kind, kind === 'password' || kind === 'changed' ? undefined : 'https://example.invalid/#token=synthetic&kind=verify');
    assert.ok(message.text); assert.ok(message.html); assert.ok(!message.text.includes(password));
    assert.ok(!message.html.includes('&kind=verify'));
  }
});

test('SMTP transport requires TLS, uses secret file and disables file/URL access and debug logs', async t => {
  const dir = await temp(); const secret = path.join(dir, 'smtp-test-secret');
  await fs.writeFile(secret, 'synthetic-smtp-secret\n');
  const configurations = [];
  t.mock.method(nodemailer, 'createTransport', options => { configurations.push(options); return { sendMail: async message => message }; });
  for (const port of ['465', '587']) {
    const mailer = await createMailer({ SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: port, SMTP_FROM: 'NotesGym <sender@example.invalid>', SMTP_USER: 'synthetic-user', SMTP_PASSWORD_FILE: secret });
    const result = await mailer.send(authMessage('test@example.invalid', 'password'));
    assert.equal(result.from, 'NotesGym <sender@example.invalid>');
    const config = configurations.at(-1);
    assert.equal(config.secure, port === '465'); assert.equal(config.requireTLS, port !== '465');
    assert.equal(config.auth.pass, 'synthetic-smtp-secret');
    assert.equal(config.disableFileAccess, true); assert.equal(config.disableUrlAccess, true);
    assert.equal(config.debug, false); assert.equal(config.logger, false);
  }
  await assert.rejects(createMailer({ SMTP_HOST: 'smtp.example.invalid', SMTP_PORT: 'bad', SMTP_FROM: 'sender@example.invalid' }));
  await assert.rejects(createMailer({ SMTP_HOST: 'smtp.example.invalid', SMTP_FROM: 'sender@example.invalid', SMTP_USER: 'synthetic-user' }));
});

test('server refuses unmigrated/corrupt/missing historical stores and retired seed configuration without replacing them', async () => {
  for (const variant of ['unmigrated', 'corrupt', 'missing', 'retired-env']) {
    const dir = await temp(); await legacyFixture(dir, ['a@example.invalid'], { migrate: variant !== 'unmigrated' });
    const notesFile = path.join(dir, 'notes.json');
    if (variant === 'corrupt') await fs.writeFile(notesFile, '{synthetic-corruption');
    if (variant === 'missing') await fs.unlink(notesFile);
    const beforeUsers = await fs.readFile(path.join(dir, 'users.json'));
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['server.js'], { windowsHide: true,
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(NOTESGYM_|SMTP_)/i.test(key))), PORT: '0', NOTESGYM_DATA_DIR: dir, ...(variant === 'retired-env' ? { NOTESGYM_USERS: 'synthetic-only' } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
      let errors = ''; child.stderr.on('data', chunk => { errors += chunk; });
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Expected startup refusal')); }, 10000);
      child.once('exit', code => { clearTimeout(timeout); resolve({ code, errors }); });
    });
    assert.notEqual(result.code, 0); assert.ok(result.errors);
    assert.deepEqual(await fs.readFile(path.join(dir, 'users.json')), beforeUsers);
    if (variant === 'missing') await assert.rejects(fs.access(notesFile));
    if (variant === 'corrupt') assert.equal(await fs.readFile(notesFile, 'utf8'), '{synthetic-corruption');
    if (variant === 'unmigrated') await assert.rejects(fs.access(path.join(dir, 'auth.sqlite')));
    const release = await lockData(dir); await release();
  }
});

test('token replacement and initial verification preserve independent token types', async t => {
  const f = await fixture(t); await f.register('new@example.invalid');
  const user = f.store.byEmail('new@example.invalid');
  const verify = f.link('verify');
  const reset = f.store.issue(user.id, 'reset', user.email);
  const email = f.store.issue(user.id, 'email', 'next@example.invalid');
  await f.call('resend-verification', { email: user.email });
  await rejectsStatus(f.call('verify-email', verify), 400);
  assert.equal(f.store.token(reset, 'reset').user_id, user.id);
  assert.equal(f.store.token(email, 'email').user_id, user.id);
  await rejectsStatus(f.call('verify-email', { token: reset, kind: 'verify' }), 400);
  await f.call('verify-email', f.link('verify'));
  assert.equal(f.store.token(reset, 'reset').user_id, user.id);
  assert.equal(f.store.token(email, 'email').user_id, user.id);
});

test('password reset preserves current-address verification but revokes reset, email-change links and all sessions', async t => {
  const f = await fixture(t, { legacy: true }); const user = f.users[0];
  const session = await f.call('login', { email: user.email, password });
  const verify = f.store.issue(user.id, 'verify', user.email);
  const reset = f.store.issue(user.id, 'reset', user.email);
  const email = f.store.issue(user.id, 'email', 'next@example.invalid');
  await f.call('reset-password', { token: reset, password: password + 'next', confirmPassword: password + 'next' });
  await rejectsStatus(f.call('me', {}, session.cookie), 401);
  assert.throws(() => f.store.token(reset, 'reset'), { status: 400 });
  assert.throws(() => f.store.token(email, 'email'), { status: 400 });
  await f.call('verify-email', { token: verify, kind: 'verify' });
  assert.equal(f.store.byId(user.id).email_verified, 1);
});

test('password change preserves current-address verification and cancels other credential links', async t => {
  const f = await fixture(t, { legacy: true }); const user = f.users[0];
  const session = await f.call('login', { email: user.email, password });
  const verify = f.store.issue(user.id, 'verify', user.email);
  const reset = f.store.issue(user.id, 'reset', user.email);
  const email = f.store.issue(user.id, 'email', 'next@example.invalid');
  await f.call('change-password', { currentPassword: password, password: password + 'next', confirmPassword: password + 'next' }, session.cookie);
  await rejectsStatus(f.call('me', {}, session.cookie), 401);
  for (const [token, kind] of [[reset, 'reset'], [email, 'email']]) assert.throws(() => f.store.token(token, kind), { status: 400 });
  await f.call('verify-email', { token: verify, kind: 'verify' });
});

test('email confirmation invalidates every old-address link and sessions only when committed', async t => {
  const f = await fixture(t, { legacy: true }); const user = f.users[0];
  const session = await f.call('login', { email: user.email, password });
  const verify = f.store.issue(user.id, 'verify', user.email);
  const reset = f.store.issue(user.id, 'reset', user.email);
  await f.call('change-email', { currentPassword: password, email: 'next@example.invalid' }, session.cookie);
  assert.equal((await f.call('me', {}, session.cookie)).data.email, user.email);
  assert.ok(f.store.token(verify, 'verify')); assert.ok(f.store.token(reset, 'reset'));
  await f.call('verify-email', f.link('email'));
  assert.throws(() => f.store.token(verify, 'verify'), { status: 400 });
  assert.throws(() => f.store.token(reset, 'reset'), { status: 400 });
  await rejectsStatus(f.call('me', {}, session.cookie), 401);
  assert.equal(f.store.byId(user.id).email, 'next@example.invalid');
});

test('concurrent resets and email verifications can each consume a token only once', async t => {
  const f = await fixture(t); await f.register('new@example.invalid');
  const verification = f.link('verify');
  const verifyResults = await Promise.allSettled([f.call('verify-email', verification), f.call('verify-email', verification)]);
  assert.equal(verifyResults.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(verifyResults.find(result => result.status === 'rejected').reason.status, 400);
  const user = f.store.byEmail('new@example.invalid');
  const reset = f.store.issue(user.id, 'reset', user.email);
  const passwords = [password + 'first', password + 'second'];
  const results = await Promise.allSettled(passwords.map(next => f.call('reset-password', { token: reset, password: next, confirmPassword: next })));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 400);
  const winner = results.findIndex(result => result.status === 'fulfilled');
  assert.equal(await passwordMatches(passwords[winner], f.store.byId(user.id).password), true);
  assert.equal(f.messages.filter(message => message.subject.includes('mot de passe a été modifié')).length, 1);
});

test('email confirmation cancels a reset already hashing its new password', async t => {
  const f = await fixture(t, { legacy: true }); const user = f.users[0];
  const reset = f.store.issue(user.id, 'reset', user.email);
  const email = f.store.issue(user.id, 'email', 'next@example.invalid');
  const results = await Promise.allSettled([
    f.call('reset-password', { token: reset, password: password + 'next', confirmPassword: password + 'next' }),
    f.call('verify-email', { token: email, kind: 'email' }),
  ]);
  assert.equal(results[0].status, 'rejected'); assert.equal(results[0].reason.status, 400);
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(await passwordMatches(password, f.store.byId(user.id).password), true);
});

test('SMTP rejection or synchronous failure is contained, logs no secret, and resend recovers', async t => {
  const f = await fixture(t); const messages = []; const logs = [];
  t.mock.method(console, 'error', (...args) => logs.push(args.join(' ')));
  let attempt = 0;
  f.auth.mailer.send = message => {
    messages.push(message); attempt++;
    const error = new Error('SYNTHETIC-SMTP-SECRET ' + message.text);
    if (attempt === 1) throw error;
    if (attempt === 2) return Promise.reject(error);
    return Promise.resolve();
  };
  const result = await f.register('new@example.invalid');
  const token = /token=([a-f0-9]{64})/.exec(messages[0].text)[1];
  const user = f.store.byEmail('new@example.invalid');
  const reset = f.store.issue(user.id, 'reset', user.email);
  const unknown = await f.call('resend-verification', { email: 'missing@example.invalid' });
  const retry = await f.call('resend-verification', { email: user.email });
  assert.deepEqual(retry.data, unknown.data); assert.deepEqual(retry.data, result.data);
  const failedRetry = /token=([a-f0-9]{64})/.exec(messages[1].text)[1];
  await f.call('resend-verification', { email: user.email });
  const delivered = /token=([a-f0-9]{64})/.exec(messages[2].text)[1];
  assert.equal(f.auth.mailJobs.size, 0);
  assert.equal(logs.length, 2);
  for (const secret of ['SYNTHETIC-SMTP-SECRET', user.email, token, reset, failedRetry, delivered, password]) assert.ok(!logs.join('\n').includes(secret));
  assert.throws(() => f.store.token(token, 'verify'), { status: 400 });
  assert.throws(() => f.store.token(failedRetry, 'verify'), { status: 400 });
  assert.ok(f.store.token(reset, 'reset'));
  await f.call('verify-email', { token: delivered, kind: 'verify' });
  assert.equal(f.store.byId(user.id).email_verified, 1);
});

test('undelivered verification and recovery tokens still expire at their exact deadlines', async t => {
  const f = await fixture(t); const messages = [];
  t.mock.method(console, 'error', () => {});
  f.auth.mailer.send = async message => { messages.push(message); throw new Error('Synthetic delivery failure'); };
  await f.register('new@example.invalid'); await f.call('forgot-password', { email: 'new@example.invalid' });
  const verify = /token=([a-f0-9]{64})/.exec(messages[0].text)[1];
  const reset = /token=([a-f0-9]{64})/.exec(messages[1].text)[1];
  f.advance(1800000);
  assert.throws(() => f.store.token(reset, 'reset'), { status: 400 }); assert.ok(f.store.token(verify, 'verify'));
  f.advance(86400000 - 1800000);
  assert.throws(() => f.store.token(verify, 'verify'), { status: 400 });
  assert.equal(f.auth.mailJobs.size, 0);
});

test('malformed migration input does not expose its contents in diagnostic errors', async () => {
  const dir = await temp(); await legacyFixture(dir, ['a@example.invalid'], { migrate: false });
  const secret = 'SYNTHETIC_PRIVATE_NOTE_DATA';
  await fs.writeFile(path.join(dir, 'notes.json'), secret);
  await assert.rejects(inspectLegacy(dir), error => !error.message.includes('SYNTHETIC_') && error.message.includes('notes.json'));
});

test('login email normalization and changing IP cannot evade a persistent account quota', async t => {
  const f = await fixture(t); await f.register('new@example.invalid');
  for (let i = 0; i < 20; i++) f.store.limit('account:login:' + digest('new@example.invalid'), 20, 600000);
  await rejectsStatus(f.call('login', { email: '  NEW@example.invalid  ', password }), 429);
  await rejectsStatus(f.call('login', { email: 'new@example.invalid', password }, undefined, '192.0.2.99'), 429);
  await rejectsStatus(f.call('login', { email: 'different@example.invalid', password }), 401);
  assert.ok((await f.call('forgot-password', { email: 'NEW@example.invalid' })).data.message);
});

test('startup and migration CLI diagnostics never print fragments of a malformed private store', async () => {
  const dir = await temp(); await legacyFixture(dir, ['a@example.invalid']);
  const marker = 'SYNTHETIC_PRIVATE_NOTE_DATA'; await fs.writeFile(path.join(dir, 'notes.json'), marker);
  for (const args of [['server.js'], ['server/migrate-auth.js', '--data-dir=' + dir]]) {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { windowsHide: true,
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(NOTESGYM_|SMTP_)/i.test(key))), PORT: '0', NOTESGYM_DATA_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = ''; child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { output += chunk; });
      const timer = setTimeout(() => { child.kill(); reject(new Error('Expected safe refusal')); }, 10000);
      child.once('exit', code => { clearTimeout(timer); resolve({ code, output }); });
      child.on('error', reject);
    });
    assert.notEqual(result.code, 0); assert.ok(result.output.includes('notes.json'));
    assert.ok(!result.output.includes('SYNTHETIC_'));
    assert.equal(await fs.readFile(path.join(dir, 'notes.json'), 'utf8'), marker);
  }
});
