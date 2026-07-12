import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.NOTESGYM_DATA_DIR || path.join(__dirname, "data");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const USERS_FILE = path.join(DATA_DIR, "users.json");
const NOTES_FILE = path.join(DATA_DIR, "notes.json");
const PUBLIC_DIR = path.join(__dirname, "dist");

const sessions = new Map();

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

async function ensureDataFiles() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await ensureFile(USERS_FILE, []);
  await ensureFile(NOTES_FILE, []);
  await seedUsersFromEnv();
}

async function ensureFile(file, fallback) {
  try {
    await fs.access(file);
  } catch {
    await writeJson(file, fallback);
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, file);
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
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, status, payload, headers = {}) {
  res.writeHead(status, { ...jsonHeaders, ...headers });
  res.end(JSON.stringify(payload));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function validateNote(input) {
  if (!input || typeof input !== "object") throw new Error("Invalid note");
  if (!String(input.matiere || "").trim()) throw new Error("Subject is required");
  if (!String(input.annee || "").trim()) throw new Error("School year is required");
  if (!String(input.semestre || "").trim()) throw new Error("Semester is required");

  const note = Number(input.note);
  const coefficient = Number(input.coefficient ?? 1);
  if (!Number.isFinite(note) || note < 0) throw new Error("Grade must be a positive number");
  if (!Number.isFinite(coefficient) || coefficient <= 0) throw new Error("Coefficient must be positive");

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
    archived: Boolean(input.archived),
  };
}

async function requireUser(req, res) {
  const user = await getCurrentUser(req);
  if (!user) sendError(res, 401, "Authentication required");
  return user;
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const { email, password } = await readBody(req);
      const users = await readJson(USERS_FILE, []);
      const user = users.find((item) => item.email === String(email || "").toLowerCase());
      if (!user || !verifyPassword(String(password || ""), user)) {
        return sendError(res, 401, "Invalid email or password");
      }

      const token = createSession(user.id);
      return sendJson(res, 200, { user: publicUser(user) }, {
        "set-cookie": `notesgym_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
      });
    }

    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      const token = getCookie(req, "notesgym_session");
      if (token) sessions.delete(token);
      return sendJson(res, 200, { ok: true }, {
        "set-cookie": "notesgym_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      });
    }

    if (url.pathname === "/api/auth/me" && req.method === "GET") {
      const user = await requireUser(req, res);
      if (!user) return;
      return sendJson(res, 200, publicUser(user));
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
    return sendError(res, 500, error.message || "Server error");
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

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/")) {
    return handleApi(req, res, url);
  }
  return serveStatic(req, res, url);
}).listen(PORT, () => {
  console.log(`NotesGym is running on http://localhost:${PORT}`);
});
