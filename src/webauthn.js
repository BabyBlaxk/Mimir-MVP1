import { v4 as uuid } from "uuid";
import { db } from "./db.js";

const RP_ID = process.env.RP_ID || "localhost";
const RP_NAME = process.env.RP_NAME || "Mimir";
const ORIGIN = process.env.APP_ORIGIN || "http://localhost:8080";

function now() { return new Date().toISOString(); }
function isoLater(ms) { return new Date(Date.now() + ms).toISOString(); }

export function passkeyCount(userId) {
  return db.prepare("SELECT COUNT(*) AS n FROM passkeys WHERE user_id = ?").get(userId)?.n || 0;
}

export function listPasskeys(userId) {
  return db.prepare("SELECT id, device_name, created_at FROM passkeys WHERE user_id = ? ORDER BY created_at DESC").all(userId);
}

export function storeChallenge({ userId = null, kind, challenge }) {
  db.prepare("DELETE FROM webauthn_challenges WHERE expires_at < ?").run(now());
  const id = uuid();
  db.prepare("INSERT INTO webauthn_challenges (id, user_id, kind, challenge, expires_at) VALUES (?, ?, ?, ?, ?)").run(id, userId, kind, challenge, isoLater(5 * 60_000));
  return id;
}

export function takeChallenge(kind, userId = null) {
  const row = userId
    ? db.prepare("SELECT * FROM webauthn_challenges WHERE kind = ? AND user_id = ? AND expires_at >= ? ORDER BY expires_at DESC LIMIT 1").get(kind, userId, now())
    : db.prepare("SELECT * FROM webauthn_challenges WHERE kind = ? AND expires_at >= ? ORDER BY expires_at DESC LIMIT 1").get(kind, now());
  if (row) db.prepare("DELETE FROM webauthn_challenges WHERE id = ?").run(row.id);
  return row;
}

export async function registrationOptions(user) {
  const { generateRegistrationOptions } = await import("@simplewebauthn/server");
  const existing = db.prepare("SELECT credential_id FROM passkeys WHERE user_id = ?").all(user.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME, rpID: RP_ID, userName: user.username, userDisplayName: user.display_name,
    userID: new TextEncoder().encode(user.id), attestationType: "none",
    excludeCredentials: existing.map((c) => ({ id: c.credential_id })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  storeChallenge({ userId: user.id, kind: "register", challenge: options.challenge });
  return options;
}

export async function verifyRegistration(user, response) {
  const { verifyRegistrationResponse } = await import("@simplewebauthn/server");
  const ch = takeChallenge("register", user.id);
  if (!ch) throw new Error("Registration challenge expired");
  const verification = await verifyRegistrationResponse({ response, expectedChallenge: ch.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID });
  if (!verification.verified || !verification.registrationInfo) throw new Error("Passkey verification failed");
  const info = verification.registrationInfo;
  const credentialID = Buffer.from(info.credential.id).toString("base64url");
  const publicKey = Buffer.from(info.credential.publicKey).toString("base64");
  db.prepare("INSERT INTO passkeys (id, user_id, credential_id, public_key, counter, device_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(uuid(), user.id, credentialID, publicKey, info.credential.counter || 0, "Founder device", now());
  return { ok: true };
}

export async function authenticationOptions() {
  const { generateAuthenticationOptions } = await import("@simplewebauthn/server");
  const allow = db.prepare("SELECT credential_id FROM passkeys").all();
  const options = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: "preferred", allowCredentials: allow.map((c) => ({ id: c.credential_id })) });
  storeChallenge({ kind: "login", challenge: options.challenge });
  return options;
}

export async function verifyAuthentication(response) {
  const { verifyAuthenticationResponse } = await import("@simplewebauthn/server");
  const ch = takeChallenge("login");
  if (!ch) throw new Error("Login challenge expired");
  const row = db.prepare("SELECT * FROM passkeys WHERE credential_id = ?").get(response.id);
  if (!row) throw new Error("Unknown passkey");
  const verification = await verifyAuthenticationResponse({
    response, expectedChallenge: ch.challenge, expectedOrigin: ORIGIN, expectedRPID: RP_ID,
    credential: { id: row.credential_id, publicKey: Buffer.from(row.public_key, "base64"), counter: row.counter },
  });
  if (!verification.verified) throw new Error("Passkey assertion failed");
  db.prepare("UPDATE passkeys SET counter = ? WHERE id = ?").run(verification.authenticationInfo?.newCounter ?? row.counter, row.id);
  return db.prepare("SELECT id, username, display_name, role FROM users WHERE id = ?").get(row.user_id);
}

export const webauthnMeta = { rpID: RP_ID, origin: ORIGIN };
