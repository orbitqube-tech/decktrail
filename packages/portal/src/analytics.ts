/**
 * First-party analytics: the event log and the summaries the sender reads. Umami is out
 * (D2); this is the portal's own model, backed by the `events` table. It records the
 * server-side events and the browser events the beacon posts, and summarises both: opens and
 * who made them, per slide attention from slide_view, and reading depth from deck_complete.
 *
 * Everything the beacon sends is viewer-supplied. sanitizeMeta bounds it on the way in, and
 * summarize bounds it again on the way out (MAX_CREDITED_DWELL_MS), because a number that
 * arrived honestly can still describe something that did not happen, such as a tab left open
 * over a weekend.
 */

/** The portal path the engagement beacon posts browser events to. One authoritative home. */
export const EVENT_INGEST_PATH = "/e";

/** The event types (docs/ARCHITECTURE.md section 6). */
export const EVENT = {
  // Server-side, recorded by the portal itself.
  loginRequested: "login_requested",
  loginSuccess: "login_success",
  deckOpen: "deck_open",
  botBlocked: "bot_blocked",
  denied: "denied",
  // Browser-side, posted by the engagement beacon to EVENT_INGEST_PATH.
  slideView: "slide_view",
  deckComplete: "deck_complete",
  downloadAttempt: "download_attempt",
  copyAttempt: "copy_attempt",
  printAttempt: "print_attempt",
  devtoolsOpen: "devtools_open",
  tripwire: "tripwire",
} as const;

/** The event types the beacon is allowed to post. A viewer cannot inject a server event. */
export const BROWSER_EVENTS: ReadonlySet<string> = new Set([
  EVENT.slideView,
  EVENT.deckComplete,
  EVENT.downloadAttempt,
  EVENT.copyAttempt,
  EVENT.printAttempt,
  EVENT.devtoolsOpen,
  EVENT.tripwire,
]);

/** The meta keys the ingest endpoint accepts from the beacon; everything else is dropped. */
export const ALLOWED_META_KEYS: readonly string[] = [
  "slideId",
  "dwellMs",
  "slidesViewed",
  "totalSlides",
  "completion",
  "reason",
];

/** One event to record. Optional fields are omitted when they do not apply to the event. */
export interface EventInput {
  workspace: string;
  type: string;
  artifactId?: string;
  versionId?: string;
  recipient?: string;
  ip?: string;
  ua?: string;
  meta?: Record<string, unknown>;
}

/** A stored event, with its id and server timestamp. */
export interface EventRecord extends EventInput {
  id: string;
  ts: Date;
}

/** Records events and reads them back per workspace. Injected, so it can be faked in tests. */
export interface EventStore {
  record(e: EventInput): Promise<void>;
  /**
   * Most-recent-first events, capped by limit. Omit the workspace for every workspace, which
   * is what the portal's owner should see: they publish decks under whatever workspace the IR
   * names, so scoping their own dashboard to one guess hides their own traffic from them.
   */
  list(workspace?: string, opts?: { limit?: number }): Promise<EventRecord[]>;
}

/** In-memory store for tests and for a store-free build. */
export class InMemoryEventStore implements EventStore {
  private readonly rows: EventRecord[] = [];
  private seq = 0;

  async record(e: EventInput): Promise<void> {
    this.rows.push({ ...e, id: `evt_${++this.seq}`, ts: new Date() });
  }

  async list(workspace?: string, opts?: { limit?: number }): Promise<EventRecord[]> {
    const all = this.rows.filter((r) => workspace === undefined || r.workspace === workspace).reverse();
    return opts?.limit ? all.slice(0, opts.limit) : all;
  }
}

export interface DeckStat {
  artifactId: string;
  opens: number;
  viewers: number;
  lastOpen: string | null;
}

export interface RecipientStat {
  recipient: string;
  opens: number;
  decks: number;
  firstSeen: string;
  lastSeen: string;
}

export interface BotAttempt {
  ts: string;
  ip: string | null;
  ua: string | null;
}

export interface DailyOpens {
  date: string;
  opens: number;
}

/** Attention on one slide of one artifact, gathered from the beacon's slide_view events. */
export interface SlideStat {
  artifactId: string;
  slideId: string;
  views: number;
  viewers: number;
  /** Sum of credited dwell across every view. See MAX_CREDITED_DWELL_MS. */
  totalDwellMs: number;
  /**
   * The middle view's dwell, not the mean. A deck left open in a background tab produces one
   * enormous reading that drags a mean somewhere no one actually spent time, and the number
   * most people want from this column is "how long does a reader usually stay here".
   */
  medianDwellMs: number;
}

/** How far one person got through one artifact. */
export interface ReadingStat {
  recipient: string;
  artifactId: string;
  /** Distinct slides the beacon saw them on. */
  slidesViewed: number;
  /** The deck's length, as the beacon counted it. Null until a deck_complete arrives. */
  totalSlides: number | null;
  /** The furthest point reached, as a percentage. The beacon sends 0 to 100, not a fraction. */
  completion: number;
  /** Credited dwell summed across their slide views. */
  dwellMs: number;
  /** They reached the last slide. */
  finished: boolean;
}

