import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { Deck, DocumentArtifact, Tool, Theme, Voice } from "@decktrail/ir";
import type { Config } from "./config.js";
import type { MagicLinkStore, SessionStore } from "./auth/stores.js";
import { issueMagicLink, claimMagicLink } from "./auth/magiclink.js";
import { createSession, readSession } from "./auth/session.js";
import { constantTimeEqual } from "./crypto.js";
import { serializeSessionCookie, parseCookies } from "./cookies.js";
import { isSetupComplete, setupFormHtml, setupLockedHtml, setupTokenValid, SETUP_TOKEN_KEY, type SettingsStore } from "./settings.js";
import type { RateLimiter } from "./ratelimit.js";
import type { TurnstileVerifier } from "./turnstile.js";
import type { ResolvedContent } from "./content.js";
import { EVENT, EVENT_INGEST_PATH, BROWSER_EVENTS, sanitizeMeta, summarize, toCsv, type EventStore, type EventInput } from "./analytics.js";
import { MAX_LOGO_CHARS, type ThemeAdmin } from "./themes.js";
import { trademarkRequestUrl, trademarkFallbackEmail, defaultBrandName } from "./defaults.js";
import { isBlockedBot, robotsTxt, ROBOTS_TAG } from "./bots.js";
import { signInPageHtml, notAvailablePageHtml, safeNext } from "./signin.js";

export interface Viewer {
  email: string;
  workspace: string;
}

export interface PublishInput {
  workspace: string;
  slug: string;
  kind: string;
  title: string;
  ir: unknown;
  theme?: unknown;
  author: string;
}

/** Writes artifacts, versions, and shares. Injected so it can be Postgres-backed or faked. */
export interface Publisher {
  publish(input: PublishInput): Promise<{ artifactId: string; versionId: string; version: number }>;
  createShare(input: {
    workspace: string;
    slug: string;
    recipient: string;
    version?: number;
  }): Promise<{ shareId: string } | null>;
}

export interface AppDeps {
  config: Config;
  magicLinks: MagicLinkStore;
  sessions: SessionStore;
  /** The invite for this email and its workspace, or null. A miss is answered neutrally. */
  findInvite: (email: string) => Promise<{ workspace: string } | null>;
  /** Send the magic link. Only called for invited emails. */
  sendMagicLink: (email: string, url: string) => Promise<void>;
  /** Resolve a share id to rendered content for a viewer, or null if it does not resolve. */
  resolveContent: (shareId: string, viewer: Viewer) => Promise<ResolvedContent | null>;
  /**
   * What a share points at, for a viewer who owns it: the same recipient check as
   * resolveContent but without rendering. Used by the event ingest so the subject of an event
   * is derived rather than believed. Absent means browser events are not recorded.
   */
  resolveShare?: (shareId: string, viewer: Viewer) => Promise<{ artifactId: string; versionId: string } | null>;
  /** Optional publishing backend for the admin ingest routes. */
  publisher?: Publisher;
  /** First-run settings store. When provided, the setup wizard is active. */
  settings?: SettingsStore;
  /** Called once when setup completes, for example to invite the admin. */
  onSetupComplete?: (adminEmail: string) => Promise<void>;
  /** Per-IP limiter on the magic-link request endpoint. Absent means no IP limit. */
  ipLimiter?: RateLimiter;
  /** Per-email cooldown on sending a link (anti email-bombing). Absent means no cooldown. */
  emailLimiter?: RateLimiter;
  /** Turnstile token verifier. Absent means CAPTCHA verification is off. */
  verifyTurnstile?: TurnstileVerifier;
  /** Analytics/audit event store. Absent means events are not recorded. */
  events?: EventStore;
  /** Per-IP limiter on the browser event ingest, so a viewer cannot flood it. */
  eventLimiter?: RateLimiter;
  /** Directory of the built owner console (its dist). When set, it is served at /admin. */
  consoleDir?: string;
  /** Theme management (brand themes and per-artifact assignment). Powers the console Brand tab. */
  themes?: ThemeAdmin;
}

