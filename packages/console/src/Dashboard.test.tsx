import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Dashboard } from "./Dashboard";
import type { AnalyticsSummary } from "./types";

/**
 * A realistic AnalyticsSummary, the shape the portal's /admin/analytics endpoint actually
 * returns (packages/portal/src/analytics.ts). opensOverTime and byDeck are left empty on
 * purpose: populating them mounts the chart.js canvases in charts.tsx, and jsdom has no real
 * canvas backend to render into. Every field this harness is asked to cover lives outside those
 * two charts, so the fixture leaves them empty rather than stubbing a canvas the tests do not
 * need.
 */
const summary: AnalyticsSummary = {
  totalOpens: 42,
  uniqueViewers: 17,
  loginSuccesses: 20,
  deniedCount: 3,
  byDeck: [],
  byRecipient: [
    { recipient: "jane@acme-logistics.com", opens: 5, decks: 2, firstSeen: "2026-07-01T00:00:00Z", lastSeen: "2026-07-16T11:40:00Z" },
    { recipient: "bob@acme-logistics.com", opens: 2, decks: 1, firstSeen: "2026-07-02T00:00:00Z", lastSeen: "2026-07-15T09:00:00Z" },
  ],
  opensOverTime: [],
  botAttempts: [
    { ts: "2026-07-16T11:55:00Z", ip: "203.0.113.5", ua: "GPTBot/1.0" },
    { ts: "2026-07-16T09:00:00Z", ip: null, ua: "python-requests/2.31" },
  ],
  bySlide: [
    { artifactId: "deck-1", slideId: "intro", views: 10, viewers: 8, totalDwellMs: 120000, medianDwellMs: 15000 },
    { artifactId: "deck-1", slideId: "pricing", views: 7, viewers: 6, totalDwellMs: 90000, medianDwellMs: 12000 },
  ],
  reading: [
    { recipient: "jane@acme-logistics.com", artifactId: "deck-1", slidesViewed: 9, totalSlides: 9, completion: 100, dwellMs: 200000, finished: true },
    { recipient: "bob@acme-logistics.com", artifactId: "deck-1", slidesViewed: 4, totalSlides: 9, completion: 44, dwellMs: 60000, finished: false },
  ],
  completions: 6,
  copyAttempts: 4,
  printAttempts: 1,
  downloadAttempts: 0,
  tripwires: 3,
  tripwireReasons: { contextmenu: 2, selection: 1 },
};

/**
 * The value shown in a tile, found by its label text, the way a person reads the screen.
 *
 * "Scrape attempts" is both a tile label and, further down the page, a table heading over the
 * same bot attempts, so this narrows to the tile's own label element (div.k inside .tile)
 * rather than the first text match anywhere on the page.
 */
function tileValue(label: string | RegExp): string {
  const candidates = screen.getAllByText(label).filter((el) => el.classList.contains("k") && el.closest(".tile"));
  // Destructured rather than checked on .length, because a length comparison does not narrow the
  // element type and this package compiles with unchecked index access turned off.
  const [only, ...rest] = candidates;
  if (!only || rest.length > 0) {
    throw new Error(`expected exactly one tile labelled "${String(label)}", found ${candidates.length}`);
  }
  const tile = only.closest(".tile") as HTMLElement;
  const valueEl = tile.querySelector(".v");
  if (!valueEl) throw new Error(`tile for "${String(label)}" has no value element`);
  return valueEl.textContent ?? "";
}

beforeEach(() => {
  // ago() in format.ts measures against Date.now() when no reference time is passed, and
  // Dashboard.tsx calls it that way. Pin the clock so "20m ago" and "1d ago" below are not
  // flaky against wall-clock time.
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-16T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Dashboard tiles", () => {
  it("shows every top tile label next to the value from the data", () => {
    render(<Dashboard data={summary} />);
    expect(tileValue("Deck opens")).toBe("42");
    expect(tileValue("Unique viewers")).toBe("17");
    expect(tileValue("Read to the end")).toBe("6");
    expect(tileValue("Refused")).toBe("3");
    expect(tileValue("Scrape attempts")).toBe("2");
  });

  it("shows the viewer attempts tiles next to the value from the data", () => {
    render(<Dashboard data={summary} />);
    expect(tileValue("Copy attempts")).toBe("4");
    expect(tileValue("Print attempts")).toBe("1");
    expect(tileValue("Download attempts")).toBe("0");
    expect(tileValue("Tripwires")).toBe("3");
  });

  it("labels scrape attempts from the length of the bot attempt list, not a separate count", () => {
    // The tile has no field of its own: Dashboard.tsx reads data.botAttempts.length. A fixture
    // whose array length and any separate count disagree would catch that regressing.
    render(<Dashboard data={summary} />);
    expect(tileValue("Scrape attempts")).toBe(String(summary.botAttempts.length));
  });
});

