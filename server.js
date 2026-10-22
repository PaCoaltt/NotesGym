import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { AuthStore } from "./server/auth-store.js";
import { AuthService } from "./server/auth.js";
import { createMailer } from "./server/mailer.js";
import { lockData } from "./server/data-lock.js";

import { reconcileAccountSimulationPlans, patchAccountSimulationPlans, migrateAccountSimulationPlans } from "./src/lib/analytics/accountSimulationSettings.js";
import { httpError, proxyPolicy, rateLimiter, readLimitedBody, sameOrigin, securityHeaders, readPublicOrigin, webOrigin } from "./server/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.NOTESGYM_DATA_DIR || path.join(__dirname, "data");

const USERS_FILE = path.join(DATA_DIR, "users.json");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const SIMULATION_SETTINGS_FILE = path.join(DATA_DIR, "simulation-settings.json");
const PUBLIC_DIR = path.join(__dirname, "dist");

let authStore;
let auth;
let releaseData;
const publicOrigin = readPublicOrigin();
const cookieFlags = req => `HttpOnly; SameSite=Lax; Path=/${process.env.NOTESGYM_SECURE_COOKIES === "true" || webOrigin(req, publicOrigin, proxy).startsWith("https:") ? "; Secure" : ""}`;
const apiAllowed = rateLimiter({ limit: 600 });
const proxy = proxyPolicy();

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await ensureFile(NOTES_FILE, []);
  await ensureFile(SIMULATION_SETTINGS_FILE, []);

}

