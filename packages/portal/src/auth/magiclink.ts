import { randomToken, sha256 } from "../crypto.js";
import type { MagicLinkStore } from "./stores.js";

/**
 * Issue a magic link. A random token goes into the emailed link; only its SHA-256 hash
 * is stored, so a database leak hands out no working links.
 */
export async function issueMagicLink(
  store: MagicLinkStore,
  email: string,
  workspace: string,
  ttlMs: number,
  now: number = Date.now(),
): Promise<{ token: string }> {
  const token = randomToken(32);
  await store.save({ tokenHash: sha256(token), email, workspace, expiresAt: now + ttlMs });
  return { token };
}

/**
 * Claim a magic link. Single use and atomic: a valid token is consumed on first claim,
 * so it cannot be replayed. Returns the identity, or null for any invalid, expired, or
 * already-used token (the caller responds the same way in every failing case).
 */
export async function claimMagicLink(
  store: MagicLinkStore,
  token: string,
  now: number = Date.now(),
): Promise<{ email: string; workspace: string } | null> {
  const rec = await store.claim(sha256(token), now);
  return rec ? { email: rec.email, workspace: rec.workspace } : null;
}
