import { describe, it, expect } from "vitest";
import { Voice, Tone, State } from "@decktrail/ir";
import {
  generateDeck,
  extractJson,
  buildGeneratePrompt,
  DEFAULT_VOICE_BLOCK,
  createProvider,
  createClaudeProvider,
  createOpenCodeProvider,
  openCodeArgs,
  isProviderId,
  spawnText,
  PROVIDER_IDS,
  DEFAULT_PROVIDER_ID,
  type GenerationProvider,
} from "./index.js";

/** A provider whose answers are scripted, so the pipeline can be tested without a model. */
function providerOf(run: (prompt: string) => Promise<string>): GenerationProvider {
  return { id: "test", describe: () => "test", run: (prompt) => run(prompt) };
}

describe("generation voice", () => {
  it("uses the neutral default voice when none is given", () => {
    const prompt = buildGeneratePrompt("some content");
    expect(prompt).toContain(DEFAULT_VOICE_BLOCK);
    expect(prompt).toContain("some content");
    // The default must NOT bake in a personal style like banning em dashes or a fixed locale.
    expect(prompt).not.toContain("no em dashes");
    expect(prompt).not.toContain("INR");
  });

  it("renders a configured voice into the prompt", () => {
    const voice = Voice.parse({
      name: "Acme",
      audience: "senior Indian decision makers",
      tone: "measured, professional",
      forbidden: ["em dashes", "hype"],
      preferred: ["plain business English"],
      locale: { currency: "INR", dates: "Asia/Kolkata" },
      instructions: "State the fact. Never sell yourself in writing.",
    });
    const prompt = buildGeneratePrompt("content", voice);
    expect(prompt).toContain("Audience: senior Indian decision makers");
    expect(prompt).toContain("Never use: em dashes; hype");
    expect(prompt).toContain("Prefer: plain business English");
    expect(prompt).toContain("currency INR");
    expect(prompt).toContain("Never sell yourself in writing");
    expect(prompt).not.toContain(DEFAULT_VOICE_BLOCK);
  });
});

describe("extractJson", () => {
  it("pulls a JSON object out of surrounding model text", () => {
    expect(extractJson('here is the deck: {"a":1} done')).toEqual({ a: 1 });
  });
});

describe("who a generated deck is for", () => {
  // A workspace is the client the deck goes to, and it groups a sender's decks in the console
  // (D23). Left to inference it is a guess: asked about a deck written by the sender, the model
  // answered with the sender's own name, so every deck landed in one useless group.
  it("tells the model the workspace is the client, not the sender", () => {
    const p = buildGeneratePrompt("content");
    expect(p).toContain("the CLIENT this deck is for");
    expect(p).toContain("who the deck is going TO, never who is sending it");
    expect(p).toContain('use "default"');
  });
});

