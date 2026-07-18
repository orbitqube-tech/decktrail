import type { Config } from "./config.js";

/** Serialize the session cookie with secure, httpOnly, SameSite attributes. */
export function serializeSessionCookie(config: Config, value: string, maxAgeMs: number): string {
  const parts = [
    `${config.cookieName}=${value}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];
  if (config.cookieSecure) parts.push("Secure");
  if (config.cookieDomain) parts.push(`Domain=${config.cookieDomain}`);
  return parts.join("; ");
}

/** Parse a Cookie request header into a name to value map. */
export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const k = pair.slice(0, idx).trim();
    if (!k) continue;
    const raw = pair.slice(idx + 1).trim();
    // decodeURIComponent throws on a malformed escape, and a header is attacker-controlled:
    // `Cookie: dt_session=%` turned every cookie-reading route, including a deck serve, into
    // a 500. An undecodable value is simply not a valid cookie, so keep it raw and let the
    // signature check reject it, which answers 401 as it should.
    try {
      out[k] = decodeURIComponent(raw);
    } catch {
      out[k] = raw;
    }
  }
  return out;
}
