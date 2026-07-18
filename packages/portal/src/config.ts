import { z } from "zod";

/**
 * Values that have ever appeared as a placeholder in this repository's .env.example.
 *
 * A secret published in a public repository is not a secret. .env.example once shipped
 * "change-me-to-an-admin-token-for-publishing", which is 41 characters and so passed a length
 * check, while the README said to copy the file and promised the secrets would be generated.
 * They were not: the server only generates a secret when the variable is UNSET, so every
 * install that followed the documented steps ran with an admin token that anyone could read
 * off the internet. Holding that token means minting a share to yourself and reading any deck
 * on the portal.
 *
 * Rejecting them by name is belt and braces on top of shipping the file with empty values: if
 * one ever comes back, by a copied file or an old tutorial, the portal refuses to start rather
 * than running wide open and looking fine.
 */
const PUBLISHED_PLACEHOLDERS = new Set([
  "change-me",
  "change-me-to-a-long-random-string",
  "change-me-to-a-different-long-random-string",
  "change-me-to-an-admin-token-for-publishing",
]);

const notAPlaceholder = (label: string) =>
  z.string().refine((v) => !PUBLISHED_PLACEHOLDERS.has(v), {
    message:
      `${label} is set to a placeholder that is published in DeckTrail's own .env.example, so it is ` +
      `not a secret. Leave it empty and the portal will generate one on first boot, or set a real ` +
      `random value.`,
  });

/**
 * Portal configuration. One authoritative home, read from the environment. Secrets have
 * no default, so a missing secret fails closed at startup rather than running insecure.
 */
const ConfigSchema = z.object({
  databaseUrl: z.string(),
  tokenSecret: notAPlaceholder("DT_TOKEN_SECRET").pipe(z.string().min(16)),
  sessionSecret: notAPlaceholder("DT_SESSION_SECRET").pipe(z.string().min(16)),
  baseHost: z.string().default("localhost"),
  cookieName: z.string().default("dt_session"),
  cookieSecure: z.boolean().default(true),
  cookieDomain: z.string().optional(),
  adminToken: notAPlaceholder("DT_ADMIN_TOKEN").pipe(z.string().min(16)).optional(),
  magicLinkTtlMs: z.number().int().default(30 * 60 * 1000),
  sessionTtlMs: z.number().int().default(7 * 24 * 60 * 60 * 1000),
  port: z.number().int().default(3000),
  // Abuse controls on the magic-link request endpoint.
  turnstileSecret: z.string().optional(),
  turnstileSitekey: z.string().optional(),
  /** Max magic-link requests per IP per window. */
  rateIpMax: z.number().int().default(10),
  /** The per-IP rate window, in milliseconds. */
  rateIpWindowMs: z.number().int().default(60 * 1000),
  /** Minimum gap between links sent to one email, in milliseconds (anti email-bombing). */
  emailCooldownMs: z.number().int().default(60 * 1000),
  /** Max beacon events accepted per IP per window. Generous, to allow real navigation. */
  rateEventMax: z.number().int().default(600),
  /** The beacon-ingest rate window, in milliseconds. */
  rateEventWindowMs: z.number().int().default(60 * 1000),
  /**
   * Whether to believe the CF-Connecting-IP header. **Off by default, and that is deliberate.**
   *
   * A header is written by whoever sends the request. Trusting it unconditionally meant every
   * per-IP control was one header away from nothing: rotating CF-Connecting-IP per request
   * sails past a 10-per-minute limit forever, and it also writes a chosen IP into the owner's
   * audit log, which is the record the product sells.
   *
   * Only turn this on when the portal genuinely sits behind Cloudflare, or another proxy that
   * sets this header and strips a client-supplied one. If the portal is reachable directly on
   * its port, leave it off: the socket address is the only thing that cannot be claimed.
   */
  trustProxyHeader: z.boolean().default(false),
  /** Where opt-in anonymous telemetry reports to. Only used when the operator opted in. */
  telemetryEndpoint: z.string().default("https://decktrail.com/telemetry"),
  /** How often an opted-in instance reports. Weekly by default. */
  telemetryIntervalMs: z.number().int().default(7 * 24 * 60 * 60 * 1000),
});

export type Config = z.infer<typeof ConfigSchema>;

function num(v: string | undefined): number | undefined {
  return v === undefined ? undefined : Number(v);
}

/** Load and validate config from environment variables. Throws if a secret is missing. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse({
    databaseUrl: env["DATABASE_URL"],
    tokenSecret: env["DT_TOKEN_SECRET"],
    sessionSecret: env["DT_SESSION_SECRET"],
    baseHost: env["DT_BASE_HOST"],
    cookieName: env["DT_COOKIE_NAME"],
    cookieSecure: env["DT_COOKIE_SECURE"] === undefined ? undefined : env["DT_COOKIE_SECURE"] !== "false",
    cookieDomain: env["DT_COOKIE_DOMAIN"],
    adminToken: env["DT_ADMIN_TOKEN"],
    magicLinkTtlMs: num(env["DT_MAGIC_TTL_MS"]),
    sessionTtlMs: num(env["DT_SESSION_TTL_MS"]),
    port: num(env["PORT"]),
    turnstileSecret: env["DT_TURNSTILE_SECRET"],
    turnstileSitekey: env["DT_TURNSTILE_SITEKEY"],
    rateIpMax: num(env["DT_RATELIMIT_IP_MAX"]),
    rateIpWindowMs: num(env["DT_RATELIMIT_IP_WINDOW_MS"]),
    emailCooldownMs: num(env["DT_EMAIL_COOLDOWN_MS"]),
    rateEventMax: num(env["DT_RATELIMIT_EVENT_MAX"]),
    rateEventWindowMs: num(env["DT_RATELIMIT_EVENT_WINDOW_MS"]),
    // Opt in explicitly. Anything other than "true" leaves the header ignored, so a typo
    // fails closed rather than quietly trusting whatever a client sends.
    trustProxyHeader: env["DT_TRUST_PROXY_HEADER"] === "true" ? true : undefined,
    telemetryEndpoint: env["DT_TELEMETRY_ENDPOINT"],
    telemetryIntervalMs: num(env["DT_TELEMETRY_INTERVAL_MS"]),
  });
}
