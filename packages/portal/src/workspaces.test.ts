import { describe, it, expect } from "vitest";
import { InMemoryThemeAdmin } from "./themes.js";
import { InMemoryEventStore, summarize, EVENT } from "./analytics.js";

/**
 * A workspace is a client (D23). The portal's owner works across all of their clients, so
 * every owner-facing read spans every workspace unless one is asked for.
 *
 * These exist because the opposite cost us four bugs in one session. Publish takes the
 * workspace from the IR, so a real deck lands under its client's name, while every owner
 * surface guessed "default" and quietly showed an empty page: the console listed no artifacts
 * to theme, and the analytics dashboard reported no opens while a client was reading.
 */

const deck = (id: string, workspace: string) => ({
  id,
  title: `Deck ${id}`,
  slug: id,
  kind: "slide-deck",
  themeId: null,
  workspace,
});

describe("the owner sees every client", () => {
  function seeded() {
    const admin = new InMemoryThemeAdmin();
    admin.seedArtifact(deck("a1", "acme"));
    admin.seedArtifact(deck("a2", "globex"));
    admin.seedArtifact(deck("a3", "acme"));
    return admin;
  }

  it("lists artifacts across all clients when none is named", async () => {
    const all = await seeded().listArtifacts();
    expect(all.map((a) => a.id).sort()).toEqual(["a1", "a2", "a3"]);
  });

  it("narrows to one client when asked", async () => {
    const some = await seeded().listArtifacts("acme");
    expect(some.map((a) => a.id).sort()).toEqual(["a1", "a3"]);
  });

  it("reports which client each artifact belongs to, so the console can group them", async () => {
    const all = await seeded().listArtifacts();
    expect(all.find((a) => a.id === "a2")?.workspace).toBe("globex");
  });

  it("lists the distinct clients for the switcher", async () => {
    expect(await seeded().listWorkspaces()).toEqual(["acme", "globex"]);
  });
});

describe("writes key on the id, never on a guessed client", () => {
  it("assigns a theme to an artifact in any client", async () => {
    const admin = new InMemoryThemeAdmin();
    admin.seedArtifact(deck("a1", "acme"));
    await admin.assignTheme("a1", "thm_1");
    expect((await admin.listArtifacts())[0]?.themeId).toBe("thm_1");
  });

  it("deletes a theme and clears it from artifacts in every client", async () => {
    const admin = new InMemoryThemeAdmin();
    admin.seedArtifact(deck("a1", "acme"));
    admin.seedArtifact(deck("a2", "globex"));
    const t = await admin.saveTheme("acme", { name: "Brand", theme: {} });
    await admin.assignTheme("a1", t.id);
    await admin.assignTheme("a2", t.id);

    await admin.deleteTheme(t.id);
    const after = await admin.listArtifacts();
    expect(after.every((a) => a.themeId === null)).toBe(true);
    expect(await admin.listThemes()).toEqual([]);
  });

  it("keeps a theme in its own client when updated", async () => {
    const admin = new InMemoryThemeAdmin();
    const t = await admin.saveTheme("acme", { name: "Brand", theme: {} });
    await admin.saveTheme("globex", { id: t.id, name: "Renamed", theme: {} });
    // The update keys on the id; it must not migrate the theme to another client.
    expect(await admin.listThemes("acme")).toHaveLength(1);
    expect(await admin.listThemes("globex")).toHaveLength(0);
  });
});

describe("analytics spans every client", () => {
  async function seededEvents() {
    const events = new InMemoryEventStore();
    await events.record({ workspace: "acme", type: EVENT.deckOpen, recipient: "user@decktrail.orbitqube", artifactId: "a1" });
    await events.record({ workspace: "globex", type: EVENT.deckOpen, recipient: "other@decktrail.orbitqube", artifactId: "a2" });
    return events;
  }

  it("summarises every client's opens when no client is named", async () => {
    const s = summarize(await (await seededEvents()).list());
    expect(s.totalOpens).toBe(2);
    expect(s.uniqueViewers).toBe(2);
  });

  it("narrows to one client when asked", async () => {
    const s = summarize(await (await seededEvents()).list("globex"));
    expect(s.totalOpens).toBe(1);
    expect(s.byRecipient[0]?.recipient).toBe("other@decktrail.orbitqube");
  });
});