/** What the sender sees: opens, who and what, over time, plus the protection signals. */
export interface AnalyticsSummary {
  totalOpens: number;
  uniqueViewers: number;
  loginSuccesses: number;
  deniedCount: number;
  byDeck: DeckStat[];
  byRecipient: RecipientStat[];
  opensOverTime: DailyOpens[];
  botAttempts: BotAttempt[];
  /** Per slide attention, most dwelt on first. */
  bySlide: SlideStat[];
  /** Reading depth per person per artifact, furthest first. */
  reading: ReadingStat[];
  /** How many times a reader reached the end of something. */
  completions: number;
}

/**
 * The most time one view of one slide may contribute.
 *
 * The beacon reports dwell when the slide changes or the page goes away, so a deck left open in
 * a tab over a weekend arrives as a single reading of about sixty hours. Counting it would turn
 * "they spent a long time on the pricing slide", which is the sentence this whole feature exists
 * to support, into a lie told with real data. Thirty minutes is longer than anyone reads one
 * slide and short enough that an abandoned tab cannot dominate a total.
 */
export const MAX_CREDITED_DWELL_MS = 30 * 60 * 1000;

/** Longest string value kept from beacon meta, to bound storage of viewer-supplied text. */
const MAX_META_STRING = 200;

/**
 * Sanitise beacon-supplied meta: keep only the allowed keys, coerce numbers, and cap string
 * length. The beacon is viewer-controlled, so its payload is untrusted and bounded here.
 */
export function sanitizeMeta(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== "object") return undefined;
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_META_KEYS) {
    if (!(key in src)) continue;
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "string") out[key] = v.slice(0, MAX_META_STRING);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The middle value of an already sorted list, averaging the two middles when the count is even.
 * Written out rather than inlined so the index reads are guarded rather than asserted: an
 * out-of-range read here would silently produce NaN and show up as a blank column.
 */
function medianOf(sorted: readonly number[], mid: number): number {
  if (sorted.length === 0) return 0;
  const hi = sorted[mid] ?? 0;
  if (sorted.length % 2 === 1) return hi;
  const lo = sorted[mid - 1] ?? hi;
  return Math.round((lo + hi) / 2);
}

/** The calendar day (UTC) of a timestamp, as YYYY-MM-DD. */
function dayOf(ts: Date): string {
  return ts.toISOString().slice(0, 10);
}

/**
 * Summarise a workspace's events for the owner. Pure over the event list, so it is
 * unit-testable and independent of the store. At Wave 1 volume this aggregates in memory;
 * a later slice can push the heavy counts into SQL if a deployment outgrows it.
 */
