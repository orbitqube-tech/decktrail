import { describe, it, expect } from "vitest";
import { buildApp } from "./app.js";
import { InMemoryMagicLinkStore, InMemorySessionStore } from "./auth/stores.js";
import { InMemorySettingsStore, ensureSetupToken, setupTokenValid, SETUP_TOKEN_KEY } from "./settings.js";
import type { Config } from "./config.js";

const config: Config = {
  databaseUrl: "postgres://unused",
  tokenSecret: "0123456789abcdef0",
  sessionSecret: "abcdef0123456789a",
  baseHost: "localhost",
  cookieName: "dt_session",
  cookieSecure: false,
  magicLinkTtlMs: 60_000,
  sessionTtlMs: 60_000,
  port: 3000,
};

const TOKEN = "setup-token-for-tests-0123456789";

async function harness() {
  const settings = new InMemorySettingsStore();
  await settings.set(SETUP_TOKEN_KEY, TOKEN); // the server does this at boot and logs the URL
  const invited: string[] = [];
  const app = buildApp({
    config,
    magicLinks: new InMemoryMagicLinkStore(),
    sessions: new InMemorySessionStore(),
    findInvite: async () => ({ workspace: "default" }),
    sendMagicLink: async () => {},
    resolveContent: async () => null,
    settings,
    onSetupComplete: async (email) => {
      invited.push(email);
    },
  });
  return { app, settings, invited };
}

describe("first-run setup wizard", () => {
  it("serves the setup page to whoever holds the token", async () => {
    const { app } = await harness();
    const res = await app.inject({ method: "GET", url: `/setup?token=${TOKEN}` });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("Welcome to DeckTrail");
  });

  it("redirects other routes to /setup until complete", async () => {
    const { app } = await harness();
    const res = await app.inject({ method: "GET", url: "/d/abc" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/setup");
  });

  it("completes setup, invites the admin, and stops redirecting", async () => {
    const { app, settings, invited } = await harness();
    const done = await app.inject({
      method: "POST",
      url: "/setup",
      payload: { setupToken: TOKEN, adminEmail: "admin@decktrail.orbitqube", smtp_host: "smtp.example.com" },
    });
    expect(done.statusCode).toBe(201);
    expect(await settings.get("setup_complete")).toBe("true");
    expect(await settings.get("admin_email")).toBe("admin@decktrail.orbitqube");
    expect(await settings.get("smtp_host")).toBe("smtp.example.com");
    expect(invited).toContain("admin@decktrail.orbitqube");

    const after = await app.inject({ method: "GET", url: "/d/abc" });
    expect(after.statusCode).toBe(401); // reaches the handler now, no longer redirected
  });

  it("rejects setup without an admin email", async () => {
    const { app } = await harness();
    const res = await app.inject({ method: "POST", url: "/setup", payload: { setupToken: TOKEN } });
    expect(res.statusCode).toBe(400);
  });

  it("refuses a second setup", async () => {
    const { app } = await harness();
    await app.inject({ method: "POST", url: "/setup", payload: { setupToken: TOKEN, adminEmail: "admin@decktrail.orbitqube" } });
    const res = await app.inject({
      method: "POST",
      url: "/setup",
      payload: { setupToken: TOKEN, adminEmail: "other@decktrail.orbitqube" },
    });
    expect(res.statusCode).toBe(409);
  });
});

/**
 * Setup decides who the administrator is, and it cannot ask who you are, because there is
 * nobody to ask yet. Left open, whoever reaches the portal first becomes its admin.
 *
 * On a genuinely fresh install that is only squatting: the portal is empty, and the operator
 * notices at once because they cannot set up. The case that bites is setup REOPENING on a
 * portal that already holds decks, because `setup_complete` is a database row rather than a
 * fuse. A restore that misses the settings table, or a botched migration, would otherwise
 * hand a stranger an admin session and with it /admin/events.csv: every recipient's address,
 * IP and reading habits. Demonstrated against a running portal that still held real data.
 */
describe("setup is locked to whoever can read the log", () => {
  it("refuses to show the form without the token", async () => {
    const { app } = await harness();
    const res = await app.inject({ method: "GET", url: "/setup" });
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain("docker compose logs"); // tells the operator where to look
    expect(res.body).not.toContain(TOKEN); // and does not leak it
  });

  it("refuses to show the form with a wrong token", async () => {
    const { app } = await harness();
    expect((await app.inject({ method: "GET", url: "/setup?token=guess" })).statusCode).toBe(403);
  });

  it("refuses to COMPLETE setup without the token, which is the real gate", async () => {
    const { app, settings, invited } = await harness();
    const res = await app.inject({ method: "POST", url: "/setup", payload: { adminEmail: "attacker@decktrail.orbitqube" } });
    expect(res.statusCode).toBe(403);
    expect(await settings.get("admin_email")).toBeNull();
    expect(await settings.get("setup_complete")).toBeNull();
    expect(invited).toEqual([]);
  });

  it("refuses to complete setup with a wrong token", async () => {
    const { app, settings } = await harness();
    const res = await app.inject({
      method: "POST",
      url: "/setup",
      payload: { setupToken: "wrong", adminEmail: "attacker@decktrail.orbitqube" },
    });
    expect(res.statusCode).toBe(403);
    expect(await settings.get("admin_email")).toBeNull();
  });

  it("burns the token when setup completes, so an old log is worthless", async () => {
    const { app, settings } = await harness();
    await app.inject({ method: "POST", url: "/setup", payload: { setupToken: TOKEN, adminEmail: "admin@decktrail.orbitqube" } });
    expect(await settings.get(SETUP_TOKEN_KEY)).toBe("");
    expect(await setupTokenValid(settings, TOKEN)).toBe(false);
  });

  it("closes the reopen window: a lost setup_complete needs a fresh token, not the old one", async () => {
    const { app, settings } = await harness();
    await app.inject({ method: "POST", url: "/setup", payload: { setupToken: TOKEN, adminEmail: "admin@decktrail.orbitqube" } });

    // Simulate the dangerous case: the settings row is lost, the decks are not.
    await settings.set("setup_complete", "");

    // The token from the original log must not work a second time.
    const replay = await app.inject({
      method: "POST",
      url: "/setup",
      payload: { setupToken: TOKEN, adminEmail: "attacker@decktrail.orbitqube" },
    });
    expect(replay.statusCode).toBe(403);
    expect(await settings.get("admin_email")).toBe("admin@decktrail.orbitqube"); // unchanged
  });
});

describe("the setup token itself", () => {
  it("is generated once and stays stable across restarts", async () => {
    const settings = new InMemorySettingsStore();
    let calls = 0;
    const gen = () => `tok${++calls}`;
    expect(await ensureSetupToken(settings, gen)).toBe("tok1");
    expect(await ensureSetupToken(settings, gen)).toBe("tok1"); // a restart must print the same one
    expect(calls).toBe(1);
  });

  it("validates only an exact match", async () => {
    const settings = new InMemorySettingsStore();
    const t = await ensureSetupToken(settings, () => "abc123");
    expect(await setupTokenValid(settings, t)).toBe(true);
    expect(await setupTokenValid(settings, "abc124")).toBe(false);
    expect(await setupTokenValid(settings, "abc12")).toBe(false); // length mismatch must not throw
    expect(await setupTokenValid(settings, undefined)).toBe(false);
    expect(await setupTokenValid(settings, "")).toBe(false);
  });

  it("is invalid when there is no pending token at all", async () => {
    const settings = new InMemorySettingsStore();
    expect(await setupTokenValid(settings, "anything")).toBe(false);
  });
});