/**
 * The client's IP: the socket address, unless the operator has said they are behind a proxy
 * that sets CF-Connecting-IP.
 *
 * The header used to be trusted unconditionally, which made every per-IP control decorative:
 * rotating CF-Connecting-IP per request walks straight through a 10-per-minute limit, and
 * verified against a running portal, it did. It also let a caller write any IP they liked into
 * the owner's audit log, which is the evidence this product exists to produce.
 *
 * Off by default because the default deployment publishes port 3000 directly, where nothing
 * strips a client-supplied header. Behind Cloudflare the header is authoritative and the socket
 * address is useless, so the operator turns it on and takes responsibility for the proxy
 * actually being in front.
 */
function clientIp(request: FastifyRequest, config: Config): string {
  if (!config.trustProxyHeader) return request.ip;
  const cf = request.headers["cf-connecting-ip"];
  if (typeof cf === "string" && cf.length > 0) return cf;
  return request.ip;
}

/** The request user agent, or undefined. */
function userAgent(request: FastifyRequest): string | undefined {
  const ua = request.headers["user-agent"];
  return typeof ua === "string" ? ua : undefined;
}

/**
 * Record an event, failing open. Analytics must never break a request: a failed write is
 * logged and swallowed, so a serve or a login still completes. Analytics is not a
 * safety-critical path, so fail-open is the correct posture here.
 */
