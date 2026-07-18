import { describe, it, expect } from "vitest";
import { makeResolveContent } from "./content.js";
import type { Db } from "./db/client.js";
import { shares, deckVersions, artifacts, themes } from "./db/schema.js";

/**
 * Tests for the serving authorisation path.
 *
 * This function had no test at all, and that is why it shipped without checking that the
 * viewer is the share's recipient. Any signed-in address could open any share by URL, and be
 * watermarked with their own name while reading someone else's deck. Driving a real deck
 * through the portal found it; nothing in the suite could have.
 */

const DECK = {
  id: "d1",
  title: "Introduction",
  slug: "introduction",
  workspace: "orbitqube",
  kind: "slide-deck",
  slides: [{ id: "s1", layout: "bullets", heading: "Scope", items: ["One"] }],
};

/** A Drizzle-shaped stub: each select() resolves against the table it is given. */
function stubDb(rows: { shares?: unknown[]; deckVersions?: unknown[]; artifacts?: unknown[]; themes?: unknown[] }) {
  const seen: string[] = [];
  const name = (t: unknown) =>
    t === shares ? "shares" : t === deckVersions ? "deckVersions" : t === artifacts ? "artifacts" : "themes";
  const db = {
    select: () => ({
      from: (t: unknown) => {
        const key = name(t);
        seen.push(key);
        const result = (rows as Record<string, unknown[]>)[key] ?? [];
        const chain = { where: () => chain, limit: () => Promise.resolve(result) };
        return chain;
      },
    }),
  };
  return { db: db as unknown as Db, seen };
}

const share = {
  shareId: "shr_1",
  artifactId: "art_1",
  versionId: "ver_1",
  recipient: "user@decktrail.orbitqube",
  revokedAt: null,
};
const version = { id: "ver_1", artifactId: "art_1", version: 1, ir: DECK, theme: null };
const artifact = { id: "art_1", workspace: "orbitqube", slug: "introduction", kind: "slide-deck", themeId: null };

describe("who may open a share", () => {
  it("serves the deck to the recipient it was shared with", async () => {
    const { db } = stubDb({ shares: [share], deckVersions: [version], artifacts: [artifact] });
    const resolved = await makeResolveContent(db)("shr_1", { email: "user@decktrail.orbitqube", workspace: "orbitqube" });
    expect(resolved).not.toBeNull();
    expect(resolved?.artifactId).toBe("art_1");
    expect(resolved?.html).toContain("user@decktrail.orbitqube"); // watermarked to them
  });

  it("refuses a different signed-in viewer holding the same share id", async () => {
    const { db, seen } = stubDb({ shares: [share], deckVersions: [version], artifacts: [artifact] });
    const resolved = await makeResolveContent(db)("shr_1", { email: "other@decktrail.orbitqube", workspace: "default" });
    expect(resolved).toBeNull();
    // It must stop at the share. Loading the version would mean the check came too late to
    // matter, or was bolted on somewhere the content had already been fetched.
    expect(seen).toEqual(["shares"]);
  });

  it("is not case sensitive about the recipient", async () => {
    const { db } = stubDb({ shares: [share], deckVersions: [version], artifacts: [artifact] });
    const resolved = await makeResolveContent(db)("shr_1", { email: "User@DeckTrail.OrbitQube", workspace: "orbitqube" });
    expect(resolved).not.toBeNull();
  });

  it("returns null for an unknown share", async () => {
    const { db } = stubDb({ shares: [] });
    expect(await makeResolveContent(db)("nope", { email: "user@decktrail.orbitqube", workspace: "orbitqube" })).toBeNull();
  });

  it("returns null, not a 403, so a real share id looks like a fake one", async () => {
    // Distinguishing "not yours" from "does not exist" would confirm a share id is real and
    // leak that this portal serves that recipient. Both must be the same plain null.
    const real = stubDb({ shares: [share], deckVersions: [version], artifacts: [artifact] });
    const fake = stubDb({ shares: [] });
    const viewer = { email: "other@decktrail.orbitqube", workspace: "default" };
    expect(await makeResolveContent(real.db)("shr_1", viewer)).toBe(
      await makeResolveContent(fake.db)("nope", viewer),
    );
  });
});
