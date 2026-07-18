import { describe, it, expect } from "vitest";
import { buildApp } from "./app.js";
import { InMemoryMagicLinkStore, InMemorySessionStore } from "./auth/stores.js";
import { InMemorySettingsStore } from "./settings.js";
import { InMemoryEventStore, EVENT } from "./analytics.js";
import { InMemoryThemeAdmin } from "./themes.js";
import { fixedWindowLimiter } from "./ratelimit.js";
import type { Config } from "./config.js";

const config: Config = {
  databaseUrl: "postgres://unused",
  tokenSecret: "0123456789abcdef0",
  sessionSecret: "abcdef0123456789a",
  baseHost: "localhost",
  cookieName: "dt_session",
  cookieSecure: false,
  adminToken: "admin-token-0123456789",
  magicLinkTtlMs: 60_000,
  sessionTtlMs: 60_000,
  port: 3000,
  rateIpMax: 10,
  rateIpWindowMs: 60_000,
  emailCooldownMs: 60_000,
  rateEventMax: 600,
  rateEventWindowMs: 60_000,
};

function harness() {
  const magicLinks = new InMemoryMagicLinkStore();
  const sessions = new InMemorySessionStore();
  const state = { sentUrl: "", published: [] as unknown[], shared: [] as unknown[] };
  const app = buildApp({
    config,
    magicLinks,
    sessions,
    findInvite: async () => ({ workspace: "default" }),
    sendMagicLink: async (_email, url) => {
      state.sentUrl = url;
    },
    resolveContent: async (shareId, viewer) =>
      shareId === "abc"
        ? { html: `<!doctype html><title>ok</title>${viewer.email}`, artifactId: "art_1", versionId: "ver_1" }
        : null,
    publisher: {
      publish: async (input) => {
        state.published.push(input);
        return { artifactId: "art_1", versionId: "ver_1", version: 1 };
      },
      createShare: async (input) => {
        state.shared.push(input);
        return input.slug === "proposal" ? { shareId: "shr_1" } : null;
      },
    },
  });
  return { app, sessions, state };
}

function pathOf(url: string): string {
  return url.replace(/^https?:\/\/[^/]+/, "");
}

function cookieOf(setCookie: string | string[] | undefined): string {
  const raw = Array.isArray(setCookie) ? (setCookie[0] ?? "") : (setCookie ?? "");
  return raw.split(";", 1)[0] ?? "";
}

describe("portal magic-link flow", () => {
  it("runs request, claim, and gated serve end to end", async () => {
    const { app, state } = harness();

    const requested = await app.inject({ method: "POST", url: "/auth/request", payload: { email: "user@decktrail.orbitqube" } });
    expect(requested.statusCode).toBe(200);
    expect(state.sentUrl).toContain("/auth/claim?token=");

    const claimed = await app.inject({ method: "GET", url: pathOf(state.sentUrl) });
    // A person clicked this out of their inbox: it signs them in and sends them somewhere,
    // rather than answering {"ok":true} and leaving them on a blank page.
    expect(claimed.statusCode).toBe(302);
    expect(claimed.headers.location).toBe("/admin/");
    const cookie = cookieOf(claimed.headers["set-cookie"]);
    expect(cookie).toContain("dt_session=");

    const denied = await app.inject({ method: "GET", url: "/d/abc" });
    expect(denied.statusCode).toBe(401);

    const served = await app.inject({ method: "GET", url: "/d/abc", headers: { cookie } });
    expect(served.statusCode).toBe(200);
    expect(served.body).toContain("user@decktrail.orbitqube");
  });

  it("rejects a magic link used twice (single use)", async () => {
    const { app, state } = harness();
    await app.inject({ method: "POST", url: "/auth/request", payload: { email: "user@decktrail.orbitqube" } });
    const url = pathOf(state.sentUrl);
    const first = await app.inject({ method: "GET", url });
    const second = await app.inject({ method: "GET", url });
    expect(first.statusCode).toBe(302); // signed in, and sent on
    expect(second.statusCode).toBe(401); // the same link again is dead
  });

  it("returns neutral 200 for an email that is not invited", async () => {
    const magicLinks = new InMemoryMagicLinkStore();
    const sessions = new InMemorySessionStore();
    let sent = false;
    const app = buildApp({
      config,
      magicLinks,
      sessions,
      findInvite: async () => null,
      sendMagicLink: async () => {
        sent = true;
      },
      resolveContent: async () => null,
    });
    const res = await app.inject({ method: "POST", url: "/auth/request", payload: { email: "stranger@decktrail.orbitqube" } });
    expect(res.statusCode).toBe(200);
    expect(sent).toBe(false);
  });

  it("kills a live session when the recipient is revoked", async () => {
    const { app, sessions, state } = harness();
    await app.inject({ method: "POST", url: "/auth/request", payload: { email: "user@decktrail.orbitqube" } });
    const claimed = await app.inject({ method: "GET", url: pathOf(state.sentUrl) });
    const cookie = cookieOf(claimed.headers["set-cookie"]);

    expect((await app.inject({ method: "GET", url: "/d/abc", headers: { cookie } })).statusCode).toBe(200);
    await sessions.revokeByEmail("user@decktrail.orbitqube", "default");
    expect((await app.inject({ method: "GET", url: "/d/abc", headers: { cookie } })).statusCode).toBe(401);
  });
});