async function recordEvent(deps: AppDeps, e: EventInput): Promise<void> {
  if (!deps.events) return;
  try {
    await deps.events.record(e);
  } catch (err) {
    console.error(`[events] ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Whether the request carries a valid session for the configured admin email. */
async function isAdminSession(deps: AppDeps, config: Config, request: FastifyRequest): Promise<boolean> {
  if (!deps.settings) return false;
  const adminEmail = await deps.settings.get("admin_email");
  if (!adminEmail) return false;
  const cookies = parseCookies(request.headers.cookie);
  const viewer = await readSession(deps.sessions, config.sessionSecret, cookies[config.cookieName]);
  return viewer !== null && viewer.email === adminEmail;
}

function adminAuth(request: FastifyRequest, config: Config): "disabled" | "unauthorized" | "ok" {
  if (!config.adminToken) return "disabled";
  const header = request.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return constantTimeEqual(token, config.adminToken) ? "ok" : "unauthorized";
}

function extractArtifactMeta(ir: unknown): { workspace: string; slug: string; kind: string; title: string } | null {
  const candidates = [
    [Deck, "slide-deck"],
    [DocumentArtifact, "document"],
    [Tool, "tool"],
  ] as const;
  for (const [schema, kind] of candidates) {
    const parsed = schema.safeParse(ir);
    if (parsed.success) {
      return { workspace: parsed.data.workspace, slug: parsed.data.slug, kind, title: parsed.data.title };
    }
  }
  return null;
}

/** Build the portal HTTP app. Stores and side effects are injected, so it is fully testable. */
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({ logger: false });
  const { config } = deps;

  // First-run setup gate. Active only when a settings store is provided.
  if (deps.settings) {
    const settings = deps.settings;
    let complete = false;
    app.addHook("onRequest", async (request, reply) => {
      if (complete) return;
      const path = request.url.split("?")[0] ?? "";
      if (path === "/setup" || path.startsWith("/setup/") || path === "/healthz" || path === "/robots.txt") return;
      if (await isSetupComplete(settings)) {
        complete = true;
        return;
      }
      return reply.redirect("/setup");
    });
    app.get("/setup", async (request, reply) => {
      if (await isSetupComplete(settings)) return reply.redirect("/");
      const token = (request.query as { token?: string }).token;
      if (!(await setupTokenValid(settings, token))) {
        return reply
          .code(403)
          .header("content-type", "text/html; charset=utf-8")
          .send(setupLockedHtml());
      }
      return reply.header("content-type", "text/html; charset=utf-8").send(setupFormHtml(token as string));
    });
    app.post("/setup", async (request, reply) => {
      if (await isSetupComplete(settings)) return reply.code(409).send({ error: "already set up" });
      const body = (request.body ?? {}) as Record<string, string>;
      // The real gate. Whoever holds this token has read the container log, which means they
      // are the person running the portal. See settings.ts for why setup cannot simply be
      // left open: it reopens if the settings row is ever lost, on a portal full of decks.
      if (!(await setupTokenValid(settings, body["setupToken"]))) {
        return reply.code(403).send({ error: "invalid or missing setup token" });
      }
      const adminEmail = (body["adminEmail"] ?? "").trim().toLowerCase();
      if (!adminEmail) return reply.code(400).send({ error: "adminEmail is required" });
      await settings.set("admin_email", adminEmail);
      if (body["brandName"]) await settings.set("brand_name", body["brandName"]);
      // Anonymous telemetry is opt-in: only stored as on when the operator ticked the box.
      await settings.set("telemetry_optin", body["telemetry_optin"] === "true" ? "true" : "false");
      for (const key of ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"]) {
        const value = body[key];
        if (value) await settings.set(key, value);
      }
      await settings.set("setup_complete", "true");
      // Burn the token. If setup ever reopens (a lost settings row, a partial restore), a new
      // one is generated and printed, so the stale token in an old log is worthless.
      await settings.set(SETUP_TOKEN_KEY, "");
      complete = true;
      if (deps.onSetupComplete) await deps.onSetupComplete(adminEmail);
      return reply.code(201).send({ ok: true });
    });
  }

  // The root. The setup wizard finishes by sending you here, and it answered a raw 404: the
  // first thing an operator saw after installing was "Route GET:/ not found". The console is
  // where they are going, and it shows a sign-in screen if they are not signed in yet.
  app.get("/", async (_request, reply) => reply.redirect("/admin/"));

  app.get("/healthz", async () => ({ ok: true }));

  // A disallow-all robots.txt naming the AI/scraper agents. Advisory (see bots.ts).
  app.get("/robots.txt", async (_request, reply) => {
    return reply.header("content-type", "text/plain; charset=utf-8").send(robotsTxt());
  });

  // Public login/console config: the Turnstile sitekey the login form needs, and the
  // workspace brand the console shows. Both are non-secret and safe to serve unauthenticated.
  app.get("/auth/config", async () => ({
    turnstileSitekey: config.turnstileSitekey ?? null,
    brand: (await deps.settings?.get("brand_name")) ?? null,
    trademarkUrl: trademarkRequestUrl,
    trademarkEmail: trademarkFallbackEmail,
  }));

  // Engagement beacon ingest. The injected beacon (renderers/beacon.ts) posts per-slide and
  // protection events here. Fire-and-forget: it always answers 204 and never leaks. Identity
  // (recipient, workspace) is taken from the session, not the body; only invited-and-signed-in
  // viewers of a real deck can reach this. The event type is whitelisted so a viewer cannot
  // inject a server-side event, and the meta is sanitised.
  app.post(EVENT_INGEST_PATH, async (request, reply) => {
    const ip = clientIp(request, config);
    if (deps.eventLimiter && !deps.eventLimiter.hit(ip)) return reply.code(204).send();
    const cookies = parseCookies(request.headers.cookie);
    const viewer = await readSession(deps.sessions, config.sessionSecret, cookies[config.cookieName]);
    if (!viewer) return reply.code(204).send();

    const body = (request.body ?? {}) as { type?: string; shareId?: string; meta?: unknown };
    if (typeof body.type !== "string" || !BROWSER_EVENTS.has(body.type)) return reply.code(204).send();

    // What the viewer is looking at is resolved from their share, never taken from the body.
    // Identity was already read from the session; the subject has to be earned the same way,
    // or a viewer could file a slide_view, a completion, or a copy_attempt against any
    // artifact id they cared to name, in their own name, and the owner's audit trail would
    // record it as fact. resolveShare also re-checks the share is theirs.
    if (typeof body.shareId !== "string" || !deps.resolveShare) return reply.code(204).send();
    const subject = await deps.resolveShare(body.shareId, viewer);
    if (!subject) return reply.code(204).send();

    await recordEvent(deps, {
      workspace: viewer.workspace,
      type: body.type,
      recipient: viewer.email,
      artifactId: subject.artifactId,
      versionId: subject.versionId,
      ip,
      ua: userAgent(request),
      meta: sanitizeMeta(body.meta),
    });
    return reply.code(204).send();
  });

  // Request a magic link. Always returns a neutral response so invite lists never leak.
  app.post("/auth/request", async (request, reply) => {
    const ip = clientIp(request, config);
    // Per-IP rate limit first, so a flood is shed before any work. Not email-specific, so a
    // 429 here leaks nothing about who is invited.
    if (deps.ipLimiter && !deps.ipLimiter.hit(ip)) {
      return reply.code(429).send({ error: "too many requests" });
    }

    const body = (request.body ?? {}) as { email?: string; workspace?: string; turnstileToken?: string; "cf-turnstile-response"?: string };

    // CAPTCHA check, when configured. Applied to every request, so it never reveals invites.
    if (deps.verifyTurnstile) {
      const token = body.turnstileToken ?? body["cf-turnstile-response"] ?? "";
      if (!(await deps.verifyTurnstile(token, ip))) {
        return reply.code(400).send({ error: "verification failed" });
      }
    }

    const email = (body.email ?? "").trim().toLowerCase();
    const ua = userAgent(request);
    try {
      // The workspace comes from the invite, not from the request. A recipient holds a share
      // link and knows nothing about workspaces, so asking them to supply one meant anybody
      // invited under a deck's own workspace was silently refused a link. If the caller does
      // name a workspace it still has to match, so an explicit request cannot be redirected.
      const invite = email ? await deps.findInvite(email) : null;
      const requested = body.workspace;
      const ok = invite !== null && (requested === undefined || requested === invite.workspace);
      if (ok) {
        const workspace = invite.workspace;
        await recordEvent(deps, { workspace, type: EVENT.loginRequested, recipient: email, ip, ua });
        // Per-email cooldown: silently skip a resend inside the window, still neutral, so an
        // attacker cannot bomb one address and cannot tell a rate-limited address apart.
        if (deps.emailLimiter && !deps.emailLimiter.hit(email)) {
          return reply.code(200).send({ ok: true });
        }
        const { token } = await issueMagicLink(deps.magicLinks, email, workspace, config.magicLinkTtlMs);
        // Carry where they were going, so the link lands them on the deck rather than on a
        // bare "ok". safeNext refuses anything that is not a path on this portal.
        const next = safeNext((body as { next?: unknown }).next);
        const scheme = config.cookieSecure ? "https" : "http";
        const url =
          `${scheme}://${config.baseHost}/auth/claim?token=${encodeURIComponent(token)}` +
          (next ? `&next=${encodeURIComponent(next)}` : "");
        await deps.sendMagicLink(email, url);
      } else if (email) {
        // Not invited, or asked for a workspace that is not theirs. Recorded against the
        // workspace they named if they named one, since there is no invite to take it from.
        await recordEvent(deps, { workspace: requested ?? "default", type: EVENT.denied, recipient: email, ip, ua });
      }
    } catch (err) {
      // A failure in the invited branch (for example an SMTP send error) must never change
      // the response, or an attacker could tell invited addresses apart by inducing errors.
      // Log server-side and still answer neutrally.
      console.error(`[auth/request] ${err instanceof Error ? err.message : String(err)}`);
    }
    return reply.code(200).send({ ok: true });
  });

  // Claim a magic link, starting a session.
  app.get("/auth/claim", async (request, reply) => {
    const token = (request.query as { token?: string }).token;
    if (!token) return reply.code(400).send({ error: "missing token" });
    const claimed = await claimMagicLink(deps.magicLinks, token);
    if (!claimed) return reply.code(401).send({ error: "invalid or expired link" });
    await recordEvent(deps, {
      workspace: claimed.workspace,
      type: EVENT.loginSuccess,
      recipient: claimed.email,
      ip: clientIp(request, config),
      ua: userAgent(request),
    });
    const cookie = await createSession(
      deps.sessions,
      config.sessionSecret,
      claimed.email,
      claimed.workspace,
      config.sessionTtlMs,
    );
    reply.header("set-cookie", serializeSessionCookie(config, cookie, config.sessionTtlMs));
    // A person clicked this out of their inbox. Send them where they were going, or to the
    // console. {"ok":true} was what a client used to see for their trouble.
    const next = safeNext((request.query as { next?: unknown }).next);
    return reply.redirect(next ?? "/admin/");
  });

  // Sign out and go back to the door. The likeliest reason someone cannot open a deck sent to
  // them is being signed in as the wrong person, and without this they would have to know how
  // to clear a cookie to fix it.
  app.get("/auth/signout", async (request, reply) => {
    const cookies = parseCookies(request.headers.cookie);
    const viewer = await readSession(deps.sessions, config.sessionSecret, cookies[config.cookieName]);
    if (viewer) await deps.sessions.revokeByEmail(viewer.email, viewer.workspace);
    reply.header("set-cookie", serializeSessionCookie(config, "", 0));
    const next = safeNext((request.query as { next?: unknown }).next);
    return reply.redirect(next ?? "/admin/");
  });

  // Serve a gated deck. No valid session means the content is never reached.
  app.get("/d/:shareId", async (request, reply) => {
    const ua = userAgent(request);
    const ip = clientIp(request, config);
    reply.header("X-Robots-Tag", ROBOTS_TAG);

    // Bot defense first, before the session check, so a scraper attempt is refused and
    // recorded as a first-class signal even though it has no session either way.
    if (isBlockedBot(ua)) {
      await recordEvent(deps, { workspace: "default", type: EVENT.botBlocked, ip, ua, meta: { path: request.url } });
      return reply.code(403).send({ error: "forbidden" });
    }

    const cookies = parseCookies(request.headers.cookie);
    const viewer = await readSession(deps.sessions, config.sessionSecret, cookies[config.cookieName]);
    const { shareId } = request.params as { shareId: string };
    if (!viewer) {
      // A person is standing here. This used to answer {"error":"please sign in"} as raw JSON,
      // to a client who had just clicked the link their consultant sent them, with nowhere to
      // sign in and nothing to do. Give them the door, and remember where they were going.
      const brand = (await deps.settings?.get("brand_name")) ?? defaultBrandName;
      return reply
        .code(401)
        .header("content-type", "text/html; charset=utf-8")
        .send(signInPageHtml({ brand, next: `/d/${shareId}`, sitekey: config.turnstileSitekey }));
    }
    const resolved = await deps.resolveContent(shareId, viewer);
    if (resolved === null) {
      // Withdrawn, never existed, or someone else's: all the same answer, deliberately. Saying
      // which would confirm to a stranger that a share id is real and who it belongs to.
      const brand = (await deps.settings?.get("brand_name")) ?? defaultBrandName;
      return reply
        .code(404)
        .header("content-type", "text/html; charset=utf-8")
        .send(notAvailablePageHtml({ brand, next: `/d/${shareId}` }));
    }

    await recordEvent(deps, {
      workspace: viewer.workspace,
      type: EVENT.deckOpen,
      artifactId: resolved.artifactId,
      versionId: resolved.versionId,
      recipient: viewer.email,
      ip,
      ua,
    });
    return reply.header("content-type", "text/html; charset=utf-8").send(resolved.html);
  });

  // Publish an artifact IR as a new immutable version (D10). Admin only.
  app.post("/admin/publish", async (request, reply) => {
    const auth = adminAuth(request, config);
    if (auth === "disabled") return reply.code(503).send({ error: "admin disabled" });
    if (auth === "unauthorized") return reply.code(401).send({ error: "unauthorized" });
    if (!deps.publisher) return reply.code(503).send({ error: "publishing not configured" });
    // Body may be the raw IR, or an envelope { artifact, theme } carrying a per-deck theme.
    const raw = request.body;
    const envelope = typeof raw === "object" && raw !== null && "artifact" in raw;
    const ir = envelope ? (raw as { artifact: unknown }).artifact : raw;
    const theme = envelope ? (raw as { theme?: unknown }).theme : undefined;
    const meta = extractArtifactMeta(ir);
    if (!meta) return reply.code(400).send({ error: "not a valid DeckTrail IR artifact" });
    const result = await deps.publisher.publish({ ...meta, ir, theme, author: "operator" });
    return reply.code(201).send(result);
  });

  // Create a per-recipient share link pinned to a version (D13), inviting the recipient. Admin only.
  app.post("/admin/shares", async (request, reply) => {
    const auth = adminAuth(request, config);
    if (auth === "disabled") return reply.code(503).send({ error: "admin disabled" });
    if (auth === "unauthorized") return reply.code(401).send({ error: "unauthorized" });
    if (!deps.publisher) return reply.code(503).send({ error: "publishing not configured" });
    const body = (request.body ?? {}) as { slug?: string; recipient?: string; workspace?: string; version?: number };
    if (!body.slug || !body.recipient) return reply.code(400).send({ error: "slug and recipient are required" });
    // Note the asymmetry worth knowing about: /admin/publish takes the workspace from the IR
    // it is given, while this route cannot see the IR and so falls back to "default". A caller
    // that publishes an IR with its own workspace and then omits it here will look in the
    // wrong place, which is why the error below names what it actually searched for.
    const workspace = body.workspace ?? "default";
    const share = await deps.publisher.createShare({
      workspace,
      slug: body.slug,
      recipient: body.recipient.trim().toLowerCase(),
      version: body.version,
    });
    if (!share) {
      return reply
        .code(404)
        .send({ error: `no artifact with slug "${body.slug}" in workspace "${workspace}"` });
    }
    return reply.code(201).send({ shareId: share.shareId, url: `https://${config.baseHost}/d/${share.shareId}` });
  });

  // Analytics summary for the owner. Gated by an admin magic-link session (the admin email
  // set at setup), not the Bearer token the CLI ingest routes use, since this is browser-facing.
  app.get("/admin/analytics", async (request, reply) => {
    if (!(await isAdminSession(deps, config, request))) return reply.code(401).send({ error: "admin sign-in required" });
    // No workspace means every workspace. The owner publishes decks under whatever workspace
    // the IR names, so defaulting their own dashboard to "default" showed them an empty page
    // while their clients were reading. ?workspace= still narrows it.
    const workspace = (request.query as { workspace?: string }).workspace;
    const rows = deps.events ? await deps.events.list(workspace) : [];
    return reply.send(summarize(rows));
  });

  // The audit log as a CSV download, same admin-session gate.
  app.get("/admin/events.csv", async (request, reply) => {
    if (!(await isAdminSession(deps, config, request))) return reply.code(401).send({ error: "admin sign-in required" });
    // No workspace means every workspace. The owner publishes decks under whatever workspace
    // the IR names, so defaulting their own dashboard to "default" showed them an empty page
    // while their clients were reading. ?workspace= still narrows it.
    const workspace = (request.query as { workspace?: string }).workspace;
    const rows = deps.events ? await deps.events.list(workspace, { limit: 50000 }) : [];
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", 'attachment; filename="decktrail-events.csv"')
      .send(toCsv(rows));
  });

  // Brand themes for the console (D16). Admin-session gated, like the analytics routes.
  //
  // A workspace is a client (D23). The owner works across all of them, so a read with no
  // ?workspace= spans every client; passing one narrows to it. Writes key on the row's own id
  // and take no workspace at all, because an id is unique and a guessed workspace in the
  // predicate could only hide a row that exists.
  const workspaceOf = (request: FastifyRequest): string | undefined => (request.query as { workspace?: string }).workspace;

  app.get("/admin/themes", async (request, reply) => {
    if (!(await isAdminSession(deps, config, request))) return reply.code(401).send({ error: "admin sign-in required" });
    if (!deps.themes) return reply.code(503).send({ error: "themes not configured" });
    return reply.send({ themes: await deps.themes.listThemes(workspaceOf(request)) });
  });

  app.post("/admin/themes", async (request, reply) => {
    if (!(await isAdminSession(deps, config, request))) return reply.code(401).send({ error: "admin sign-in required" });
    if (!deps.themes) return reply.code(503).send({ error: "themes not configured" });
    const body = (request.body ?? {}) as { id?: string; name?: string; theme?: unknown };
    if (typeof body.name !== "string" || body.name.trim() === "") return reply.code(400).send({ error: "name is required" });
    const parsed = Theme.safeParse(body.theme);
    if (!parsed.success) return reply.code(400).send({ error: "not a valid theme" });
    if (parsed.data.logo.src.length > MAX_LOGO_CHARS) return reply.code(413).send({ error: "logo is too large" });
    // Creating a theme needs a home, so this write does take a workspace: the one asked for,
    // else "default". Updating ignores it and keys on the id.
    const rec = await deps.themes.saveTheme(workspaceOf(request) ?? "default", { id: body.id, name: body.name.trim(), theme: parsed.data });
    return reply.code(200).send(rec);
  });

  app.delete("/admin/themes/:id", async (request, reply) => {
    if (!(await isAdminSession(deps, config, request))) return reply.code(401).send({ error: "admin sign-in required" });
    if (!deps.themes) return reply.code(503).send({ error: "themes not configured" });
    await deps.themes.deleteTheme((request.params as { id: string }).id);
    return reply.code(204).send();
  });

  app.get("/admin/artifacts", async (request, reply) => {
    if (!(await isAdminSession(deps, config, request))) return reply.code(401).send({ error: "admin sign-in required" });
    if (!deps.themes) return reply.code(503).send({ error: "themes not configured" });
    return reply.send({
      artifacts: await deps.themes.listArtifacts(workspaceOf(request)),
      workspaces: await deps.themes.listWorkspaces(),
    });
  });

  app.post("/admin/artifacts/:id/theme", async (request, reply) => {
    if (!(await isAdminSession(deps, config, request))) return reply.code(401).send({ error: "admin sign-in required" });
    if (!deps.themes) return reply.code(503).send({ error: "themes not configured" });
    const themeId = (request.body as { themeId?: string | null })?.themeId ?? null;
    await deps.themes.assignTheme((request.params as { id: string }).id, themeId);
    return reply.code(204).send();
  });

  // The workspace generation voice (register), edited in the console Voice tab and stored in
  // settings. The CLI reads a local voice.json for generation; this is the portal-managed copy
  // the owner can download. Admin-session gated.
  app.get("/admin/voice", async (request, reply) => {
    // Readable by the console (an admin session) OR by the studio CLI (the Bearer token). The
    // CLI needs it because this is where the voice actually lives: without this the Voice tab
    // wrote to a row nothing ever read, and generation quietly used a file on disk instead.
    const viaToken = adminAuth(request, config) === "ok";
    if (!viaToken && !(await isAdminSession(deps, config, request))) {
      return reply.code(401).send({ error: "admin sign-in required" });
    }
    if (!deps.settings) return reply.code(503).send({ error: "settings not configured" });
    const raw = await deps.settings.get("voice");
    return reply.send({ voice: raw ? (JSON.parse(raw) as unknown) : null });
  });

  app.put("/admin/voice", async (request, reply) => {
    if (!(await isAdminSession(deps, config, request))) return reply.code(401).send({ error: "admin sign-in required" });
    if (!deps.settings) return reply.code(503).send({ error: "settings not configured" });
    const parsed = Voice.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "not a valid voice" });
    await deps.settings.set("voice", JSON.stringify(parsed.data));
    return reply.code(204).send();
  });

  // Serve the built owner console at /admin, when its dist is provided. The admin API routes
  // above are explicit and take precedence over the static wildcard; the console is a single
  // page, so it needs no client-side route fallback.
  if (deps.consoleDir) {
    app.register(fastifyStatic, { root: deps.consoleDir, prefix: "/admin/", index: ["index.html"] });
    app.get("/admin", async (_request, reply) => reply.redirect("/admin/"));
  }

  return app;
}
