import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { loadConfig, type Config } from "./config.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { DrizzleMagicLinkStore, DrizzleSessionStore, findInvite } from "./db/stores.js";
import { DrizzlePublisher } from "./db/publish.js";
import { DrizzleSettingsStore } from "./db/settings.js";
import { DrizzleEventStore } from "./db/events.js";
import { DrizzleThemeAdmin } from "./db/themes.js";
import { makeResolveContent, makeResolveShare } from "./content.js";
import { buildApp } from "./app.js";
import { buildMagicLinkSender } from "./mailer.js";
import { fixedWindowLimiter } from "./ratelimit.js";
import { makeTurnstileVerifier } from "./turnstile.js";
import { buildTelemetryPayload, sendTelemetry, DECKTRAIL_VERSION } from "./telemetry.js";
import { artifacts, events } from "./db/schema.js";
import { EVENT } from "./analytics.js";
import type { Db } from "./db/client.js";
import { defaultBrandName } from "./defaults.js";
import { randomToken } from "./crypto.js";
import { isSetupComplete, ensureSetupToken, type SettingsStore } from "./settings.js";
import { invites } from "./db/schema.js";

/**
 * Fill any missing boot secret from the settings store, generating and persisting it if
 * absent. This is what lets a fresh `docker compose up` run with no secrets configured:
 * they are generated once and stable across restarts.
 */
async function ensureBootSecrets(settings: SettingsStore): Promise<void> {
  const map: readonly [string, string][] = [
    ["DT_TOKEN_SECRET", "tokenSecret"],
    ["DT_SESSION_SECRET", "sessionSecret"],
    ["DT_ADMIN_TOKEN", "adminToken"],
  ];
  for (const [envKey, settingKey] of map) {
    if (process.env[envKey]) continue;
    let value = await settings.get(settingKey);
    if (!value) {
      value = randomToken(32);
      await settings.set(settingKey, value);
    }
    process.env[envKey] = value;
  }
}

/**
 * While setup is pending, make sure a setup token exists and print the URL that uses it.
 *
 * Printed on every boot, not just the first, because the operator will scroll the log away
 * and restarting to see it again must work. It is only ever printed while setup is actually
 * pending: once complete the token is burned and this says nothing.
 *
 * The log is the right channel precisely because reading it requires being on the box, which
 * is the only available proof that someone is the operator before an admin exists.
 */
async function announceSetupIfPending(settings: SettingsStore, config: Config): Promise<void> {
  if (await isSetupComplete(settings)) return;
  const token = await ensureSetupToken(settings, () => randomToken(24));
  const scheme = config.cookieSecure ? "https" : "http";
  console.log("");
  console.log("  DeckTrail is not set up yet. Open this to finish, and keep it to yourself:");
  console.log(`  ${scheme}://${config.baseHost}/setup?token=${encodeURIComponent(token)}`);
  console.log("");
}

/**
 * Start opt-in anonymous telemetry, if and only if the operator turned it on at setup. It
 * reports an anonymous instance id, the version, and bucketed counts on a slow schedule, and
 * fails silently: telemetry must never affect the running portal.
 */
async function startTelemetry(db: Db, settings: SettingsStore, endpoint: string, intervalMs: number): Promise<void> {
  if ((await settings.get("telemetry_optin")) !== "true") return;

  let instanceId = await settings.get("telemetry_instance_id");
  if (!instanceId) {
    instanceId = randomToken(16);
    await settings.set("telemetry_instance_id", instanceId);
  }

  const ping = async (): Promise<void> => {
    const decks = (await db.select().from(artifacts)).length;
    const views = (await db.select().from(events).where(eq(events.type, EVENT.deckOpen))).length;
    await sendTelemetry(endpoint, buildTelemetryPayload({ instanceId, version: DECKTRAIL_VERSION, decks, views }));
  };

  void ping().catch(() => {});
  const timer = setInterval(() => void ping().catch(() => {}), intervalMs);
  timer.unref();
  console.log("[telemetry] anonymous usage reporting is on (opted in at setup)");
}

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const { db } = createDb(databaseUrl);
  await runMigrations(db, fileURLToPath(new URL("../drizzle", import.meta.url)));

  const settings = new DrizzleSettingsStore(db);
  await ensureBootSecrets(settings);

  const config = loadConfig();

  await announceSetupIfPending(settings, config);

  // Serve the owner console when its build is present. DT_CONSOLE_DIR overrides the default
  // (the console package's dist, resolved relative to this compiled server).
  const consoleDirCandidate =
    process.env["DT_CONSOLE_DIR"] ?? fileURLToPath(new URL("../../console/dist", import.meta.url));
  const consoleDir = existsSync(consoleDirCandidate) ? consoleDirCandidate : undefined;

  const brand = (await settings.get("brand_name")) ?? defaultBrandName;
  const sendMagicLink = await buildMagicLinkSender(settings, {
    brand,
    ttlMinutes: Math.round(config.magicLinkTtlMs / 60000),
  });

  const app = buildApp({
    config,
    magicLinks: new DrizzleMagicLinkStore(db),
    sessions: new DrizzleSessionStore(db),
    findInvite: (email) => findInvite(db, email),
    sendMagicLink,
    ipLimiter: fixedWindowLimiter(config.rateIpMax, config.rateIpWindowMs),
    emailLimiter: fixedWindowLimiter(1, config.emailCooldownMs),
    eventLimiter: fixedWindowLimiter(config.rateEventMax, config.rateEventWindowMs),
    verifyTurnstile: config.turnstileSecret ? makeTurnstileVerifier(config.turnstileSecret) : undefined,
    events: new DrizzleEventStore(db),
    themes: new DrizzleThemeAdmin(db),
    consoleDir,
    resolveContent: makeResolveContent(db),
    resolveShare: makeResolveShare(db),
    publisher: new DrizzlePublisher(db),
    settings,
    onSetupComplete: async (adminEmail) => {
      await db.insert(invites).values({ id: `inv_${randomToken(9)}`, workspace: "default", email: adminEmail });
    },
  });

  await app.listen({ port: config.port, host: "0.0.0.0" });
  console.log(`DeckTrail portal listening on port ${config.port}`);

  await startTelemetry(db, settings, config.telemetryEndpoint, config.telemetryIntervalMs);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