export function summarize(events: EventRecord[]): AnalyticsSummary {
  const opens = events.filter((e) => e.type === EVENT.deckOpen);

  const deckMap = new Map<string, { opens: number; viewers: Set<string>; lastOpen: Date | null }>();
  const recipientMap = new Map<string, { opens: number; decks: Set<string>; first: Date; last: Date }>();
  const dayMap = new Map<string, number>();

  for (const e of opens) {
    const deckKey = e.artifactId ?? "unknown";
    const deck = deckMap.get(deckKey) ?? { opens: 0, viewers: new Set<string>(), lastOpen: null };
    deck.opens += 1;
    if (e.recipient) deck.viewers.add(e.recipient);
    if (!deck.lastOpen || e.ts > deck.lastOpen) deck.lastOpen = e.ts;
    deckMap.set(deckKey, deck);

    if (e.recipient) {
      const r = recipientMap.get(e.recipient) ?? { opens: 0, decks: new Set<string>(), first: e.ts, last: e.ts };
      r.opens += 1;
      if (e.artifactId) r.decks.add(e.artifactId);
      if (e.ts < r.first) r.first = e.ts;
      if (e.ts > r.last) r.last = e.ts;
      recipientMap.set(e.recipient, r);
    }

    const day = dayOf(e.ts);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }

  const byDeck: DeckStat[] = [...deckMap.entries()]
    .map(([artifactId, d]) => ({ artifactId, opens: d.opens, viewers: d.viewers.size, lastOpen: d.lastOpen ? d.lastOpen.toISOString() : null }))
    .sort((a, b) => b.opens - a.opens);

  const byRecipient: RecipientStat[] = [...recipientMap.entries()]
    .map(([recipient, r]) => ({ recipient, opens: r.opens, decks: r.decks.size, firstSeen: r.first.toISOString(), lastSeen: r.last.toISOString() }))
    .sort((a, b) => b.opens - a.opens);

  const opensOverTime: DailyOpens[] = [...dayMap.entries()]
    .map(([date, count]) => ({ date, opens: count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const botAttempts: BotAttempt[] = events
    .filter((e) => e.type === EVENT.botBlocked)
    .map((e) => ({ ts: e.ts.toISOString(), ip: e.ip ?? null, ua: e.ua ?? null }));

  // ---- reading: the per-slide browser events, rolled up ----------------------------------
  // slide_view carries {slideId, dwellMs}; deck_complete carries {slidesViewed, totalSlides,
  // completion} with completion as a percentage. Both are viewer-supplied and already bounded
  // by sanitizeMeta, so the only thing left to defend against here is an honest tab left open.
  const slideMap = new Map<string, { dwells: number[]; viewers: Set<string> }>();
  const readMap = new Map<
    string,
    { recipient: string; artifactId: string; slides: Set<string>; total: number | null; completion: number; dwellMs: number }
  >();

  // JSON rather than a delimiter, because a slide id or an address is free text and any
  // separator picked by hand is a separator that eventually appears inside a value.
  const readKey = (recipient: string, artifactId: string) => JSON.stringify([recipient, artifactId]);
  const readFor = (recipient: string, artifactId: string) => {
    const k = readKey(recipient, artifactId);
    const r = readMap.get(k) ?? { recipient, artifactId, slides: new Set<string>(), total: null, completion: 0, dwellMs: 0 };
    readMap.set(k, r);
    return r;
  };

  for (const e of events) {
    const artifactId = e.artifactId ?? "unknown";

    if (e.type === EVENT.slideView) {
      const slideId = typeof e.meta?.slideId === "string" ? e.meta.slideId : null;
      if (!slideId) continue;
      const raw = typeof e.meta?.dwellMs === "number" ? e.meta.dwellMs : 0;
      const dwell = Math.min(Math.max(raw, 0), MAX_CREDITED_DWELL_MS);

      const key = JSON.stringify([artifactId, slideId]);
      const s = slideMap.get(key) ?? { dwells: [], viewers: new Set<string>() };
      s.dwells.push(dwell);
      if (e.recipient) s.viewers.add(e.recipient);
      slideMap.set(key, s);

      if (e.recipient) {
        const r = readFor(e.recipient, artifactId);
        r.slides.add(slideId);
        r.dwellMs += dwell;
      }
      continue;
    }

    if (e.type === EVENT.deckComplete && e.recipient) {
      const r = readFor(e.recipient, artifactId);
      const total = typeof e.meta?.totalSlides === "number" ? e.meta.totalSlides : null;
      const pct = typeof e.meta?.completion === "number" ? e.meta.completion : 0;
      if (total !== null) r.total = total;
      // Furthest reached wins, so re-opening and skimming the first slide cannot walk it back.
      if (pct > r.completion) r.completion = Math.min(Math.max(pct, 0), 100);
    }
  }

  const bySlide: SlideStat[] = [...slideMap.entries()]
    .map(([key, s]) => {
      const [artifactId = "unknown", slideId = "unknown"] = JSON.parse(key) as string[];
      const sorted = [...s.dwells].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = medianOf(sorted, mid);
      return {
        artifactId,
        slideId,
        views: s.dwells.length,
        viewers: s.viewers.size,
        totalDwellMs: s.dwells.reduce((a, b) => a + b, 0),
        medianDwellMs: median,
      };
    })
    .sort((a, b) => b.totalDwellMs - a.totalDwellMs);

  const reading: ReadingStat[] = [...readMap.values()]
    .map((r) => ({
      recipient: r.recipient,
      artifactId: r.artifactId,
      slidesViewed: r.slides.size,
      totalSlides: r.total,
      completion: r.completion,
      dwellMs: r.dwellMs,
      finished: r.completion >= 100,
    }))
    .sort((a, b) => b.completion - a.completion || b.dwellMs - a.dwellMs);

  return {
    totalOpens: opens.length,
    uniqueViewers: recipientMap.size,
    loginSuccesses: events.filter((e) => e.type === EVENT.loginSuccess).length,
    deniedCount: events.filter((e) => e.type === EVENT.denied).length,
    byDeck,
    byRecipient,
    opensOverTime,
    botAttempts,
    bySlide,
    reading,
    completions: events.filter((e) => e.type === EVENT.deckComplete).length,
  };
}

/** One CSV field, quoted and escaped. */
/**
 * One CSV field, quoted, and neutered against spreadsheet formula injection.
 *
 * Quoting alone does not help: a spreadsheet unquotes the field first, and then a leading
 * =, +, -, @, tab or carriage return makes it a formula. The user agent and the event meta
 * are attacker-controlled and land in this export, and POST /auth/request needs no
 * authentication, so anyone who can reach the portal could put a live =HYPERLINK or
 * =WEBSERVICE into the owner's own audit log. Prefixing with an apostrophe is the standard
 * defence: the spreadsheet shows the text and evaluates nothing.
 */
function csvField(v: unknown): string {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** The audit log as CSV, newest first, for export. */
export function toCsv(events: EventRecord[]): string {
  const header = ["ts", "type", "workspace", "recipient", "artifact_id", "version_id", "ip", "ua", "meta"];
  const rows = events.map((e) =>
    [e.ts.toISOString(), e.type, e.workspace, e.recipient, e.artifactId, e.versionId, e.ip, e.ua, e.meta].map(csvField).join(","),
  );
  return [header.map(csvField).join(","), ...rows].join("\r\n");
}
