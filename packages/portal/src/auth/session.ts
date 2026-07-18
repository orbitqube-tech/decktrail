import { randomToken, sign, verifySigned } from "../crypto.js";
import type { SessionStore } from "./stores.js";

/** Create a session and return the signed cookie value (a signed session id). */
export async function createSession(
  store: SessionStore,
  secret: string,
  email: string,
  workspace: string,
  ttlMs: number,
  now: number = Date.now(),
): Promise<string> {
  const sid = randomToken(24);
  await store.create({ sid, email, workspace, expiresAt: now + ttlMs, revoked: false });
  return sign(secret, sid);
}

/**
 * Read a session from a cookie value. Returns the identity only if the signature is
 * valid and the stored session is unexpired and not revoked; otherwise null.
 */
export async function readSession(
  store: SessionStore,
  secret: string,
  cookieValue: string | undefined,
  now: number = Date.now(),
): Promise<{ email: string; workspace: string } | null> {
  if (!cookieValue) return null;
  const sid = verifySigned(secret, cookieValue);
  if (!sid) return null;
  const rec = await store.get(sid);
  if (!rec || rec.revoked || rec.expiresAt < now) return null;
  return { email: rec.email, workspace: rec.workspace };
}
