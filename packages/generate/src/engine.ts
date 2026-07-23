import { Deck, type Voice } from "@decktrail/ir";
import { buildGeneratePrompt, buildRepairPrompt } from "./prompt.js";
import type { GenerationProvider } from "./provider.js";

/** Extract the first complete JSON object from arbitrary model output. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object found in the generated output");
  return JSON.parse(text.slice(start, end + 1));
}

/** How many times a failed deck is handed back for repair before giving up. */
export const DEFAULT_REPAIR_ATTEMPTS = 2;

export interface GenerateOptions {
  /**
   * Which model backend to use. Required, and deliberately so: a default buried in this library
   * would be a value the caller could not see, and the four worst bugs this project has shipped
   * all came from code quietly filling in a value it had no business choosing.
   */
  provider: GenerationProvider;
  /** Called before each repair attempt, so a slow retry can be reported rather than look hung. */
  onRetry?: (attempt: number, errors: string) => void;
  /** How many repairs to attempt. Defaults to DEFAULT_REPAIR_ATTEMPTS. */
  repairAttempts?: number;
  /** Cancel the run, so an interrupt stops the backend rather than orphaning it. */
  signal?: AbortSignal;
  /** Each chunk the backend writes to stderr, so a caller can surface its progress. */
  onStderr?: (chunk: string) => void;
}

/**
 * Generate a validated slide-deck IR from content. An optional Voice steers the register and
 * style; without one, the neutral default is used.
 *
 * Output that does not validate is handed back with the validator's errors rather than thrown
 * away. The IR is strict and generation is one slow call, so a single bad field in slide 5 of
 * 25 used to cost the author the whole deck and two minutes, and told them so in a Zod dump.
 * On the first real corpus that was four decks in eight, every one of them a good deck with one
 * wrong field.
 */
export async function generateDeck(
  content: string,
  voice: Voice | undefined,
  client: string | undefined,
  opts: GenerateOptions,
): Promise<Deck> {
  const attempts = opts.repairAttempts ?? DEFAULT_REPAIR_ATTEMPTS;
  const run = (prompt: string): Promise<string> =>
    opts.provider.run(prompt, { signal: opts.signal, onStderr: opts.onStderr });

  // Output that is not JSON at all is as repairable as output that is JSON of the wrong shape, and
  // more so: "your JSON is malformed at position 10977" is a mechanical fix. It used to throw
  // straight out of extractJson before the repair loop could see it, so the one failure the model
  // is best placed to correct was the one failure that got no second chance.
  const check = (text: string): { ok: true; deck: Deck } | { ok: false; errors: string } => {
    let json: unknown;
    try {
      json = extractJson(text);
    } catch (e) {
      return { ok: false, errors: `The output is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
    const parsed = Deck.safeParse(json);
    return parsed.success ? { ok: true, deck: parsed.data } : { ok: false, errors: JSON.stringify(parsed.error.issues, null, 2) };
  };

  let raw = await run(buildGeneratePrompt(content, voice));
  let result = check(raw);

  for (let attempt = 1; !result.ok && attempt <= attempts; attempt++) {
    opts.onRetry?.(attempt, result.errors);
    raw = await run(buildRepairPrompt(raw, result.errors));
    result = check(raw);
  }

  // Out of attempts: fail with what the last one actually said, rather than a generic complaint.
  if (!result.ok) throw new Error(`the generated deck could not be repaired:\n${result.errors}`);
  const deck = result.deck;
  // A named client wins over whatever the model inferred. The workspace groups your decks by
  // client (D23) and it is not something to leave to a guess: asked to infer it from a deck
  // written by the sender, the model reasonably answered with the sender's own name.
  if (client) deck.workspace = client;
  return deck;
}
