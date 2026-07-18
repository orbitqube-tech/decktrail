/**
 * First-party analytics: the event log and the summaries the sender reads. Umami is out
 * (D2); this is the portal's own model, backed by the `events` table. This slice records
 * the server-side events; the per-slide browser events (slide_view, deck_complete, and the
 * protection tripwires) are a following slice, and land in the same store and summary.
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
}

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

  return {
    totalOpens: opens.length,
    uniqueViewers: recipientMap.size,
    loginSuccesses: events.filter((e) => e.type === EVENT.loginSuccess).length,
    deniedCount: events.filter((e) => e.type === EVENT.denied).length,
    byDeck,
    byRecipient,
    opensOverTime,
    botAttempts,
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
