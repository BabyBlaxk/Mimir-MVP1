import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "mimir.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'founder', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, domain TEXT NOT NULL DEFAULT 'well', project_id TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY, category TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, reason TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, status TEXT NOT NULL DEFAULT 'active', notes TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, action TEXT NOT NULL, domain TEXT NOT NULL, level TEXT NOT NULL, reason TEXT, payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY, action TEXT NOT NULL, domain TEXT NOT NULL, level TEXT NOT NULL, reason TEXT, component TEXT,
  result TEXT, changes TEXT, reversible INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS feature_flags (key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, note TEXT);
CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, label TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mirror_proposals (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, risk TEXT NOT NULL DEFAULT 'low',
  status TEXT NOT NULL DEFAULT 'observation', test_plan TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 0, config TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, credential_id TEXT UNIQUE NOT NULL, public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0, device_name TEXT, created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id TEXT PRIMARY KEY, user_id TEXT, kind TEXT NOT NULL, challenge TEXT NOT NULL, expires_at TEXT NOT NULL
);
`);

const seedFlags = db.prepare("INSERT OR IGNORE INTO feature_flags (key, enabled, note) VALUES (?, ?, ?)");
seedFlags.run("voice", 1, "Browser speech recognition and TTS");
seedFlags.run("ai_chat", 1, "AI conversation in The Well");
seedFlags.run("mirror_proposals", 1, "Founder-reviewed evolution proposals");
seedFlags.run("financial_transfers", 0, "Blocked by The Oath — never autonomous");

const seedSettings = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
seedSettings.run("ai_provider", process.env.AI_PROVIDER || "none");
seedSettings.run("ai_model", process.env.AI_MODEL || "");
seedSettings.run("system_prompt", "You are Mimir, one private intelligence serving a single Founder. Speak with clarity and restraint. You never transfer money. You never weaken The Oath, authentication, authorization, audit logging, or Founder sovereignty.");
seedSettings.run("evolution_level", "E0");
seedSettings.run("app_name", "Mimir");
seedSettings.run("version", "1.1.0-mvp1");

db.prepare("INSERT OR IGNORE INTO versions (id, label, note, created_at) VALUES (?, ?, ?, ?)").run("v1", "MVP 1", "Initial private PWA foundation", new Date().toISOString());

const seedTools = db.prepare("INSERT OR IGNORE INTO tools (id, name, kind, enabled, config, created_at) VALUES (?, ?, ?, ?, ?, ?)");
const now = new Date().toISOString();
seedTools.run("memory", "Memory store", "internal", 1, "{}", now);
seedTools.run("projects", "Forge projects", "internal", 1, "{}", now);
seedTools.run("audit", "Audit log", "internal", 1, "{}", now);
seedTools.run("approvals", "Authorization queue", "internal", 1, "{}", now);

export function getSetting(key, fallback = "") {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}
export function setSetting(key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value));
}
export function founderExists() {
  return Boolean(db.prepare("SELECT id FROM users LIMIT 1").get());
}
