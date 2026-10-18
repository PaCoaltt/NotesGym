import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

import { reconcileAccountSimulationPlans, patchAccountSimulationPlans, migrateAccountSimulationPlans } from "./src/lib/analytics/accountSimulationSettings.js";
import { httpError, proxyPolicy, rateLimiter, readLimitedBody, sameOrigin, securityHeaders } from "./integration/security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.NOTESGYM_DATA_DIR || path.join(__dirname, "data");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const USERS_FILE = path.join(DATA_DIR, "users.json");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const SIMULATION_SETTINGS_FILE = path.join(DATA_DIR, "simulation-settings.json");
const PUBLIC_DIR = path.join(__dirname, "dist");

const sessions = new Map();
const secureCookie = process.env.NOTESGYM_SECURE_COOKIES === "true" || process.env.NOTESGYM_PUBLIC_URL?.startsWith("https://");
const cookieFlags = `HttpOnly; SameSite=Lax; Path=/${secureCookie ? "; Secure" : ""}`;
const loginAllowed = rateLimiter({ limit: 20, windowMs: 600000 });
const apiAllowed = rateLimiter({ limit: 600 });
const proxy = proxyPolicy();

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await ensureFile(USERS_FILE, []);
  await ensureFile(NOTES_FILE, []);
  await ensureFile(SIMULATION_SETTINGS_FILE, []);
  await seedUsersFromEnv();
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
    if (error.code === "ENOENT") return fallback;
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

function parseSeedUsers() {
  const raw = process.env.NOTESGYM_USERS || "";
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator === -1) return null;
      return {
        email: entry.slice(0, separator).trim().toLowerCase(),
        password: entry.slice(separator + 1),
      };
    })
    .filter((user) => user?.email && user.password);
}

async function seedUsersFromEnv() {
  const seeded = parseSeedUsers();
  if (seeded.length === 0) return;

  const users = await readJson(USERS_FILE, []);
  let changed = false;

  for (const seed of seeded) {
    const existing = users.find((user) => user.email === seed.email);
    if (existing) continue;
    users.push(createUser(seed.email, seed.password));
    changed = true;
  }

  if (changed) await writeJson(USERS_FILE, users);
}

function createUser(email, password) {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: crypto.randomUUID(),
    email,
    role: "user",
    passwordHash: hashPassword(password, salt),
    salt,
    created_date: new Date().toISOString(),
  };
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

function verifyPassword(password, user) {
  const expected = Buffer.from(user.passwordHash, "hex");
  const actual = Buffer.from(hashPassword(password, user.salt), "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role || "user",
    created_date: user.created_date,
  };
}

