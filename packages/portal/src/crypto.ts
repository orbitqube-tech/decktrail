import { randomBytes, createHash, createHmac, timingSafeEqual } from "node:crypto";

/** A URL-safe random token. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** SHA-256 hex digest. Magic-link tokens are stored only as this hash. */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** HMAC-SHA-256, base64url. */
export function hmac(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input).digest("base64url");
}

/** Constant-time string comparison. */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Sign a payload as `payload.signature`. */
export function sign(secret: string, payload: string): string {
  return `${payload}.${hmac(secret, payload)}`;
}

/** Verify a `payload.signature` string; return the payload if the signature is valid. */
export function verifySigned(secret: string, signed: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx < 0) return null;
  const payload = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  return constantTimeEqual(sig, hmac(secret, payload)) ? payload : null;
}
