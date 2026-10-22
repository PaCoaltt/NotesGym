import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { AuthStore } from '../server/auth-store.js';
import { AuthService } from '../server/auth.js';

test('fixed limiter window survives repeated blocked attempts and resets exactly at expiry', () => {
  let now = 100;
  const store = new AuthStore(':memory:', { create: true, now: () => now });
  try {
    const row = () => ({ ...store.db.prepare('SELECT * FROM limits WHERE key=?').get('test') });
    assert.equal(store.limit('test', 2, 1000), true);
    assert.deepEqual(row(), { key: 'test', count: 1, until: 1100 });
    now = 600; assert.equal(store.limit('test', 2, 1000), true);
    for (now = 601; now < 1100; now++) assert.equal(store.limit('test', 2, 1000), false);
    assert.equal(row().until, 1100, 'blocked requests must never extend the deadline');
    now = 1100; assert.equal(store.limit('test', 2, 1000), true);
    assert.deepEqual(row(), { key: 'test', count: 1, until: 2100 });
    now = 2099; assert.equal(store.limit('test', 2, 1000), true);
    assert.equal(store.limit('test', 2, 1000), false);
    now = 2100; assert.equal(store.limit('test', 2, 1000), true);
    assert.deepEqual(row(), { key: 'test', count: 1, until: 3100 });
  } finally { store.close(); }
});

test('limiter bounds live keys, admits existing keys at capacity, and cleans expired entries', () => {
  let now = 1000;
  const store = new AuthStore(':memory:', { create: true, now: () => now });
  try {
    store.transaction(() => {
      const insert = store.db.prepare('INSERT INTO limits VALUES(?,1,2000)');
      for (let i = 0; i < 20000; i++) insert.run('key-' + i);
    });
    assert.equal(store.limit('overflow', 2, 1000), false);
    assert.equal(store.limit('key-0', 2, 1000), true);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM limits').get().n, 20000);
    now = 2000;
    assert.equal(store.limit('overflow', 2, 1000), true);
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM limits').get().n, 1);
    for (let cycle = 0; cycle < 5; cycle++) {
      now += 1000;
      assert.equal(store.limit('next-' + cycle, 2, 1000), true);
      assert.equal(store.db.prepare('SELECT count(*) AS n FROM limits').get().n, 1);
    }
  } finally { store.close(); }
});

test('auth quotas retain IP, account and action scope and expire without sliding', () => {
  let now = 1000;
  const store = new AuthStore(':memory:', { create: true, now: () => now });
  const auth = new AuthService(store, { clientIP: req => req.ip });
  try {
    const a = { ip: '192.0.2.1' }; const b = { ip: '192.0.2.2' };
    for (let i = 0; i < 20; i++) auth.quota(a, 'login', `synthetic-${i}@example.invalid`);
    assert.throws(() => auth.quota(a, 'login', 'another@example.invalid'), { status: 429 });
    assert.doesNotThrow(() => auth.quota(b, 'login', 'another@example.invalid'));
    assert.doesNotThrow(() => auth.quota(a, 'forgot-password', 'another@example.invalid'));
    for (let i = 0; i < 20; i++) auth.quota({ ip: '198.51.100.' + i }, 'login', 'shared@example.invalid');
    assert.throws(() => auth.quota({ ip: '203.0.113.1' }, 'login', 'shared@example.invalid'), { status: 429 });
    for (let i = 0; i < 3; i++) auth.quota({ ip: '198.51.100.' + i }, 'resend-verification', 'shared@example.invalid');
    now += 599999;
    assert.throws(() => auth.quota(a, 'login', 'another@example.invalid'), { status: 429 });
    now++;
    assert.doesNotThrow(() => auth.quota(a, 'login', 'another@example.invalid'));
    assert.throws(() => auth.quota(b, 'resend-verification', 'shared@example.invalid'), { status: 429 });
    now = 3601000;
    assert.doesNotThrow(() => auth.quota(b, 'resend-verification', 'shared@example.invalid'));
  } finally { store.close(); }
});

test('limiter deadline and counter survive a store restart, including a restart at expiry', async () => {
  const root = path.join(process.cwd(), '.notesgym-test-data'); await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'limit-restart-')); const filename = path.join(directory, 'auth.sqlite');
  let now = 1000; let store = new AuthStore(filename, { create: true, now: () => now });
  try {
    assert.equal(store.limit('persistent', 1, 1000), true); store.close();
    now = 1999; store = new AuthStore(filename, { now: () => now });
    assert.equal(store.limit('persistent', 1, 1000), false);
    assert.equal(store.db.prepare('SELECT until FROM limits').get().until, 2000); store.close();
    now = 2000; store = new AuthStore(filename, { now: () => now });
    assert.equal(store.limit('persistent', 1, 1000), true);
    assert.deepEqual({ ...store.db.prepare('SELECT * FROM limits').get() }, { key: 'persistent', count: 1, until: 3000 });
  } finally { store.close(); }
});

test('simultaneous SQLite connections cannot admit more requests than the persistent quota', async t => {
  const root = path.join(process.cwd(), '.notesgym-test-data');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'limit-race-'));
  const filename = path.join(directory, 'auth.sqlite');
  const store = new AuthStore(filename, { create: true });
  t.after(() => store.close());
  const gate = new SharedArrayBuffer(4);
  const workers = Array.from({ length: 4 }, () => new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      const { AuthStore } = await import(workerData.module);
      const store = new AuthStore(workerData.filename, { now: () => 1000 });
      parentPort.postMessage({ ready: true });
      Atomics.wait(new Int32Array(workerData.gate), 0, 0);
      let admitted = 0;
      try { for (let i = 0; i < 25; i++) admitted += Number(store.limit('shared-key', 23, 1000)); }
      finally { store.close(); }
      parentPort.postMessage({ admitted });
    })().catch(error => { throw error; });
  `, { eval: true, workerData: { module: new URL('../server/auth-store.js', import.meta.url).href, filename, gate } }));
  t.after(async () => { await Promise.all(workers.map(worker => worker.terminate())); });
  const ready = workers.map(worker => new Promise((resolve, reject) => { worker.on('message', message => { if (message.ready) resolve(); }); worker.on('error', reject); }));
  const results = workers.map(worker => new Promise((resolve, reject) => { worker.on('message', message => { if ('admitted' in message) resolve(message.admitted); }); worker.on('error', reject); }));
  await Promise.all(ready);
  Atomics.store(new Int32Array(gate), 0, 1); Atomics.notify(new Int32Array(gate), 0);
  assert.equal((await Promise.all(results)).reduce((sum, count) => sum + count, 0), 23);
  assert.deepEqual({ ...store.db.prepare('SELECT * FROM limits').get() }, { key: 'shared-key', count: 100, until: 2000 });
});