describe("repairing a deck that did not validate", () => {
  // A valid deck, and the same deck with one field wrong: a swimlane state the schema does not
  // accept. This is not hypothetical, it is what the first real corpus actually produced.
  const good = {
    id: "d1", title: "T", slug: "t", workspace: "acme", kind: "slide-deck",
    slides: [{ id: "s1", layout: "bullets", heading: "H", items: ["a"] }],
  };
  const broken = { ...good, slides: [{ id: "s1", layout: "stat-grid", heading: "H", stats: [{ value: "3", label: "l", state: "at risk" }] }] };

  it("hands the errors back and keeps the deck when the repair lands", async () => {
    const seen: string[] = [];
    const provider = providerOf(async (p) => {
      seen.push(p);
      return seen.length === 1 ? JSON.stringify(broken) : JSON.stringify(good);
    });
    const deck = await generateDeck("content", undefined, undefined, { provider });

    expect(deck.slides[0].layout).toBe("bullets");
    expect(seen).toHaveLength(2);
    // The repair call must carry both the invalid JSON and the validator's own error path,
    // otherwise the model is guessing at what to fix.
    expect(seen[1]).toContain("at risk");
    expect(seen[1]).toMatch(/"state"/);
  });

  it("reports each repair attempt, since every one is another slow call", async () => {
    const attempts: number[] = [];
    let n = 0;
    const provider = providerOf(async () => (++n < 3 ? JSON.stringify(broken) : JSON.stringify(good)));
    await generateDeck("content", undefined, undefined, { provider, onRetry: (a) => attempts.push(a) });
    expect(attempts).toEqual([1, 2]);
  });

  it("gives up with the real schema errors rather than looping forever", async () => {
    let calls = 0;
    const provider = providerOf(async () => {
      calls += 1;
      return JSON.stringify(broken);
    });
    await expect(generateDeck("content", undefined, undefined, { provider })).rejects.toThrow(/at risk|state/i);
    // One generation plus the default repair attempts, and then it stops.
    expect(calls).toBe(3);
  });

  it("honours a configured repair budget instead of the built-in one", async () => {
    // The retry count used to be a constant in the source, so an operator on a slow local model
    // could not trade attempts for time without editing the package.
    let calls = 0;
    const provider = providerOf(async () => {
      calls += 1;
      return JSON.stringify(broken);
    });
    await expect(
      generateDeck("content", undefined, undefined, { provider, repairAttempts: 0 }),
    ).rejects.toThrow(/could not be repaired/);
    expect(calls).toBe(1);
  });

  it("repairs output that is not JSON at all, which is the most repairable failure there is", async () => {
    // A real 34 KB source came back with a syntax error at position 10977. extractJson threw
    // before the loop could see it, so the one failure a model is best placed to fix mechanically
    // was the one failure that got no second chance.
    const seen: string[] = [];
    let n = 0;
    const provider = providerOf(async (p) => {
      seen.push(p);
      return ++n === 1 ? '{"id":"d","title":"T",,,"slides":[' : JSON.stringify(good);
    });
    const deck = await generateDeck("content", undefined, undefined, { provider });
    expect(deck.slides[0].layout).toBe("bullets");
    expect(seen).toHaveLength(2);
    // And the repair call must say what was wrong with it.
    expect(seen[1]).toMatch(/not valid JSON/i);
  });

  it("still applies the named client to a repaired deck", async () => {
    let n = 0;
    const provider = providerOf(async () => (++n === 1 ? JSON.stringify(broken) : JSON.stringify(good)));
    const deck = await generateDeck("content", undefined, "acme-logistics", { provider });
    expect(deck.workspace).toBe("acme-logistics");
  });
});

describe("choosing a model backend", () => {
  it("defaults to the subscription path, so stock settings need no key and no install", () => {
    expect(DEFAULT_PROVIDER_ID).toBe("claude");
    expect(createProvider({ id: DEFAULT_PROVIDER_ID }).id).toBe("claude");
  });

  it("refuses an unknown provider by name instead of quietly using the default", () => {
    // A silent fallback would send the work to a different model than the operator asked for and
    // say nothing, which is the guessed-value failure this project keeps paying for.
    expect(() => createProvider({ id: "opencodee" })).toThrow(/unknown generation provider "opencodee"/);
    expect(() => createProvider({ id: "opencodee" })).toThrow(/claude, opencode/);
    expect(isProviderId("opencodee")).toBe(false);
    expect(PROVIDER_IDS).toContain("opencode");
  });

  it("says which backend and which model will actually run", () => {
    // Two backends write visibly different decks from the same content, so an author who cannot
    // see which one ran cannot account for the difference.
    expect(createClaudeProvider({ id: "claude" }).describe()).toContain("Claude Code login");
    expect(createOpenCodeProvider({ id: "opencode", model: "ollama/llama3" }).describe()).toContain("ollama/llama3");
    expect(createOpenCodeProvider({ id: "opencode" }).describe()).toMatch(/default model/);
  });

  it("puts OpenCode's flags after the subcommand, and omits the model when none is set", () => {
    // Verified against opencode 1.18.4: `run` is the subcommand and -m takes a provider/model
    // pair. Flags before the subcommand are not the documented form.
    expect(openCodeArgs("opencode/nemotron-3-ultra-free")).toEqual(["run", "-m", "opencode/nemotron-3-ultra-free"]);
    expect(openCodeArgs()).toEqual(["run"]);
  });
});

describe("running a model backend as a child process", () => {
  it("names a missing command instead of surfacing a bare ENOENT", async () => {
    // The single most likely first-run failure. Node reports it as an errno that names neither
    // the command nor what to do about it.
    await expect(spawnText("decktrail-no-such-command", [], "hi")).rejects.toThrow(
      /"decktrail-no-such-command" command was not found/,
    );
  });

  it("hands the prompt over on stdin and returns only stdout", async () => {
    // The prompt is never an argument: Windows caps a command line at about 32 KB and real
    // source documents run to hundreds of kilobytes. Both supported backends read stdin.
    const big = "x".repeat(100_000);
    const out = await spawnText(process.execPath, ["-e", "process.stdin.pipe(process.stdout)"], big);
    expect(out).toHaveLength(100_000);
  });

  it("keeps a backend's progress chrome out of the text the parser sees", async () => {
    // Both CLIs write the model name and their spinners to stderr. Merging the streams would
    // feed that chrome to the JSON parser.
    const script = "process.stderr.write('> building'); process.stdout.write('{\"ok\":true}')";
    const out = await spawnText(process.execPath, ["-e", script], "");
    expect(out).toBe('{"ok":true}');
  });

  it("stops a backend that hangs, rather than waiting on it forever", async () => {
    // There was no timeout at all before this: a CLI that stalled took the whole run with it.
    await expect(
      spawnText(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], "", { timeoutMs: 250 }),
    ).rejects.toThrow(/did not finish within/);
  });
});

