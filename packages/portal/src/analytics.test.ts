import { describe, it, expect } from "vitest";
import { EVENT, summarize, toCsv, InMemoryEventStore, MAX_CREDITED_DWELL_MS, type EventRecord } from "./analytics.js";

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

describe("summarize, the protection signals", () => {
  it("counts copy, print and download attempts, and tripwires by reason", () => {
    const events: EventRecord[] = [
      ev({ type: EVENT.copyAttempt, ts: "2026-07-14T10:00:00Z", artifactId: "deck1", recipient: "priya@acme.example" }),
      ev({ type: EVENT.copyAttempt, ts: "2026-07-14T10:01:00Z", artifactId: "deck1", recipient: "sam@acme.example" }),
      ev({ type: EVENT.printAttempt, ts: "2026-07-14T10:02:00Z", artifactId: "deck1", recipient: "priya@acme.example" }),
      ev({ type: EVENT.downloadAttempt, ts: "2026-07-14T10:03:00Z", artifactId: "deck1", recipient: "priya@acme.example" }),
      ev({ type: EVENT.tripwire, ts: "2026-07-14T10:04:00Z", artifactId: "deck1", recipient: "priya@acme.example", meta: { reason: "contextmenu" } }),
      ev({ type: EVENT.tripwire, ts: "2026-07-14T10:05:00Z", artifactId: "deck1", recipient: "sam@acme.example", meta: { reason: "contextmenu" } }),
      ev({ type: EVENT.tripwire, ts: "2026-07-14T10:06:00Z", artifactId: "deck1", recipient: "priya@acme.example", meta: { reason: "selection" } }),
      // An unrelated event type must not inflate any of the counts above.
      ev({ type: EVENT.slideView, ts: "2026-07-14T10:07:00Z", artifactId: "deck1", recipient: "priya@acme.example", meta: { slideId: "cover", dwellMs: 1000 } }),
    ];
    const s = summarize(events);
    expect(s.copyAttempts).toBe(2);
    expect(s.printAttempts).toBe(1);
    expect(s.downloadAttempts).toBe(1);
    expect(s.tripwires).toBe(3);
    expect(s.tripwireReasons).toEqual({ contextmenu: 2, selection: 1 });
  });

  it("counts none of the protection signals when no such event was ever recorded", () => {
    const s = summarize([
      ev({ type: EVENT.slideView, ts: "2026-07-14T10:00:00Z", artifactId: "deck1", recipient: "priya@acme.example", meta: { slideId: "cover", dwellMs: 1000 } }),
    ]);
    expect(s.copyAttempts).toBe(0);
    expect(s.printAttempts).toBe(0);
    expect(s.downloadAttempts).toBe(0);
    expect(s.tripwires).toBe(0);
    expect(s.tripwireReasons).toEqual({});
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

describe("summarize, the per-slide reading", () => {
  const MIN = 60_000;
  const events: EventRecord[] = [
    // Priya reads three slides and finishes.
    ev({ type: EVENT.slideView, ts: "2026-07-14T10:00:00Z", artifactId: "deck1", recipient: "priya@acme.example", meta: { slideId: "cover", dwellMs: 20_000 } }),
    ev({ type: EVENT.slideView, ts: "2026-07-14T10:01:00Z", artifactId: "deck1", recipient: "priya@acme.example", meta: { slideId: "pricing", dwellMs: 3 * MIN } }),
    ev({ type: EVENT.slideView, ts: "2026-07-14T10:05:00Z", artifactId: "deck1", recipient: "priya@acme.example", meta: { slideId: "close", dwellMs: 30_000 } }),
    ev({ type: EVENT.deckComplete, ts: "2026-07-14T10:06:00Z", artifactId: "deck1", recipient: "priya@acme.example", meta: { slidesViewed: 3, totalSlides: 3, completion: 100 } }),
    // Sam bails a third of the way in, and dwells hard on pricing too.
    ev({ type: EVENT.slideView, ts: "2026-07-15T09:00:00Z", artifactId: "deck1", recipient: "sam@acme.example", meta: { slideId: "cover", dwellMs: 10_000 } }),
    ev({ type: EVENT.slideView, ts: "2026-07-15T09:01:00Z", artifactId: "deck1", recipient: "sam@acme.example", meta: { slideId: "pricing", dwellMs: 5 * MIN } }),
    ev({ type: EVENT.deckComplete, ts: "2026-07-15T09:07:00Z", artifactId: "deck1", recipient: "sam@acme.example", meta: { slidesViewed: 2, totalSlides: 3, completion: 66 } }),
  ];
  const s = summarize(events);

  it("counts a completion per deck_complete", () => {
    expect(s.completions).toBe(2);
  });

  it("ranks slides by the attention they actually held", () => {
    expect(s.bySlide[0].slideId).toBe("pricing");
    expect(s.bySlide[0].artifactId).toBe("deck1");
    expect(s.bySlide[0].views).toBe(2);
    expect(s.bySlide[0].viewers).toBe(2);
    expect(s.bySlide[0].totalDwellMs).toBe(8 * MIN);
  });

  it("reports how far each person got, furthest first", () => {
    expect(s.reading.map((r) => r.recipient)).toEqual(["priya@acme.example", "sam@acme.example"]);
    const priya = s.reading[0];
    expect(priya.slidesViewed).toBe(3);
    expect(priya.totalSlides).toBe(3);
    expect(priya.completion).toBe(100);
    expect(priya.finished).toBe(true);
    expect(priya.dwellMs).toBe(20_000 + 3 * MIN + 30_000);
    expect(s.reading[1].finished).toBe(false);
    expect(s.reading[1].completion).toBe(66);
  });

  // The number this feature exists to support is "they spent a long time on pricing". A tab left
  // open overnight would otherwise answer that question with sixty hours.
  it("does not credit a deck left open in a background tab", () => {
    const abandoned = summarize([
      ev({ type: EVENT.slideView, ts: "2026-07-14T10:00:00Z", artifactId: "d", recipient: "a@b.c", meta: { slideId: "s1", dwellMs: 60 * 60 * 1000 } }),
    ]);
    expect(abandoned.bySlide[0].totalDwellMs).toBe(MAX_CREDITED_DWELL_MS);
    expect(abandoned.reading[0].dwellMs).toBe(MAX_CREDITED_DWELL_MS);
  });

  it("takes the middle reading rather than the mean, so one long view cannot move it", () => {
    const skewed = summarize([
      ev({ type: EVENT.slideView, ts: "2026-07-14T10:00:00Z", artifactId: "d", recipient: "a@b.c", meta: { slideId: "s1", dwellMs: 1000 } }),
      ev({ type: EVENT.slideView, ts: "2026-07-14T10:01:00Z", artifactId: "d", recipient: "b@b.c", meta: { slideId: "s1", dwellMs: 2000 } }),
      ev({ type: EVENT.slideView, ts: "2026-07-14T10:02:00Z", artifactId: "d", recipient: "c@b.c", meta: { slideId: "s1", dwellMs: 20 * MIN } }),
    ]);
    expect(skewed.bySlide[0].medianDwellMs).toBe(2000);
  });

  it("keeps the furthest point reached when somebody reopens and skims", () => {
    const reopened = summarize([
      ev({ type: EVENT.deckComplete, ts: "2026-07-14T10:00:00Z", artifactId: "d", recipient: "a@b.c", meta: { slidesViewed: 9, totalSlides: 10, completion: 90 } }),
      ev({ type: EVENT.deckComplete, ts: "2026-07-16T10:00:00Z", artifactId: "d", recipient: "a@b.c", meta: { slidesViewed: 1, totalSlides: 10, completion: 10 } }),
    ]);
    expect(reopened.reading[0].completion).toBe(90);
  });

  it("ignores a slide_view with no slide id rather than inventing one", () => {
    const junk = summarize([
      ev({ type: EVENT.slideView, ts: "2026-07-14T10:00:00Z", artifactId: "d", recipient: "a@b.c", meta: { dwellMs: 5000 } }),
    ]);
    expect(junk.bySlide).toEqual([]);
  });

  it("separates the same slide id in two different decks", () => {
    const two = summarize([
      ev({ type: EVENT.slideView, ts: "2026-07-14T10:00:00Z", artifactId: "deckA", recipient: "a@b.c", meta: { slideId: "cover", dwellMs: 1000 } }),
      ev({ type: EVENT.slideView, ts: "2026-07-14T10:00:00Z", artifactId: "deckB", recipient: "a@b.c", meta: { slideId: "cover", dwellMs: 1000 } }),
    ]);
    expect(two.bySlide).toHaveLength(2);
    expect(two.bySlide.map((s) => s.artifactId).sort()).toEqual(["deckA", "deckB"]);
  });
});
