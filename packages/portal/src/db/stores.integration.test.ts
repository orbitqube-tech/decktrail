import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { createDb, type Db } from "./client.js";
import { runMigrations } from "./migrate.js";
import { DrizzleMagicLinkStore, DrizzleSessionStore } from "./stores.js";
import { DrizzlePublisher } from "./publish.js";
import { makeResolveContent } from "../content.js";
import { sha256, randomToken } from "../crypto.js";

// Runs only when a Postgres URL is provided, so the default suite needs no database.
const url = process.env["DATABASE_URL_TEST"];

describe.skipIf(!url)("Drizzle stores against Postgres", () => {
  let pool: Pool;
  let db: Db;
  let magic: DrizzleMagicLinkStore;
  let sessions: DrizzleSessionStore;

  beforeAll(async () => {
    const c = createDb(url as string);
    pool = c.pool;
    db = c.db;
    await runMigrations(db, fileURLToPath(new URL("../../drizzle", import.meta.url)));
    magic = new DrizzleMagicLinkStore(db);
    sessions = new DrizzleSessionStore(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("magic link claim is single use", async () => {
    const hash = sha256(randomToken());
    await magic.save({ tokenHash: hash, email: "admin@decktrail.orbitqube", workspace: "default", expiresAt: Date.now() + 60_000 });
    const first = await magic.claim(hash, Date.now());
    const second = await magic.claim(hash, Date.now());
    expect(first?.email).toBe("admin@decktrail.orbitqube");
    expect(second).toBeNull();
  });

  it("does not claim an expired magic link", async () => {
    const hash = sha256(randomToken());
    await magic.save({ tokenHash: hash, email: "admin@decktrail.orbitqube", workspace: "default", expiresAt: Date.now() - 1 });
    expect(await magic.claim(hash, Date.now())).toBeNull();
  });

  it("creates, reads, and revokes a session", async () => {
    const sid = randomToken();
    await sessions.create({ sid, email: "admin@decktrail.orbitqube", workspace: "default", expiresAt: Date.now() + 60_000, revoked: false });
    expect((await sessions.get(sid))?.email).toBe("admin@decktrail.orbitqube");
    await sessions.revoke(sid);
    expect((await sessions.get(sid))?.revoked).toBe(true);
  });

  it("revokes every session for an email", async () => {
    const sid = randomToken();
    await sessions.create({ sid, email: "other@decktrail.orbitqube", workspace: "default", expiresAt: Date.now() + 60_000, revoked: false });
    await sessions.revokeByEmail("other@decktrail.orbitqube", "default");
    expect((await sessions.get(sid))?.revoked).toBe(true);
  });

  it("publishes incrementing versions and creates a share", async () => {
    const pub = new DrizzlePublisher(db);
    const slug = `proposal-${randomToken(4)}`;
    const deck = { id: "d", title: "Proposal", slug, workspace: "default", kind: "slide-deck", slides: [] };
    const v1 = await pub.publish({ workspace: "default", slug, kind: "slide-deck", title: "Proposal", ir: deck, author: "op" });
    const v2 = await pub.publish({ workspace: "default", slug, kind: "slide-deck", title: "Proposal", ir: deck, author: "op" });
    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);
    expect(v2.artifactId).toBe(v1.artifactId);
    const share = await pub.createShare({ workspace: "default", slug, recipient: "user@decktrail.orbitqube" });
    expect(share?.shareId).toMatch(/^shr_/);
    expect(await pub.createShare({ workspace: "default", slug: "does-not-exist", recipient: "user@decktrail.orbitqube" })).toBeNull();
  });

  it("renders a published deck in its stored theme", async () => {
    const pub = new DrizzlePublisher(db);
    const slug = `themed-${randomToken(4)}`;
    const deck = {
      id: "d",
      title: "Themed",
      slug,
      workspace: "default",
      kind: "slide-deck",
      slides: [{ id: "s1", layout: "cover", heading: [{ type: "text", text: "Hi" }] }],
    };
    const theme = {
      name: "Brand",
      colors: {
        bg: "#010203",
        surfaceLow: "#111111",
        surfaceHigh: "#222222",
        accent: "#abcdef",
        accentDim: "#8899aa",
        accent2: "#ffeedd",
        accent2Dim: "#ccbbaa",
        text: "#eeeeee",
        heading: "#ffffff",
        muted: "#999999",
      },
      typography: { family: "Inter", scale: 1 },
      logo: { src: "" },
    };
    await pub.publish({ workspace: "default", slug, kind: "slide-deck", title: "Themed", ir: deck, theme, author: "op" });
    const share = await pub.createShare({ workspace: "default", slug, recipient: "user@decktrail.orbitqube" });
    const resolve = makeResolveContent(db);
    const resolved = await resolve(share!.shareId, { email: "user@decktrail.orbitqube", workspace: "default" });
    // resolveContent returns the html plus what was seen, not a bare string. This assertion
    // was written against the older shape and had been failing since; nothing noticed because
    // the whole file skips itself unless DATABASE_URL_TEST is set.
    expect(resolved?.html).toContain("--accent:#abcdef");
    expect(resolved?.artifactId).toBeTruthy();
  });

  it("refuses to resolve a share for anyone but its recipient, against real Postgres", async () => {
    // The app-level suite proves this with a stub. This proves it through the real query
    // path, which is where it actually has to hold.
    const slug = `authz-${randomToken(6)}`;
    const pub = new DrizzlePublisher(db);
    const deck = {
      id: "d1",
      title: "Confidential",
      slug,
      workspace: "default",
      kind: "slide-deck",
      slides: [{ id: "s1", layout: "bullets", heading: "Secret", items: ["One"] }],
    };
    await pub.publish({ workspace: "default", slug, kind: "slide-deck", title: "Confidential", ir: deck, author: "op" });
    const share = await pub.createShare({ workspace: "default", slug, recipient: "user@decktrail.orbitqube" });
    const resolve = makeResolveContent(db);

    expect(await resolve(share!.shareId, { email: "user@decktrail.orbitqube", workspace: "default" })).not.toBeNull();
    expect(await resolve(share!.shareId, { email: "other@decktrail.orbitqube", workspace: "default" })).toBeNull();
  });
});
