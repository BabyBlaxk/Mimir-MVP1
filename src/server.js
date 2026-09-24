import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { db, founderExists, getSetting, setSetting } from "./db.js";
import { chatCompletion, providerStatus } from "./ai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 8080);
const SECRET = process.env.SESSION_SECRET || "dev-only-change-me";
const isProd = process.env.NODE_ENV === "production";

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser(SECRET));
app.use(rateLimit({ windowMs: 60_000, limit: 180, standardHeaders: true, legacyHeaders: false }));

function now() { return new Date().toISOString(); }

function audit({ action, domain = "root", level = "L1", reason = "", component = "api", result = "ok", changes = "", reversible = 1 }) {
  db.prepare(`INSERT INTO audit_logs (id, action, domain, level, reason, component, result, changes, reversible, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(uuid(), action, domain, level, reason, component, result, changes, reversible ? 1 : 0, now());
}

function authRequired(req, res, next) {
  const sid = req.signedCookies.mimir_sid;
  if (!sid) return res.status(401).json({ error: "Authentication required" });
  const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sid);
  if (!session || session.expires_at < now()) {
    res.clearCookie("mimir_sid");
    return res.status(401).json({ error: "Session expired" });
  }
  const user = db.prepare("SELECT id, username, display_name, role FROM users WHERE id = ?").get(session.user_id);
  if (!user) return res.status(401).json({ error: "Unknown user" });
  req.user = user;
  next();
}

function setSession(res, userId) {
  const id = uuid();
  const expires = new Date(Date.now() + 14 * 24 * 3600 * 1000);
  db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(id, userId, now(), expires.toISOString());
  res.cookie("mimir_sid", id, { httpOnly: true, sameSite: "lax", signed: true, secure: isProd, expires, path: "/" });
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: getSetting("app_name", "Mimir"), version: getSetting("version"), time: now(), founderReady: founderExists(), ai: providerStatus(), uptime: process.uptime() });
});

app.get("/api/bootstrap", (req, res) => {
  const sid = req.signedCookies.mimir_sid;
  let user = null;
  if (sid) {
    const session = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sid);
    if (session && session.expires_at >= now()) {
      user = db.prepare("SELECT id, username, display_name, role FROM users WHERE id = ?").get(session.user_id);
    }
  }
  res.json({ needsSetup: !founderExists(), user, flags: db.prepare("SELECT key, enabled, note FROM feature_flags").all(), version: getSetting("version") });
});

app.post("/api/setup", (req, res) => {
  if (founderExists()) return res.status(409).json({ error: "Founder already exists" });
  const { username, password, displayName } = req.body || {};
  if (!username || !password || password.length < 10) return res.status(400).json({ error: "Username and a password of at least 10 characters are required" });
  const id = uuid();
  db.prepare("INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, 'founder', ?)").run(id, username.trim(), bcrypt.hashSync(password, 12), displayName?.trim() || username.trim(), now());
  setSession(res, id);
  audit({ action: "founder.setup", domain: "root", level: "L4", reason: "First-run Founder created", reversible: 0 });
  res.json({ ok: true });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username || "");
  if (!user || !bcrypt.compareSync(password || "", user.password_hash)) {
    audit({ action: "auth.login.fail", domain: "domain", level: "L3", result: "denied" });
    return res.status(401).json({ error: "Invalid credentials" });
  }
  setSession(res, user.id);
  audit({ action: "auth.login", domain: "domain", level: "L3", reason: "Founder login" });
  res.json({ ok: true, user: { id: user.id, username: user.username, display_name: user.display_name, role: user.role } });
});

app.post("/api/logout", authRequired, (req, res) => {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(req.signedCookies.mimir_sid);
  res.clearCookie("mimir_sid");
  audit({ action: "auth.logout", domain: "domain", level: "L0" });
  res.json({ ok: true });
});

app.get("/api/conversations", authRequired, (_req, res) => {
  res.json(db.prepare("SELECT * FROM conversations ORDER BY updated_at DESC").all());
});

app.post("/api/conversations", authRequired, (req, res) => {
  const id = uuid();
  const title = (req.body?.title || "Untitled council").slice(0, 120);
  const domain = req.body?.domain || "well";
  db.prepare("INSERT INTO conversations (id, title, domain, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, title, domain, req.body?.projectId || null, now(), now());
  audit({ action: "conversation.create", domain, level: "L0" });
  res.json({ id, title, domain });
});

app.get("/api/conversations/:id/messages", authRequired, (req, res) => {
  res.json(db.prepare("SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC").all(req.params.id));
});

app.post("/api/chat", authRequired, async (req, res) => {
  const { conversationId, content, domain } = req.body || {};
  if (!content || !String(content).trim()) return res.status(400).json({ error: "Message required" });
  let cid = conversationId;
  if (!cid) {
    cid = uuid();
    db.prepare("INSERT INTO conversations (id, title, domain, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(cid, String(content).slice(0, 48), domain || "well", now(), now());
  }
  db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)").run(uuid(), cid, String(content), now());
  const history = db.prepare("SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at ASC").all(cid).slice(-20);
  const reply = await chatCompletion({ messages: history, domain: domain || "well" });
  db.prepare("INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)").run(uuid(), cid, reply.content, now());
  db.prepare("UPDATE conversations SET updated_at = ?, title = COALESCE(NULLIF(title,''), ?) WHERE id = ?").run(now(), String(content).slice(0, 48), cid);
  audit({ action: "chat.complete", domain: domain || "well", level: "L0", component: "well" });
  res.json({ conversationId: cid, reply: reply.content, provider: reply.provider, model: reply.model });
});

app.get("/api/memories", authRequired, (req, res) => {
  const q = `%${req.query.q || ""}%`;
  res.json(db.prepare("SELECT * FROM memories WHERE title LIKE ? OR content LIKE ? OR category LIKE ? ORDER BY updated_at DESC").all(q, q, q));
});

app.post("/api/memories", authRequired, (req, res) => {
  const { category, title, content, reason } = req.body || {};
  if (!title || !content) return res.status(400).json({ error: "title and content required" });
  const id = uuid();
  db.prepare("INSERT INTO memories (id, category, title, content, reason, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(id, category || "preferences", title, content, reason || "Founder added", now(), now());
  audit({ action: "memory.create", domain: "well", level: "L1", changes: title });
  res.json({ id });
});

app.put("/api/memories/:id", authRequired, (req, res) => {
  const row = db.prepare("SELECT * FROM memories WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE memories SET category=?, title=?, content=?, reason=?, updated_at=? WHERE id=?").run(req.body.category || row.category, req.body.title || row.title, req.body.content || row.content, req.body.reason || row.reason, now(), row.id);
  audit({ action: "memory.update", domain: "well", level: "L2", changes: row.id });
  res.json({ ok: true });
});

app.delete("/api/memories/:id", authRequired, (req, res) => {
  db.prepare("DELETE FROM memories WHERE id = ?").run(req.params.id);
  audit({ action: "memory.delete", domain: "well", level: "L2", reversible: 0 });
  res.json({ ok: true });
});

app.get("/api/projects", authRequired, (_req, res) => {
  res.json(db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all());
});

app.post("/api/projects", authRequired, (req, res) => {
  const { name, description, notes } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  const id = uuid();
  db.prepare("INSERT INTO projects (id, name, description, status, notes, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)").run(id, name, description || "", notes || "", now(), now());
  audit({ action: "project.create", domain: "forge", level: "L1", changes: name });
  res.json({ id });
});

app.put("/api/projects/:id", authRequired, (req, res) => {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE projects SET name=?, description=?, status=?, notes=?, updated_at=? WHERE id=?").run(req.body.name || row.name, req.body.description ?? row.description, req.body.status || row.status, req.body.notes ?? row.notes, now(), row.id);
  audit({ action: "project.update", domain: "forge", level: "L1" });
  res.json({ ok: true });
});

app.get("/api/approvals", authRequired, (_req, res) => {
  res.json(db.prepare("SELECT * FROM approvals ORDER BY created_at DESC").all());
});

app.post("/api/approvals", authRequired, (req, res) => {
  const id = uuid();
  db.prepare(`INSERT INTO approvals (id, action, domain, level, reason, payload, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`).run(id, req.body.action || "unspecified", req.body.domain || "domain", req.body.level || "L2", req.body.reason || "", JSON.stringify(req.body.payload || {}), now());
  audit({ action: "approval.create", domain: req.body.domain || "domain", level: req.body.level || "L2" });
  res.json({ id });
});

app.post("/api/approvals/:id/:decision", authRequired, (req, res) => {
  const decision = req.params.decision;
  if (!["approve", "deny"].includes(decision)) return res.status(400).json({ error: "approve or deny" });
  const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "Not found" });
  db.prepare("UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ?").run(decision === "approve" ? "approved" : "denied", now(), row.id);
  audit({ action: `approval.${decision}`, domain: row.domain, level: "L3", reason: row.action, reversible: decision !== "approve" });
  res.json({ ok: true });
});

app.get("/api/audit", authRequired, (_req, res) => {
  res.json(db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200").all());
});

app.get("/api/root/settings", authRequired, (_req, res) => {
  const settings = Object.fromEntries(db.prepare("SELECT key, value FROM settings").all().map((r) => [r.key, r.value]));
  res.json({
    settings,
    flags: db.prepare("SELECT * FROM feature_flags").all(),
    versions: db.prepare("SELECT * FROM versions ORDER BY created_at DESC").all(),
    tools: db.prepare("SELECT id, name, kind, enabled FROM tools").all(),
    ai: providerStatus(),
    oath: ["Founder sovereignty", "Authentication", "Authorization L0-L4", "Audit logging", "Secret protection", "No autonomous financial transfers", "No silent production self-modification", "Emergency stop belongs to the Founder"],
  });
});

app.post("/api/root/settings", authRequired, (req, res) => {
  for (const key of ["system_prompt", "ai_provider", "ai_model", "evolution_level"]) {
    if (req.body[key] !== undefined) setSetting(key, req.body[key]);
  }
  audit({ action: "settings.update", domain: "root", level: "L3", changes: JSON.stringify(Object.keys(req.body || {})) });
  res.json({ ok: true });
});

app.post("/api/root/flags", authRequired, (req, res) => {
  const { key, enabled } = req.body || {};
  if (!key) return res.status(400).json({ error: "key required" });
  if (key === "financial_transfers" && enabled) return res.status(403).json({ error: "The Oath forbids enabling autonomous financial transfers" });
  db.prepare("UPDATE feature_flags SET enabled = ? WHERE key = ?").run(enabled ? 1 : 0, key);
  audit({ action: "flag.update", domain: "root", level: "L3", changes: `${key}=${enabled}` });
  res.json({ ok: true });
});

app.get("/api/mirror", authRequired, (_req, res) => {
  res.json(db.prepare("SELECT * FROM mirror_proposals ORDER BY updated_at DESC").all());
});

app.post("/api/mirror", authRequired, (req, res) => {
  const id = uuid();
  db.prepare(`INSERT INTO mirror_proposals (id, title, description, risk, status, test_plan, created_at, updated_at) VALUES (?, ?, ?, ?, 'observation', ?, ?, ?)`).run(id, req.body.title || "Untitled proposal", req.body.description || "", req.body.risk || "low", req.body.testPlan || "Manual review in sandbox. No production deploy without Founder L4.", now(), now());
  audit({ action: "mirror.propose", domain: "mirror", level: "L2" });
  res.json({ id });
});

app.post("/api/mirror/:id/status", authRequired, (req, res) => {
  const allowed = ["observation", "development", "sandbox", "testing", "authorized", "rejected"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: "invalid status" });
  if (req.body.status === "authorized") {
    return res.status(403).json({ error: "MVP 1 cannot auto-deploy Mirror changes into production security controls. Record authorization separately." });
  }
  db.prepare("UPDATE mirror_proposals SET status = ?, updated_at = ? WHERE id = ?").run(req.body.status, now(), req.params.id);
  audit({ action: "mirror.status", domain: "mirror", level: "L3", changes: req.body.status });
  res.json({ ok: true });
});

app.get("/api/vault", authRequired, (_req, res) => {
  res.json({ ledgerReady: false, transfersEnabled: false, note: "The Vault holds the secure frame for future finance integrations. Mimir cannot move money in MVP 1.", placeholders: [{ name: "Operating reserve", status: "not connected" }, { name: "Business entities", status: "not connected" }, { name: "Invoices", status: "not connected" }] });
});

app.use(express.static(path.join(__dirname, "..", "public"), { extensions: ["html"] }));
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Mimir listening on ${PORT}`);
});
