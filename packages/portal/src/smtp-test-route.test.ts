import { describe, it, expect } from "vitest";
import { createServer, type Server } from "node:net";
import { buildApp } from "./app.js";
import { InMemoryMagicLinkStore, InMemorySessionStore } from "./auth/stores.js";
import { InMemorySettingsStore, SETUP_TOKEN_KEY } from "./settings.js";
import type { Config } from "./config.js";

/**
 * Tests for POST /setup/test-smtp: the first-run wizard's "Send a test message" control.
 * It must attempt a genuine SMTP connection with the values typed into the form (not the
 * settings store, which is empty at first run) and report the real outcome, never falling
 * back to the logging path the way the real magic-link sender does when SMTP is unconfigured.
 */

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

const TOKEN = "setup-token-for-smtp-test-0123456789";

async function harness() {
  const settings = new InMemorySettingsStore();
  await settings.set(SETUP_TOKEN_KEY, TOKEN);
  const app = buildApp({
    config,
    magicLinks: new InMemoryMagicLinkStore(),
    sessions: new InMemorySessionStore(),
    findInvite: async () => ({ workspace: "default" }),
    sendMagicLink: async () => {},
    resolveContent: async () => null,
    settings,
  });
  return { app, settings };
}

/** A TCP port on 127.0.0.1 that is guaranteed to have nothing listening on it: bound once
 *  to claim a free ephemeral port, then closed immediately, so a connection attempt there
 *  fails fast with ECONNREFUSED rather than waiting out a timeout. */
async function unusedLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv: Server = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

describe("POST /setup/test-smtp", () => {
  it("rejects a request with no setup token", async () => {
    const { app } = await harness();
    const res = await app.inject({
      method: "POST",
      url: "/setup/test-smtp",
      payload: { adminEmail: "admin@decktrail.orbitqube", smtp_host: "smtp.example.com" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("rejects a request with no SMTP host rather than pretending success", async () => {
    const { app } = await harness();
    const res = await app.inject({
      method: "POST",
      url: "/setup/test-smtp",
      payload: { setupToken: TOKEN, adminEmail: "admin@decktrail.orbitqube" },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  it("rejects a request with no admin email to send the test message to", async () => {
    const { app } = await harness();
    const res = await app.inject({
      method: "POST",
      url: "/setup/test-smtp",
      payload: { setupToken: TOKEN, smtp_host: "smtp.example.com" },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
  });

  it("genuinely attempts the connection and reports failure when it cannot connect, without falling back to the logging path", async () => {
    const { app } = await harness();
    const port = await unusedLoopbackPort();
    const res = await app.inject({
      method: "POST",
      url: "/setup/test-smtp",
      payload: {
        setupToken: TOKEN,
        adminEmail: "admin@decktrail.orbitqube",
        smtp_host: "127.0.0.1",
        smtp_port: String(port),
        smtp_user: "test@example.com",
        smtp_pass: "supersecret123",
      },
    });
    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
    // The password must never come back, in the value, in the error, anywhere in the response.
    expect(res.body).not.toContain("supersecret123");
  }, 15_000);

  it("refuses to run once setup is already complete", async () => {
    const { app, settings } = await harness();
    await app.inject({
      method: "POST",
      url: "/setup",
      payload: { setupToken: TOKEN, adminEmail: "admin@decktrail.orbitqube" },
    });
    expect(await settings.get("setup_complete")).toBe("true");
    const res = await app.inject({
      method: "POST",
      url: "/setup/test-smtp",
      payload: { setupToken: TOKEN, adminEmail: "admin@decktrail.orbitqube", smtp_host: "smtp.example.com" },
    });
    expect(res.statusCode).toBe(409);
  });
});
