import { spawn } from "node:child_process";
import { Deck, type Voice } from "@decktrail/ir";
import { buildGeneratePrompt, buildRepairPrompt } from "./prompt.js";

/**
 * Run Claude in print mode using the user's own Claude Code login. This is the
 * subscription-only generation path (D9): no API key, the product never handles the
 * credential. Requires the `claude` CLI installed and logged in.
 *
 * The prompt goes in on **stdin**, not as an argument.
 *
 * It used to be `["-p", prompt]`, which puts the whole thing in one argv entry. Windows caps a
 * command line at about 32 KB and Linux at a couple of megabytes, so a long enough source
 * document simply could not be generated: four artifacts in the first real corpus were
 * hundreds of kilobytes and hit the wall. The failure is also a poor one, an opaque spawn
 * error rather than anything naming the cause. Stdin has no such limit.
 */
export function runClaude(prompt: string, command = "claude"): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["-p"], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", (e) => reject(e));
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim() || `claude exited with code ${code}`))));
    // A broken pipe here means the child died before reading; the close handler reports why.
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}

/** Extract the first complete JSON object from arbitrary model output. */
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object found in the generated output");
  return JSON.parse(text.slice(start, end + 1));
}

/** How many times to hand a failed deck back for repair before giving up. */
const REPAIR_ATTEMPTS = 2;

export interface GenerateOptions {
  /** Called before each repair attempt, so a slow retry can be reported rather than look hung. */
  onRetry?: (attempt: number, errors: string) => void;
  /** How to reach the model. Defaults to the real `claude` CLI; injectable for tests. */
  run?: (prompt: string) => Promise<string>;
}

/**
 * Generate a validated slide-deck IR from content, via the user's Claude Code login. An
 * optional Voice steers the register and style; without one, the neutral default is used.
 *
 * Output that does not validate is handed back with the validator's errors rather than thrown
 * away. The IR is strict and generation is one slow call, so a single bad field in slide 5 of
 * 25 used to cost the author the whole deck and two minutes, and told them so in a Zod dump.
 * On the first real corpus that was four decks in eight, every one of them a good deck with one
 * wrong field.
 */
export async function generateDeck(
  content: string,
  voice?: Voice,
  client?: string,
  opts: GenerateOptions = {},
): Promise<Deck> {
  // `run` is injectable for the same reason the portal's store layer is: the alternative is a
  // test that shells out to a real model, which is slow, costs money, and answers differently
  // every run. The default is the real thing.
  const run = opts.run ?? runClaude;

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

  for (let attempt = 1; !result.ok && attempt <= REPAIR_ATTEMPTS; attempt++) {
    opts.onRetry?.(attempt, result.errors);
    raw = await run(buildRepairPrompt(raw, result.errors));
    result = check(raw);
  }

  // Out of attempts: fail with what the last one actually said, rather than a generic complaint.
  if (!result.ok) throw new Error(`the generated deck could not be repaired:\n${result.errors}`);
  const deck = result.deck;
  // A named client wins over whatever the model inferred. The workspace groups your decks by
  // client (D23) and it is not something to leave to a guess: asked to infer it from an
  // OrbitQube deck, the model reasonably answered "orbitqube", which is the sender.
  if (client) deck.workspace = client;
  return deck;
}