async function ensureFile(file, fallback) {
  try {
    await fs.access(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    await writeJson(file, fallback);
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    if (error instanceof SyntaxError) throw new Error(`Invalid JSON store: ${path.basename(file)}`);
    throw error; // Corruption must never silently overwrite an existing store.
  }
}

let writeQueue = Promise.resolve();

async function writeJson(file, value) {
  const job = async () => {
    const tmp = `${file}.tmp`;
    const handle = await fs.open(tmp, "w", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally { await handle.close(); }
    await fs.rename(tmp, file);
  };
  writeQueue = writeQueue.then(job, job);
  return writeQueue;
}

async function getCurrentUser(req) { return auth.current(req); }

async function initializeAuth() {
  releaseData = await lockData(DATA_DIR);
  if (process.env.NOTESGYM_USERS) throw new Error('NOTESGYM_USERS is retired. Materialize legacy accounts with the old version, then run the explicit migration.');
  const dbFile = path.join(DATA_DIR, 'auth.sqlite');
  let exists = false;
  try { await fs.access(dbFile); exists = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!exists) {
    for (const file of [USERS_FILE, NOTES_FILE, SIMULATION_SETTINGS_FILE]) {
      const records = await readJson(file, []);
      if (!Array.isArray(records) || records.length) throw new Error('Legacy data detected. Run server/migrate-auth.js offline before starting auth v2.');
    }
  }
  authStore = new AuthStore(dbFile, { create: !exists });
  await fs.chmod(dbFile, 0o600);
  if (exists) {
    // Never silently replace a missing/corrupt application store on an established volume.
    const initialized = authStore.db.prepare("SELECT 1 FROM meta WHERE key='app-initialized'").get();
    const legacySource = authStore.db.prepare("SELECT value FROM meta WHERE key='legacy-source'").get();
    for (const file of [NOTES_FILE, SIMULATION_SETTINGS_FILE]) {
      const optional = !initialized && (!legacySource || JSON.parse(legacySource.value)[path.basename(file)] === null);
      let records;
      try { records = await readJson(file); }
      catch (error) { if (error.code === 'ENOENT' && optional) continue; throw error; }
      if (!Array.isArray(records)) throw new Error('Invalid application store');
    }
  }
  auth = new AuthService(authStore, { mailer: await createMailer(), publicOrigin, cookieFlags, clientIP: req => proxy.clientIP(req) });
  await ensureDataFiles();
  authStore.db.prepare("INSERT OR IGNORE INTO meta VALUES('app-initialized','1')").run();
}

async function readBody(req) {
  if (req.notesgymBody !== undefined) return req.notesgymBody;
  const raw = await readLimitedBody(req);
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw httpError(400, "Invalid JSON"); }
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, { ...jsonHeaders, ...headers });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function validateNote(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw httpError(400, "Invalid note");
  if (!String(input.matiere || "").trim()) throw httpError(400, "Subject is required");
  if (!String(input.annee || "").trim()) throw httpError(400, "School year is required");
  if (!String(input.semestre || "").trim()) throw httpError(400, "Semester is required");

  const note = Number(input.note);
  const coefficient = Number(input.coefficient ?? 1);
  if (!Number.isFinite(note) || note < 1 || note > 6) throw httpError(400, "Grade must be between 1 and 6 (Swiss scale)");
  if (!Number.isFinite(coefficient) || coefficient <= 0 || coefficient > 100) throw httpError(400, "Coefficient must be between 0 (exclusive) and 100");
  for (const field of ["matiere", "annee", "semestre", "nom_evaluation", "date", "commentaire"]) {
    if (String(input[field] || "").length > (field === "commentaire" ? 2000 : 160)) throw httpError(400, "Field too long");
  }

  return {
    matiere: String(input.matiere).trim(),
    note,
    coefficient,
    annee: String(input.annee).trim(),
    semestre: String(input.semestre).trim(),
    nom_evaluation: String(input.nom_evaluation || "").trim(),
    date: input.date || "",
    commentaire: String(input.commentaire || "").trim(),
    exclue_bulletin: Boolean(input.exclue_bulletin),
    matiere_hors_bulletin: Boolean(input.matiere_hors_bulletin),
    archived: Boolean(input.archived),
  };
}

async function requireUser(req, res) {
  const user = await getCurrentUser(req);
  if (!user) sendError(res, 401, "Authentication required");
  return user;
}

// Serialize the entire read/modify/write transaction, not just the final file write.
let simulationSettingsQueue = Promise.resolve();
function accountSimulationSettings(user, operation = "read", payload, requestId) {
  const job = async () => {
    const records = await readJson(SIMULATION_SETTINGS_FILE);
    if (!Array.isArray(records)) throw new Error("Invalid simulation settings store");
    const index = records.findIndex(record => record.user_id === user.id);
    const previous = index < 0 ? { user_id: user.id, plans: {}, revision: 0 } : records[index];
    const notes = (await readJson(NOTES_FILE)).filter(note => authStore.owns(note, user));
    const replay = operation === "patch" && (previous.requestIds || []).includes(requestId);
    const plans = operation === "patch" && !replay ? patchAccountSimulationPlans(previous.plans, notes, payload)
      : operation === "migrate" ? migrateAccountSimulationPlans(previous.plans, notes, payload)
        : reconcileAccountSimulationPlans(previous.plans, notes);
    const changed = JSON.stringify(plans) !== JSON.stringify(previous.plans);
    const requestIds = operation === "patch" && !replay ? [...(previous.requestIds || []), requestId].slice(-1000) : previous.requestIds || [];
    const next = { ...previous, plans, requestIds, revision: previous.revision + Number(changed) };
    if (changed || (operation === "patch" && !replay) || index < 0) {
      if (index < 0) records.push(next); else records[index] = next;
      await writeJson(SIMULATION_SETTINGS_FILE, records);
    }
    return { accountId: user.id, plans: next.plans, revision: next.revision };
  };
  simulationSettingsQueue = simulationSettingsQueue.then(job, job);
  return simulationSettingsQueue;
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname.startsWith("/api/auth/")) {
      const result = await auth.handle(req, url.pathname, ["GET", "HEAD"].includes(req.method) ? {} : await readBody(req));
      return sendJson(res, 200, result.data, result.headers);
    }

    if (url.pathname === "/api/simulation-settings" && req.method === "GET") {
      const user = await requireUser(req, res);
      if (!user) return;
      return sendJson(res, 200, await accountSimulationSettings(user));
    }
    if (url.pathname === "/api/simulation-settings" && req.method === "PATCH") {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      if (body.accountId !== user.id) return sendError(res, 403, "Account changed");
      if (typeof body.requestId !== "string" || !body.requestId || body.requestId.length > 128) return sendError(res, 400, "Request ID required");
      return sendJson(res, 200, await accountSimulationSettings(user, "patch", body.changes, body.requestId));
    }
    if (url.pathname === "/api/simulation-settings/migrate" && req.method === "POST") {
      const user = await requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      if (body.accountId !== user.id) return sendError(res, 403, "Account changed");
      return sendJson(res, 200, await accountSimulationSettings(user, "migrate", body.plans));
    }

    if (url.pathname === "/api/notes" && req.method === "GET") {
      const user = await requireUser(req, res);
      if (!user) return;
      const notes = await readJson(NOTES_FILE);
      const ownNotes = notes
        .filter((note) => authStore.owns(note, user))
        .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));
      return sendJson(res, 200, ownNotes);
    }

    if (url.pathname === "/api/notes" && req.method === "POST") {
      const user = await requireUser(req, res);
      if (!user) return;
      const notes = await readJson(NOTES_FILE);
      const now = new Date().toISOString();
      const note = {
        id: crypto.randomUUID(),
        ...validateNote(await readBody(req)),
        user_id: user.id,
        created_by: user.email,
        created_date: now,
        updated_date: now,
      };
      notes.push(note);
      await writeJson(NOTES_FILE, notes);
      return sendJson(res, 201, note);
    }

    if (url.pathname === "/api/notes/subject-report-status" && req.method === "PATCH") {
      const user = await requireUser(req, res);
      if (!user) return;

      const body = await readBody(req);
      const subject = String(body.subject || "").trim();
      if (!subject) return sendError(res, 400, "Subject is required");

      const notes = await readJson(NOTES_FILE);
      const updatedAt = new Date().toISOString();
      let updatedCount = 0;
      for (const note of notes) {
        if (authStore.owns(note, user) && note.matiere === subject) {
          note.matiere_hors_bulletin = Boolean(body.excluded);
          note.updated_date = updatedAt;
          updatedCount += 1;
        }
      }
      if (updatedCount > 0) await writeJson(NOTES_FILE, notes);
      return sendJson(res, 200, { updatedCount, subject, excluded: Boolean(body.excluded) });
    }

    if (url.pathname === "/api/notes/archive" && req.method === "PATCH") {
      const user = await requireUser(req, res);
      if (!user) return;

      const body = await readBody(req);
      const years = Array.isArray(body.years)
        ? new Set(body.years.map((year) => String(year).trim()).filter(Boolean))
        : new Set();
      if (years.size === 0) return sendError(res, 400, "At least one school year is required");

      const notes = await readJson(NOTES_FILE);
      const updatedAt = new Date().toISOString();
      let archivedCount = 0;

      for (const note of notes) {
        if (authStore.owns(note, user) && years.has(note.annee) && !note.archived) {
          note.archived = true;
          note.updated_date = updatedAt;
          archivedCount += 1;
        }
      }

      if (archivedCount > 0) await writeJson(NOTES_FILE, notes);
      return sendJson(res, 200, { archivedCount });
    }

    const noteMatch = url.pathname.match(/^\/api\/notes\/([^/]+)$/);
    if (noteMatch && req.method === "PATCH") {
      const user = await requireUser(req, res);
      if (!user) return;
      const notes = await readJson(NOTES_FILE);
      const id = decodeURIComponent(noteMatch[1]);
      const index = notes.findIndex((note) => note.id === id && authStore.owns(note, user));
      if (index === -1) return sendError(res, 404, "Note not found");

      notes[index] = {
        ...notes[index],
        ...validateNote({ ...notes[index], ...(await readBody(req)) }),
        id: notes[index].id,
        created_by: notes[index].created_by,
        created_date: notes[index].created_date,
        updated_date: new Date().toISOString(),
      };
      await writeJson(NOTES_FILE, notes);
      return sendJson(res, 200, notes[index]);
    }

    if (noteMatch && req.method === "DELETE") {
      const user = await requireUser(req, res);
      if (!user) return;
      const notes = await readJson(NOTES_FILE);
      const id = decodeURIComponent(noteMatch[1]);
      const kept = notes.filter((note) => !(note.id === id && authStore.owns(note, user)));
      if (kept.length === notes.length) return sendError(res, 404, "Note not found");
      await writeJson(NOTES_FILE, kept);
      return sendJson(res, 200, { ok: true });
    }

    return sendError(res, 404, "Not found");
  } catch (error) {
    return sendError(res, error.status || 500, error.status ? error.message : "Server error");
  }
}

