import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { legacyFixture } from './helpers/legacy-fixture.js';

const baseNote = { matiere: "Math", note: 4, coefficient: 1, annee: "My year", semestre: "Semestre 1", date: "2026-09-01" };
async function startServer(directory) {
  const child = spawn(process.execPath, ["server.js"], { cwd: process.cwd(), windowsHide: true,
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("NOTESGYM_"))), NODE_ENV: "test", PORT: "0", NOTESGYM_DATA_DIR: directory }, stdio: ["ignore", "pipe", "pipe"] });
  const base = await new Promise((resolve, reject) => {
    let output = ""; let errors = "";
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Test server startup timed out")); }, 15000);
    child.stderr.on("data", data => { errors += data; });
    child.once("exit", () => { clearTimeout(timeout); reject(new Error("Test server exited: " + errors)); });
    child.stdout.on("data", data => {
      output += data;
      const match = /localhost:(\d+)/.exec(output);
      if (match) { clearTimeout(timeout); resolve("http://127.0.0.1:" + match[1]); }
    });
  });
  return { base, child, stop: () => new Promise(resolve => { child.once("exit", resolve); child.kill(); }) };
}
async function login(base, email) {
  const response = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "test-only" }) });
  assert.equal(response.status, 200);
  return { cookie: response.headers.get("set-cookie").split(";")[0], user: (await response.json()).user };
}
async function request(base, session, endpoint, method = "GET", body) {
  const response = await fetch(base + endpoint, { method, headers: { "content-type": "application/json", ...(session ? { cookie: session.cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}

test("account simulation API syncs devices, consumes notes once, isolates users and persists restart", async t => {
  const temporaryRoot = path.join(process.cwd(), ".notesgym-test-data");
  await mkdir(temporaryRoot, { recursive: true });
  const directory = await mkdtemp(path.join(temporaryRoot, "simulation-api-"));
  await legacyFixture(directory, ["first@example.invalid", "second@example.invalid"]);
  let server = await startServer(directory);
  t.after(async () => { if (server) await server.stop(); });
  const a = await login(server.base, "first@example.invalid");
  const deviceB = await login(server.base, "first@example.invalid");
  const other = await login(server.base, "second@example.invalid");
  assert.equal((await request(server.base, null, "/api/simulation-settings")).status, 401);
  const created = await request(server.base, a, "/api/notes", "POST", baseNote); assert.equal(created.status, 201);
  const patch = (session, changes, requestId = randomUUID()) => request(server.base, session, "/api/simulation-settings", "PATCH", { changes, accountId: session.user.id, requestId });
  const get = session => request(server.base, session, "/api/simulation-settings");
  const saved = await patch(a, { "My year": { Math: { remaining: 4, coefficient: 2 } } }); assert.equal(saved.status, 200);
  assert.equal((await get(deviceB)).data.plans["My year"].Math.remaining, 4);
  assert.equal((await get(deviceB)).data.plans["My year"].Math.coefficient, 2);
  assert.deepEqual((await get(other)).data.plans, {});
  assert.equal((await request(server.base, other, "/api/simulation-settings/migrate", "POST", { accountId: a.user.id, plans: {} })).status, 403);
  assert.equal((await request(server.base, other, "/api/simulation-settings", "PATCH", { accountId: a.user.id, changes: { "My year": { Math: { remaining: 19 } } } })).status, 403);
  await request(server.base, other, "/api/notes", "POST", baseNote);
  await patch(other, { "My year": { Math: { remaining: 8 } } });
  assert.equal((await get(a)).data.plans["My year"].Math.remaining, 4);
  await request(server.base, a, "/api/notes", "POST", { ...baseNote, date: "2026-09-02" });
  const simultaneous = await Promise.all([get(a), get(deviceB)]);
  assert.ok(simultaneous.every(result => result.data.plans["My year"].Math.remaining === 3));
  assert.equal((await get(a)).data.plans["My year"].Math.remaining, 3);
  await patch(a, { "My year": { Math: { coefficient: 3 } } });
  assert.equal((await get(deviceB)).data.plans["My year"].Math.remaining, 3);
  const concurrent = await Promise.all([patch(a, { "My year": { Math: { coefficient: 4 } } }), patch(deviceB, { "My year": { Math: { remaining: 6 } } })]);
  assert.ok(concurrent.every(result => result.status === 200));
  const merged = (await get(a)).data.plans["My year"].Math;
  assert.equal(merged.remaining, 6); assert.equal(merged.coefficient, 4);
  const invalid = await patch(a, { "My year": { Math: { remaining: -1 } } }); assert.equal(invalid.status, 400);
  assert.equal((await get(a)).data.plans["My year"].Math.remaining, 6);
  await request(server.base, a, "/api/notes", "POST", { ...baseNote, exclue_bulletin: true });
  await request(server.base, a, "/api/notes", "POST", { ...baseNote, archived: true });
  assert.equal((await get(a)).data.plans["My year"].Math.remaining, 6);
  await request(server.base, a, "/api/notes/" + created.data.id, "PATCH", { note: 5 });
  assert.equal((await get(a)).data.plans["My year"].Math.remaining, 6);
  const legacy = await request(server.base, a, "/api/notes", "POST", { ...baseNote, annee: "Imported year" });
  await request(server.base, a, "/api/notes", "POST", { ...baseNote, annee: "Imported year", date: "2026-09-03" });
  assert.equal((await get(a)).data.plans["Imported year"].Math.remaining, 2);
  const migrated = await request(server.base, a, "/api/simulation-settings/migrate", "POST", { accountId: a.user.id, plans: {
    "Imported year": { Math: { remaining: 4, coefficient: 2, knownNoteIds: ["id:" + legacy.data.id] } },
    "My year": { Math: { remaining: 19, coefficient: 19 } },
  } });
  assert.equal(migrated.status, 200); assert.equal(migrated.data.plans["Imported year"].Math.remaining, 3);
  assert.equal(migrated.data.plans["My year"].Math.remaining, 6);
  await request(server.base, a, "/api/simulation-settings/migrate", "POST", { accountId: a.user.id, plans: { "Imported year": { Math: { remaining: 19 } } } });
  assert.equal((await get(a)).data.plans["Imported year"].Math.remaining, 3);
  assert.equal((await get(other)).data.plans["My year"].Math.remaining, 8);
  await request(server.base, a, "/api/notes", "POST", { ...baseNote, matiere: "Retry" });
  const requestId = randomUUID();
  await patch(a, { "My year": { Retry: { remaining: 4 } } }, requestId);
  await request(server.base, a, "/api/notes", "POST", { ...baseNote, matiere: "Retry", date: "2026-09-04" });
  const replay = await patch(a, { "My year": { Retry: { remaining: 4 } } }, requestId);
  assert.equal(replay.data.plans["My year"].Retry.remaining, 3);
  await Promise.all([patch(a, { "My year": { Math: { coefficient: 4 } } }), patch(other, { "My year": { Math: { coefficient: 1.5 } } })]);
  assert.equal((await get(a)).data.plans["My year"].Math.coefficient, 4);
  assert.equal((await get(other)).data.plans["My year"].Math.coefficient, 1.5);
  await server.stop(); server = null;
  server = await startServer(directory);
  const fresh = await login(server.base, "first@example.invalid");
  const restored = (await get(fresh)).data;
  assert.equal(restored.plans["My year"].Math.remaining, 6);
  assert.equal(restored.plans["My year"].Math.coefficient, 4);
  assert.equal(restored.plans["Imported year"].Math.remaining, 3);
  assert.equal(restored.plans["My year"].Retry.remaining, 3);
});