describe("magic-link abuse controls", () => {
  function limitedHarness(over: Partial<Parameters<typeof buildApp>[0]>) {
    const state = { sends: 0 };
    const app = buildApp({
      config,
      magicLinks: new InMemoryMagicLinkStore(),
      sessions: new InMemorySessionStore(),
      findInvite: async () => ({ workspace: "default" }),
      sendMagicLink: async () => {
        state.sends += 1;
      },
      resolveContent: async () => null,
      ...over,
    });
    return { app, state };
  }

  it("rate-limits per IP with a 429 once the window max is hit", async () => {
    const { app } = limitedHarness({ ipLimiter: fixedWindowLimiter(2, 60_000, () => 0) });
    const req = () =>
      app.inject({ method: "POST", url: "/auth/request", payload: { email: "user@decktrail.orbitqube" }, headers: { "cf-connecting-ip": "5.5.5.5" } });
    expect((await req()).statusCode).toBe(200);
    expect((await req()).statusCode).toBe(200);
    expect((await req()).statusCode).toBe(429);
  });

  it("separates IPs so one abuser does not block another viewer", async () => {
    // trustProxyHeader on, because this test distinguishes clients BY the header, and by
    // default the header is ignored. It used to pass without saying so, which quietly made it
    // a test that the header is trusted: exactly the behaviour that let anyone rotate
    // CF-Connecting-IP past every per-IP limit.
    const { app } = limitedHarness({
      config: { ...config, trustProxyHeader: true },
      ipLimiter: fixedWindowLimiter(1, 60_000, () => 0),
    });
    const from = (ip: string) =>
      app.inject({ method: "POST", url: "/auth/request", payload: { email: "user@decktrail.orbitqube" }, headers: { "cf-connecting-ip": ip } });
    expect((await from("1.1.1.1")).statusCode).toBe(200);
    expect((await from("1.1.1.1")).statusCode).toBe(429);
    expect((await from("2.2.2.2")).statusCode).toBe(200);
  });

  it("blocks a request with an invalid Turnstile token and sends nothing", async () => {
    const { app, state } = limitedHarness({ verifyTurnstile: async (token) => token === "good" });
    const bad = await app.inject({ method: "POST", url: "/auth/request", payload: { email: "user@decktrail.orbitqube", turnstileToken: "bad" } });
    expect(bad.statusCode).toBe(400);
    expect(state.sends).toBe(0);
    const ok = await app.inject({ method: "POST", url: "/auth/request", payload: { email: "user@decktrail.orbitqube", turnstileToken: "good" } });
    expect(ok.statusCode).toBe(200);
    expect(state.sends).toBe(1);
  });

  it("applies the per-email cooldown silently, still returning a neutral 200", async () => {
    const { app, state } = limitedHarness({ emailLimiter: fixedWindowLimiter(1, 60_000, () => 0) });
    const req = () => app.inject({ method: "POST", url: "/auth/request", payload: { email: "user@decktrail.orbitqube" } });
    expect((await req()).statusCode).toBe(200);
    const second = await req();
    expect(second.statusCode).toBe(200); // neutral, not an error
    expect(state.sends).toBe(1); // but no second email
  });

  it("exposes the Turnstile sitekey for the login form", async () => {
    const withKey = buildApp({
      config: { ...config, turnstileSitekey: "0xSITEKEY" },
      magicLinks: new InMemoryMagicLinkStore(),
      sessions: new InMemorySessionStore(),
      findInvite: async () => ({ workspace: "default" }),
      sendMagicLink: async () => {},
      resolveContent: async () => null,
    });
    const res = await withKey.inject({ method: "GET", url: "/auth/config" });
    expect(res.json()).toMatchObject({ turnstileSitekey: "0xSITEKEY", brand: null });
    // The trademark permission request path is advertised to the console. This is not about
    // the attribution mark, which needs no permission to remove (D19).
    expect(res.json().trademarkUrl).toContain("issues/new");
    expect(res.json().trademarkUrl).toContain("trademark-permission");
  });
});

