import { describe, it, expect } from "vitest";
import { EVENT, summarize, toCsv, InMemoryEventStore, type EventRecord } from "./analytics.js";

function ev(over: Partial<EventRecord> & { type: string; ts: string }): EventRecord {
  return {
    id: over.id ?? "e",
    workspace: over.workspace ?? "default",
    type: over.type,
    ts: new Date(over.ts),
    artifactId: over.artifactId,
    versionId: over.versionId,
    recipient: over.recipient,
    ip: over.ip,
    ua: over.ua,
    meta: over.meta,
  };
}

describe("summarize", () => {
  const events: EventRecord[] = [
    ev({ type: EVENT.deckOpen, ts: "2026-07-14T10:00:00Z", artifactId: "deck1", recipient: "user@decktrail.orbitqube" }),
    ev({ type: EVENT.deckOpen, ts: "2026-07-14T12:00:00Z", artifactId: "deck1", recipient: "user@decktrail.orbitqube" }),
    ev({ type: EVENT.deckOpen, ts: "2026-07-15T09:00:00Z", artifactId: "deck1", recipient: "b@acme.com" }),
    ev({ type: EVENT.deckOpen, ts: "2026-07-15T09:30:00Z", artifactId: "deck2", recipient: "b@acme.com" }),
    ev({ type: EVENT.loginSuccess, ts: "2026-07-14T09:59:00Z", recipient: "user@decktrail.orbitqube" }),
    ev({ type: EVENT.denied, ts: "2026-07-14T08:00:00Z", recipient: "strangeuser@decktrail.orbitqube" }),
    ev({ type: EVENT.botBlocked, ts: "2026-07-15T02:00:00Z", ip: "9.9.9.9", ua: "GPTBot/1.0" }),
  ];
  const s = summarize(events);

  it("counts total opens and unique viewers", () => {
    expect(s.totalOpens).toBe(4);
    expect(s.uniqueViewers).toBe(2);
    expect(s.loginSuccesses).toBe(1);
    expect(s.deniedCount).toBe(1);
  });

  it("ranks decks by opens with viewer counts", () => {
    expect(s.byDeck[0]).toMatchObject({ artifactId: "deck1", opens: 3, viewers: 2 });
    expect(s.byDeck.find((d) => d.artifactId === "deck2")).toMatchObject({ opens: 1, viewers: 1 });
  });

  it("gives per-recipient engagement with first and last seen", () => {
    const a = s.byRecipient.find((r) => r.recipient === "user@decktrail.orbitqube");
    expect(a).toMatchObject({ opens: 2, decks: 1 });
    expect(a?.firstSeen).toBe("2026-07-14T10:00:00.000Z");
    expect(a?.lastSeen).toBe("2026-07-14T12:00:00.000Z");
    const b = s.byRecipient.find((r) => r.recipient === "b@acme.com");
    expect(b).toMatchObject({ opens: 2, decks: 2 });
  });

  it("buckets opens by day", () => {
    expect(s.opensOverTime).toEqual([
      { date: "2026-07-14", opens: 2 },
      { date: "2026-07-15", opens: 2 },
    ]);
  });

  it("surfaces bot attempts as a first-class list", () => {
    expect(s.botAttempts).toEqual([{ ts: "2026-07-15T02:00:00.000Z", ip: "9.9.9.9", ua: "GPTBot/1.0" }]);
  });
});

describe("toCsv", () => {
  it("writes a header and escapes quotes and embedded commas", () => {
    const csv = toCsv([ev({ type: EVENT.deckOpen, ts: "2026-07-14T10:00:00Z", recipient: "user@decktrail.orbitqube", ua: 'X, "Y"' })]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain('"ts","type","workspace"');
    expect(lines[1]).toContain('"deck_open"');
    expect(lines[1]).toContain('"user@decktrail.orbitqube"');
    expect(lines[1]).toContain('"X, ""Y"""'); // comma kept inside the quoted field, quotes doubled
  });
});

describe("InMemoryEventStore", () => {
  it("records and lists per workspace, newest first", async () => {
    const store = new InMemoryEventStore();
    await store.record({ workspace: "w1", type: EVENT.deckOpen, recipient: "a" });
    await store.record({ workspace: "w2", type: EVENT.deckOpen, recipient: "b" });
    await store.record({ workspace: "w1", type: EVENT.loginSuccess, recipient: "a" });
    const w1 = await store.list("w1");
    expect(w1.map((e) => e.type)).toEqual([EVENT.loginSuccess, EVENT.deckOpen]);
    expect(await store.list("w2")).toHaveLength(1);
  });

  it("honours the limit", async () => {
    const store = new InMemoryEventStore();
    for (let i = 0; i < 5; i++) await store.record({ workspace: "w", type: EVENT.deckOpen });
    expect(await store.list("w", { limit: 2 })).toHaveLength(2);
  });
});

describe("CSV export cannot carry a formula into the owner's spreadsheet", () => {
  // Verified against the running portal: a User-Agent of =HYPERLINK("http://evil","click")
  // on an unauthenticated POST /auth/request landed, live, in the owner's own audit export.
  // Quoting does not help; a spreadsheet unquotes the field and then evaluates a leading =.
  const rowWith = (ua: string) =>
    toCsv([{ id: "e1", ts: new Date(0), workspace: "w", type: "login_requested", ua }] as never);

  it("defuses a formula in the user agent", () => {
    const csv = rowWith('=HYPERLINK("http://evil.example","click")');
    expect(csv).toContain(`"'=HYPERLINK`); // apostrophe-prefixed: shown, not run
    expect(csv).not.toMatch(/"=HYPERLINK/);
  });

  it("defuses every formula lead-in a spreadsheet honours", () => {
    for (const lead of ["=", "+", "-", "@"]) {
      expect(rowWith(`${lead}cmd`)).toContain(`"'${lead}cmd"`);
    }
  });

  it("leaves ordinary text alone", () => {
    const csv = rowWith("Mozilla/5.0 (Windows NT 10.0)");
    expect(csv).toContain('"Mozilla/5.0 (Windows NT 10.0)"');
    expect(csv).not.toContain("'Mozilla");
  });

  it("still escapes embedded quotes", () => {
    expect(rowWith('a "quoted" ua')).toContain('"a ""quoted"" ua"');
  });
});