function createSession(userId) {
  for (const [key, session] of sessions) if (session.expiresAt < Date.now()) sessions.delete(key);
  if (sessions.size >= 10000) throw httpError(503, "Too many active sessions");
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, {
    userId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return token;
}

function getCookie(req, name) {
  const header = req.headers.cookie || "";
  const cookies = Object.fromEntries(
    header.split(";").map((part) => {
      const [key, ...value] = part.trim().split("=");
      return [key, decodeURIComponent(value.join("=") || "")];
    })
  );
  return cookies[name];
}

async function getCurrentUser(req) {
  const token = getCookie(req, "notesgym_session");
  if (!token) return null;

  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }

  const users = await readJson(USERS_FILE, []);
  const user = users.find((item) => item.id === session.userId);
  return user || null;
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
    const records = JSON.parse(await fs.readFile(SIMULATION_SETTINGS_FILE, "utf8"));
    if (!Array.isArray(records)) throw new Error("Invalid simulation settings store");
    const index = records.findIndex(record => record.user_id === user.id);
    const previous = index < 0 ? { user_id: user.id, plans: {}, revision: 0 } : records[index];
    const notes = (await readJson(NOTES_FILE, [])).filter(note => note.created_by === user.email);
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
      const ok = !chatgpt || chatgpt.healthy();
      return sendJson(res, ok ? 200 : 503, { ok });
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      if (!loginAllowed(proxy.clientIP(req))) return sendError(res, 429, "Too many login attempts");
      const { email, password } = await readBody(req);
      const users = await readJson(USERS_FILE, []);
      const user = users.find((item) => item.email === String(email || "").toLowerCase());
      if (!user || !verifyPassword(String(password || ""), user)) {
        return sendError(res, 401, "Invalid email or password");
      }

      const token = createSession(user.id);
      return sendJson(res, 200, { user: publicUser(user) }, {
        "set-cookie": `notesgym_session=${encodeURIComponent(token)}; ${cookieFlags}; Max-Age=${SESSION_TTL_MS / 1000}`,
      });
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      const token = getCookie(req, "notesgym_session");
      if (token) sessions.delete(token);
      return sendJson(res, 200, { ok: true }, {
        "set-cookie": `notesgym_session=; ${cookieFlags}; Max-Age=0`,
      });
    }

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      const user = await requireUser(req, res);
      if (!user) return;
      return sendJson(res, 200, publicUser(user));
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
      const notes = await readJson(NOTES_FILE, []);
      const ownNotes = notes
        .filter((note) => note.created_by === user.email)
        .sort((a, b) => String(b.created_date || "").localeCompare(String(a.created_date || "")));
      return sendJson(res, 200, ownNotes);
    }

    if (url.pathname === "/api/notes" && req.method === "POST") {
      const user = await requireUser(req, res);
      if (!user) return;
      const notes = await readJson(NOTES_FILE, []);
      const now = new Date().toISOString();
      const note = {
        id: crypto.randomUUID(),
        ...validateNote(await readBody(req)),
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

      const notes = await readJson(NOTES_FILE, []);
      const updatedAt = new Date().toISOString();
      let updatedCount = 0;
      for (const note of notes) {
        if (note.created_by === user.email && note.matiere === subject) {
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

      const notes = await readJson(NOTES_FILE, []);
      const updatedAt = new Date().toISOString();
      let archivedCount = 0;

      for (const note of notes) {
        if (note.created_by === user.email && years.has(note.annee) && !note.archived) {
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
      const notes = await readJson(NOTES_FILE, []);
      const id = decodeURIComponent(noteMatch[1]);
      const index = notes.findIndex((note) => note.id === id && note.created_by === user.email);
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
      const notes = await readJson(NOTES_FILE, []);
      const id = decodeURIComponent(noteMatch[1]);
      const kept = notes.filter((note) => !(note.id === id && note.created_by === user.email));
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
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
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

await ensureDataFiles();

const chatgpt = process.env.NOTESGYM_MCP_ENABLED === "true"
  ? await (await import("./integration/chatgpt.js")).createChatGptIntegration({
    getCurrentUser, readUsers: () => readJson(USERS_FILE, []), readNotes: () => readJson(NOTES_FILE, []),
  }) : null;

// One writer process per data volume. Serialize whole API transactions so concurrent
// note creates/edits cannot read the same snapshot and discard each other's updates.
let apiQueue = Promise.resolve();

const server = createServer(async (req, res) => {
  securityHeaders(res);
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (chatgpt && await chatgpt.handle(req, res, url)) return;
    if (url.pathname.startsWith("/api/")) {
      if (!apiAllowed(proxy.clientIP(req))) throw httpError(429, "Too many requests");
      if (!["GET", "HEAD"].includes(req.method)) {
        sameOrigin(req, process.env.NOTESGYM_PUBLIC_URL || `http://${req.headers.host}`);
        // Consume bounded bodies before entering the transaction queue.
        req.notesgymBody = await readBody(req);
      }
      const job = () => handleApi(req, res, url);
      apiQueue = apiQueue.then(job, job);
      await apiQueue;
      return;
    }
    if (url.pathname === "/chatgpt") {
      res.writeHead(503, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end('<!doctype html><html lang="fr"><meta charset="utf-8"><title>NotesGym ChatGPT</title><h1>Connexions ChatGPT</h1><p>Cette intégration de test est désactivée sur cette instance.</p><a href="/">Retour à NotesGym</a></html>');
    }
    if (url.pathname === "/mcp" || url.pathname.startsWith("/oauth") || url.pathname.startsWith("/chatgpt") || url.pathname.startsWith("/.well-known/oauth-")) return sendError(res, 404, "Integration unavailable");
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
  server.close(() => { chatgpt?.close(); process.exit(0); });
};
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
server.listen(PORT, () => {
  console.log(`NotesGym is running on http://localhost:${server.address().port}`);
});