describe("analytics and admin surface", () => {
  function analyticsHarness() {
    const settings = new InMemorySettingsStore();
    const events = new InMemoryEventStore();
    const state = { sentUrl: "" };
    const app = buildApp({
      config,
      magicLinks: new InMemoryMagicLinkStore(),
      sessions: new InMemorySessionStore(),
      settings,
      events,
      findInvite: async () => ({ workspace: "default" }),
      sendMagicLink: async (_email, url) => {
        state.sentUrl = url;
      },
      resolveContent: async (shareId, viewer) =>
        shareId === "abc" ? { html: `<h1>${viewer.email}</h1>`, artifactId: "art_1", versionId: "ver_1" } : null,
      // Models the real thing: only this viewer's own share resolves, and it is the share
      // that says which artifact an event belongs to.
      resolveShare: async (shareId, viewer) =>
        shareId === "shr_ok" && viewer.email === "user@decktrail.orbitqube"
          ? { artifactId: "art_1", versionId: "ver_1" }
          : null,
    });
    return { app, settings, events, state };
  }

  async function signIn(app: ReturnType<typeof analyticsHarness>["app"], state: { sentUrl: string }, email: string): Promise<string> {
    await app.inject({ method: "POST", url: "/auth/request", payload: { email } });
    const claimed = await app.inject({ method: "GET", url: pathOf(state.sentUrl) });
    return cookieOf(claimed.headers["set-cookie"]);
  }

  it("records a deck_open when a deck is served, tagged with the version", async () => {
    const { app, settings, events, state } = analyticsHarness();
    await settings.set("setup_complete", "true");
    const cookie = await signIn(app, state, "user@decktrail.orbitqube");
    const served = await app.inject({ method: "GET", url: "/d/abc", headers: { cookie } });
    expect(served.statusCode).toBe(200);
    expect(served.headers["x-robots-tag"]).toContain("noai");
    const rows = await events.list("default");
    const open = rows.find((e) => e.type === EVENT.deckOpen);
    expect(open).toMatchObject({ artifactId: "art_1", versionId: "ver_1", recipient: "user@decktrail.orbitqube" });
  });

  it("blocks an AI user-agent on the content route with 403 and records bot_blocked", async () => {
    const { app, settings, events } = analyticsHarness();
    await settings.set("setup_complete", "true");
    const res = await app.inject({ method: "GET", url: "/d/abc", headers: { "user-agent": "GPTBot/1.1" } });
    expect(res.statusCode).toBe(403);
    const rows = await events.list("default");
    expect(rows.some((e) => e.type === EVENT.botBlocked)).toBe(true);
  });

  it("serves a disallow-all robots.txt", async () => {
    const { app } = analyticsHarness();
    const res = await app.inject({ method: "GET", url: "/robots.txt" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("GPTBot");
    expect(res.body).toContain("Disallow: /");
  });

  it("gates the analytics API to the admin session", async () => {
    const { app, settings, state } = analyticsHarness();
    await settings.set("setup_complete", "true");
    await settings.set("admin_email", "admin@decktrail.orbitqube");

    // No session at all.
    expect((await app.inject({ method: "GET", url: "/admin/analytics" })).statusCode).toBe(401);

    // A non-admin viewer session is rejected.
    const viewerCookie = await signIn(app, state, "user@decktrail.orbitqube");
    expect((await app.inject({ method: "GET", url: "/admin/analytics", headers: { cookie: viewerCookie } })).statusCode).toBe(401);

    // The admin session is allowed and gets a summary.
    const adminCookie = await signIn(app, state, "admin@decktrail.orbitqube");
    await app.inject({ method: "GET", url: "/d/abc", headers: { cookie: adminCookie } }); // one open, by the admin
    const res = await app.inject({ method: "GET", url: "/admin/analytics", headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().totalOpens).toBe(1);
    expect(res.json().byRecipient[0]).toMatchObject({ recipient: "admin@decktrail.orbitqube", opens: 1 });
  });

  it("ingests a browser event, attributing it to the session and sanitising meta", async () => {
    const { app, settings, events, state } = analyticsHarness();
    await settings.set("setup_complete", "true");
    const cookie = await signIn(app, state, "user@decktrail.orbitqube");
    const res = await app.inject({
      method: "POST",
      url: "/e",
      headers: { cookie },
      payload: { type: "slide_view", shareId: "shr_ok", meta: { slideId: "s3", dwellMs: 4200, evil: "drop-me" } },
    });
    expect(res.statusCode).toBe(204);
    const rows = await events.list("default");
    const slide = rows.find((e) => e.type === "slide_view");
    // The subject is resolved from the share, not taken from the body.
    expect(slide).toMatchObject({ recipient: "user@decktrail.orbitqube", artifactId: "art_1", versionId: "ver_1" });
    expect(slide?.meta).toEqual({ slideId: "s3", dwellMs: 4200 }); // the unknown key is dropped
  });

  it("will not let a viewer name the artifact an event is filed against", async () => {
    // The previous version of this test posted artifactId and versionId in the body and
    // asserted they were stored, which enshrined the bug: identity came from the session but
    // the subject was believed. A viewer could attribute a slide_view, a completion, or a
    // copy_attempt to any artifact id, under their own name, and the owner's audit trail
    // would record it as fact. The beacon now sends only its share id.
    const { app, settings, events, state } = analyticsHarness();
    await settings.set("setup_complete", "true");
    const cookie = await signIn(app, state, "user@decktrail.orbitqube");

    const forged = await app.inject({
      method: "POST",
      url: "/e",
      headers: { cookie },
      payload: { type: "copy_attempt", artifactId: "art_someone_elses", versionId: "ver_x", meta: {} },
    });
    expect(forged.statusCode).toBe(204); // silent, as the beacon always is
    const browserEvents = async () =>
      (await events.list("default")).filter((e) => e.type === "copy_attempt" || e.type === "slide_view");
    expect(await browserEvents()).toHaveLength(0); // but nothing recorded

    const notTheirs = await app.inject({
      method: "POST",
      url: "/e",
      headers: { cookie },
      payload: { type: "slide_view", shareId: "shr_someone_elses", meta: {} },
    });
    expect(notTheirs.statusCode).toBe(204);
    expect(await browserEvents()).toHaveLength(0);
  });

  it("ignores a beacon post with no session and records nothing", async () => {
    const { app, settings, events } = analyticsHarness();
    await settings.set("setup_complete", "true");
    const res = await app.inject({ method: "POST", url: "/e", payload: { type: "slide_view", meta: {} } });
    expect(res.statusCode).toBe(204);
    expect(await events.list("default")).toHaveLength(0);
  });

  it("refuses a server-side event type posted through the beacon endpoint", async () => {
    const { app, settings, events, state } = analyticsHarness();
    await settings.set("setup_complete", "true");
    const cookie = await signIn(app, state, "user@decktrail.orbitqube");
    await app.inject({ method: "POST", url: "/e", headers: { cookie }, payload: { type: "deck_open", artifactId: "x" } });
    const rows = await events.list("default");
    // A login_requested and login_success from signing in exist, but no injected deck_open.
    expect(rows.some((e) => e.type === "deck_open")).toBe(false);
  });

  it("exports the audit log as an admin-gated CSV download", async () => {
    const { app, settings, state } = analyticsHarness();
    await settings.set("setup_complete", "true");
    await settings.set("admin_email", "admin@decktrail.orbitqube");
    const adminCookie = await signIn(app, state, "admin@decktrail.orbitqube");
    const res = await app.inject({ method: "GET", url: "/admin/events.csv", headers: { cookie: adminCookie } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    expect(res.headers["content-disposition"]).toContain("decktrail-events.csv");
    expect(res.body).toContain('"ts","type","workspace"');
  });
});

describe("theme management", () => {
  const theme = {
    name: "Acme Brand",
    colors: { bg: "#0e0e0e", surfaceLow: "#131313", surfaceHigh: "#201f1f", accent: "#8ff5ff", accentDim: "#00eefc", accent2: "#ec63ff", accent2Dim: "#c600e3", text: "#c6c4c4", heading: "#f5f5f5", muted: "#8b8988" },
    typography: { family: "Inter", scale: 1 },
    logo: { src: "" },
  };

  async function harness() {
    const settings = new InMemorySettingsStore();
    await settings.set("setup_complete", "true");
    await settings.set("admin_email", "admin@decktrail.orbitqube");
    const themes = new InMemoryThemeAdmin();
    themes.seedArtifact({ id: "art_1", workspace: "default", title: "Proposal", slug: "proposal", kind: "slide-deck", themeId: null });
    const state = { sentUrl: "" };
    const app = buildApp({
      config,
      magicLinks: new InMemoryMagicLinkStore(),
      sessions: new InMemorySessionStore(),
      settings,
      themes,
      findInvite: async () => ({ workspace: "default" }),
      sendMagicLink: async (_e, url) => {
        state.sentUrl = url;
      },
      resolveContent: async () => null,
    });
    async function adminCookie(): Promise<string> {
      await app.inject({ method: "POST", url: "/auth/request", payload: { email: "admin@decktrail.orbitqube" } });
      const claimed = await app.inject({ method: "GET", url: pathOf(state.sentUrl) });
      return cookieOf(claimed.headers["set-cookie"]);
    }
    return { app, themes, adminCookie };
  }

  it("gates the theme routes to the admin session", async () => {
    const { app } = await harness();
    expect((await app.inject({ method: "GET", url: "/admin/themes" })).statusCode).toBe(401);
  });

  it("creates, lists, assigns, and deletes a theme", async () => {
    const { app, adminCookie } = await harness();
    const cookie = await adminCookie();

    const created = await app.inject({ method: "POST", url: "/admin/themes", headers: { cookie }, payload: { name: "Acme Brand", theme } });
    expect(created.statusCode).toBe(200);
    const themeId = created.json().id as string;

    const listed = await app.inject({ method: "GET", url: "/admin/themes", headers: { cookie } });
    expect(listed.json().themes.map((t: { name: string }) => t.name)).toContain("Acme Brand");

    const assigned = await app.inject({ method: "POST", url: "/admin/artifacts/art_1/theme", headers: { cookie }, payload: { themeId } });
    expect(assigned.statusCode).toBe(204);
    const arts = await app.inject({ method: "GET", url: "/admin/artifacts", headers: { cookie } });
    expect(arts.json().artifacts[0]).toMatchObject({ id: "art_1", themeId });

    const del = await app.inject({ method: "DELETE", url: `/admin/themes/${themeId}`, headers: { cookie } });
    expect(del.statusCode).toBe(204);
    const arts2 = await app.inject({ method: "GET", url: "/admin/artifacts", headers: { cookie } });
    expect(arts2.json().artifacts[0].themeId).toBe(null); // assignment cleared on delete
  });

  it("rejects an invalid theme payload", async () => {
    const { app, adminCookie } = await harness();
    const cookie = await adminCookie();
    const res = await app.inject({ method: "POST", url: "/admin/themes", headers: { cookie }, payload: { name: "Bad", theme: { nope: true } } });
    expect(res.statusCode).toBe(400);
  });
});

describe("voice management", () => {
  async function harness() {
    const settings = new InMemorySettingsStore();
    await settings.set("setup_complete", "true");
    await settings.set("admin_email", "admin@decktrail.orbitqube");
    const state = { sentUrl: "" };
    const app = buildApp({
      config,
      magicLinks: new InMemoryMagicLinkStore(),
      sessions: new InMemorySessionStore(),
      settings,
      findInvite: async () => ({ workspace: "default" }),
      sendMagicLink: async (_e, url) => {
        state.sentUrl = url;
      },
      resolveContent: async () => null,
    });
    async function adminCookie(): Promise<string> {
      await app.inject({ method: "POST", url: "/auth/request", payload: { email: "admin@decktrail.orbitqube" } });
      const claimed = await app.inject({ method: "GET", url: pathOf(state.sentUrl) });
      return cookieOf(claimed.headers["set-cookie"]);
    }
    return { app, adminCookie };
  }

  it("gates voice to the admin session, stores and returns it, and validates", async () => {
    const { app, adminCookie } = await harness();
    expect((await app.inject({ method: "GET", url: "/admin/voice" })).statusCode).toBe(401);

    const cookie = await adminCookie();
    expect((await app.inject({ method: "GET", url: "/admin/voice", headers: { cookie } })).json().voice).toBe(null);

    const voice = { name: "Acme", tone: "plain", forbidden: ["hype"], preferred: ["clarity"] };
    expect((await app.inject({ method: "PUT", url: "/admin/voice", headers: { cookie }, payload: voice })).statusCode).toBe(204);
    expect((await app.inject({ method: "GET", url: "/admin/voice", headers: { cookie } })).json().voice).toMatchObject({ name: "Acme", forbidden: ["hype"] });

    const bad = await app.inject({ method: "PUT", url: "/admin/voice", headers: { cookie }, payload: { tone: "x" } });
    expect(bad.statusCode).toBe(400); // missing required name
  });
});

describe("portal admin ingest", () => {
  const authHeader = { authorization: "Bearer admin-token-0123456789" };
  const deck = {
    id: "d",
    title: "Proposal",
    slug: "proposal",
    workspace: "default",
    kind: "slide-deck",
    slides: [{ id: "s1", layout: "cover", heading: [{ type: "text", text: "Hi" }] }],
  };

  it("rejects publish without a valid admin token", async () => {
    const { app } = harness();
    expect((await app.inject({ method: "POST", url: "/admin/publish", payload: deck })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: "POST", url: "/admin/publish", payload: deck, headers: { authorization: "Bearer wrong" } })).statusCode,
    ).toBe(401);
  });

  it("publishes a valid deck and returns ids", async () => {
    const { app, state } = harness();
    const res = await app.inject({ method: "POST", url: "/admin/publish", payload: deck, headers: authHeader });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ artifactId: "art_1", versionId: "ver_1", version: 1 });
    expect(state.published.length).toBe(1);
  });

  it("rejects an invalid artifact", async () => {
    const { app } = harness();
    const res = await app.inject({ method: "POST", url: "/admin/publish", payload: { nope: true }, headers: authHeader });
    expect(res.statusCode).toBe(400);
  });

  it("creates a share link", async () => {
    const { app } = harness();
    const res = await app.inject({
      method: "POST",
      url: "/admin/shares",
      payload: { slug: "proposal", recipient: "user@decktrail.orbitqube" },
      headers: authHeader,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().shareId).toBe("shr_1");
    expect(res.json().url).toContain("/d/shr_1");
  });
});

describe("whose IP the rate limiter is actually counting", () => {
  // Verified against a running portal before this existed: rotating CF-Connecting-IP per
  // request walked straight through a 10-per-minute limit. A header is written by whoever
  // sends the request, so trusting it unconditionally made every per-IP control decorative,
  // and let any caller write an IP of their choosing into the owner's audit log.
  //
  // Driven through the real app, not through a copy of clientIp: a test that re-implements
  // the thing it checks passes whatever the code does.
  function limited(trustProxyHeader: boolean) {
    const state = { sends: 0 };
    const app = buildApp({
      config: { ...config, trustProxyHeader },
      magicLinks: new InMemoryMagicLinkStore(),
      sessions: new InMemorySessionStore(),
      findInvite: async () => ({ workspace: "default" }),
      sendMagicLink: async () => {
        state.sends += 1;
      },
      resolveContent: async () => null,
      ipLimiter: fixedWindowLimiter(1, 60_000, () => 0),
    });
    const from = (ip: string) =>
      app.inject({
        method: "POST",
        url: "/auth/request",
        payload: { email: "user@decktrail.orbitqube" },
        headers: { "cf-connecting-ip": ip },
      });
    return { from };
  }

  it("ignores a forged CF-Connecting-IP by default, so rotating it does not reset the limit", async () => {
    const { from } = limited(false);
    expect((await from("9.9.9.1")).statusCode).toBe(200);
    // A fresh forged IP every time. All of these are one real socket, and the limit is 1.
    expect((await from("9.9.9.2")).statusCode).toBe(429);
    expect((await from("9.9.9.3")).statusCode).toBe(429);
    expect((await from("9.9.9.4")).statusCode).toBe(429);
  });

  it("honours the header once the operator says they are behind a proxy", async () => {
    const { from } = limited(true);
    expect((await from("9.9.9.1")).statusCode).toBe(200);
    expect((await from("9.9.9.1")).statusCode).toBe(429); // same client, limited
    expect((await from("9.9.9.2")).statusCode).toBe(200); // genuinely different client
  });
});