describe("Viewer attempts panel", () => {
  it("renders the panel heading and all four of its tiles", () => {
    // This is the panel the mutation step deletes. If "Viewer attempts" disappears, this
    // getByRole throws and the suite goes red before a single tile assertion even runs.
    render(<Dashboard data={summary} />);
    expect(screen.getByRole("heading", { name: "Viewer attempts" })).toBeInTheDocument();
    expect(tileValue("Copy attempts")).toBe("4");
    expect(tileValue("Print attempts")).toBe("1");
    expect(tileValue("Download attempts")).toBe("0");
    expect(tileValue("Tripwires")).toBe("3");
  });

  it("renders the tripwire breakdown by reason, most frequent first", () => {
    render(<Dashboard data={summary} />);
    expect(screen.getByText("contextmenu 2, selection 1")).toBeInTheDocument();
  });
});

describe("Attention panel (where the time went)", () => {
  it("renders a row per slide with its views, typical dwell and total dwell", () => {
    render(<Dashboard data={summary} />);

    const introRow = screen.getByText("intro").closest("tr");
    expect(introRow).not.toBeNull();
    expect(introRow).toHaveTextContent("10");
    expect(introRow).toHaveTextContent("15s");
    expect(introRow).toHaveTextContent("2m");

    const pricingRow = screen.getByText("pricing").closest("tr");
    expect(pricingRow).not.toBeNull();
    expect(pricingRow).toHaveTextContent("7");
    expect(pricingRow).toHaveTextContent("12s");
    expect(pricingRow).toHaveTextContent("1m 30s");
  });
});

describe("Depth panel (how far they got)", () => {
  it("renders a row per recipient with completion, slides read and time spent", () => {
    render(<Dashboard data={summary} />);
    const panel = screen.getByRole("heading", { name: "How far they got" }).closest("section");
    expect(panel).not.toBeNull();
    const scoped = within(panel as HTMLElement);

    const janeRow = scoped.getByText("jane@acme-logistics.com").closest("tr");
    expect(janeRow).not.toBeNull();
    expect(janeRow).toHaveTextContent("all of it");
    expect(janeRow).toHaveTextContent("9 / 9");
    expect(janeRow).toHaveTextContent("3m 20s");

    const bobRow = scoped.getByText("bob@acme-logistics.com").closest("tr");
    expect(bobRow).not.toBeNull();
    expect(bobRow).toHaveTextContent("44%");
    expect(bobRow).toHaveTextContent("4 / 9");
    expect(bobRow).toHaveTextContent("1m");
  });
});

describe("Who is reading panel", () => {
  it("renders a row per recipient with opens and last seen", () => {
    render(<Dashboard data={summary} />);
    const panel = screen.getByRole("heading", { name: "Who is reading" }).closest("section");
    expect(panel).not.toBeNull();
    const scoped = within(panel as HTMLElement);

    const janeRow = scoped.getByText("jane@acme-logistics.com").closest("tr");
    expect(janeRow).not.toBeNull();
    expect(janeRow).toHaveTextContent("5");
    expect(janeRow).toHaveTextContent("20m ago");

    const bobRow = scoped.getByText("bob@acme-logistics.com").closest("tr");
    expect(bobRow).not.toBeNull();
    expect(bobRow).toHaveTextContent("2");
    expect(bobRow).toHaveTextContent("1d ago");
  });
});

describe("Scrape attempts table", () => {
  it("renders a row per bot attempt with its IP and agent", () => {
    render(<Dashboard data={summary} />);
    const table = screen.getByRole("heading", { name: "Scrape attempts" }).closest("section");
    expect(table).not.toBeNull();
    const scoped = within(table as HTMLElement);
    expect(scoped.getByText("203.0.113.5")).toBeInTheDocument();
    expect(scoped.getByText("GPTBot/1.0")).toBeInTheDocument();
    expect(scoped.getByText("unknown")).toBeInTheDocument();
    expect(scoped.getByText("python-requests/2.31")).toBeInTheDocument();
  });
});

describe("Empty states", () => {
  it("falls back to the empty message when a panel has no data", () => {
    const empty: AnalyticsSummary = {
      ...summary,
      byRecipient: [],
      bySlide: [],
      reading: [],
      botAttempts: [],
    };
    render(<Dashboard data={empty} />);
    expect(screen.getByText("No readers yet.")).toBeInTheDocument();
    expect(screen.getByText("Nothing read yet. This fills in as people move through a deck.")).toBeInTheDocument();
    expect(screen.getByText("No reading recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("None so far. Nobody has tried to scrape your decks.")).toBeInTheDocument();
  });
});