async function serveStatic(req, res, url) {
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  try {
    const stat = await fs.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, "index.html");
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "content-type": contentType(filePath) });
    return res.end(content);
  } catch {
    const fallback = await fs.readFile(path.join(PUBLIC_DIR, "index.html"));
    // Only application pages receive the SPA fallback as a successful route.
    const appPage = /^\/(?:Dashboard|Home|Insights|Statistics|Lab|login|register|verify-email|forgot-password|reset-password|account)\/?$/i.test(url.pathname);
    res.writeHead(appPage ? 200 : 404, { "content-type": "text/html; charset=utf-8" });
    return res.end(fallback);
  }
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".ico": "image/x-icon",
    ".webmanifest": "application/manifest+json",
  }[ext] || "application/octet-stream";
}

try { await initializeAuth(); }
catch (error) {
  if (authStore) authStore.close();
  if (releaseData) await releaseData();
  throw error;
}

// One writer process per data volume. Serialize whole API transactions so concurrent
// note creates/edits cannot read the same snapshot and discard each other's updates.
let apiQueue = Promise.resolve();

const server = createServer(async (req, res) => {
  securityHeaders(res);
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      if (!apiAllowed(proxy.clientIP(req))) throw httpError(429, "Too many requests");
      if (!["GET", "HEAD"].includes(req.method)) {
        sameOrigin(req, webOrigin(req, publicOrigin, proxy));
        if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw httpError(415, 'JSON content type required');
        // Consume bounded bodies before entering the transaction queue.
        req.notesgymBody = await readBody(req);
      }
      const job = () => handleApi(req, res, url);
      apiQueue = apiQueue.then(job, job);
      await apiQueue;
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) return sendError(res, 404, "Not found");
    return await serveStatic(req, res, url);
  } catch (error) {
    if (!res.headersSent) sendError(res, error.status || 500, error.status ? error.message : "Server error");
    else res.end();
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
const shutdown = () => {
  const timeout = setTimeout(() => process.exit(1), 15000); timeout.unref();
  server.close(async () => {
    await apiQueue;
    await Promise.allSettled([...auth.mailJobs]);
    authStore.close();
    await releaseData();
    process.exit(0);
  });
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
server.listen(PORT, () => {
  console.log(`NotesGym is running on http://localhost:${server.address().port}`);
});