describe("what the generator is told it can build", () => {
  // The prompt knew 12 of the IR's 17 layouts. A model cannot pick what it is not told exists,
  // so swimlanes and flowcharts, which the real corpus uses, could never be generated.
  const p = () => buildGeneratePrompt("content");

  it("offers every layout the IR accepts", () => {
    for (const layout of [
      "cover", "bullets", "statement", "card-grid", "table", "steps", "comparison",
      "callout", "timeline", "chart", "stat-grid", "swimlane", "flowchart", "close",
      "image", "figure",
    ]) {
      expect(p()).toContain(`- ${layout}:`);
    }
  });

  it("withholds tool-visual, which the model cannot fill and the sanitiser would strip", () => {
    // tool-visual carries hand-built product mock-ups. Its mocks are FigureContent, and the
    // sanitiser drops <style> and style=, so anything generated for it arrives as unstyled
    // boxes. Offering it would be the figure overclaim again: a layout that accepts content and
    // then does not show it. It stays a hand-authoring layout, and this pins that as a decision
    // rather than an oversight.
    expect(p()).not.toContain("- tool-visual:");
  });

  it("mentions the slots it used to omit", () => {
    expect(p()).toContain("notes");       // presenter-only
    expect(p()).toContain("callout");     // the band on any slide
    expect(p()).toContain("totals");      // table
    expect(p()).toContain("scale?");      // chart
  });

  // Naming a slot is not the same as saying what may go in it. Told only "state?" and "scale?",
  // the model reasonably emitted "at risk" and a string, and the whole deck was rejected on a
  // Zod error: four of the first eight real generations died this way. The enums are read off
  // the schema here, so adding a value to the IR fails this test rather than silently teaching
  // the model an incomplete set.
  it("spells out every value of every closed set the IR accepts", () => {
    for (const tone of Tone.options) expect(p()).toContain(`"${tone}"`);
    for (const state of State.options) expect(p()).toContain(`"${state}"`);
  });

  it("says what highlight is for, not just that it exists", () => {
    // The renderer has had the gradient all along: a highlight run maps to .grad. The hand-built
    // decks use it 24 times in one deck; the generated ones used it zero times, because the
    // prompt listed "highlight" in an enumeration of run types and never said what it was or
    // when to reach for it. Naming a thing is not telling the model about it.
    const s = p();
    expect(s).toMatch(/highlight[^\n]*accent gradient/i);
    expect(s).toMatch(/belongs on headings/i);
    // And an example it can copy, since the split-run shape is the part that is easy to get wrong.
    expect(s).toContain('"type": "highlight"');
  });

  it("says that rich text must say something", () => {
    expect(p()).toMatch(/never an empty string and never an empty array/i);
  });

  it("says which value slots are numbers and which are strings", () => {
    // chart.series[].value is a number and stat-grid.stats[].value is a string. Same slot name,
    // opposite types, and nothing in the prompt used to distinguish them.
    expect(p()).toMatch(/value is a NUMBER/);
    expect(p()).toMatch(/value is a STRING/);
  });

  it("says a card's body is required, not optional detail", () => {
    expect(p()).toMatch(/title and\s+body are REQUIRED/);
  });

  it("warns that figure carries SVG only, since the sanitiser strips styled HTML", () => {
    expect(p()).toMatch(/SVG only/i);
    expect(p()).toMatch(/Styled HTML does NOT survive/i);
  });

  it("tells the model not to invent an asset it was never given", () => {
    // The likeliest failure of an escape hatch: a plausible-looking path to nothing.
    expect(p()).toMatch(/[Nn]ever invent an asset/);
  });

  it("asks for the same deck whichever backend runs it", () => {
    // The prompt lives above the provider on purpose: a deck generated locally and a deck
    // generated through a subscription are asked for in identical words, so the only variable
    // is the model itself.
    expect(buildGeneratePrompt("content")).toBe(buildGeneratePrompt("content"));
  });
});
