import type { GenerationProvider, ProviderConfig, ProviderRunOptions } from "../provider.js";
import { spawnText } from "../spawn.js";

/** The binary this provider drives when nothing overrides it. */
export const OPENCODE_DEFAULT_COMMAND = "opencode";

/**
 * Generation through the OpenCode command line tool, which is what opens DeckTrail to local and
 * free models: an Ollama, LM Studio or llama.cpp server on your own machine, OpenCode's own
 * zero-cost tier, or a hosted free tier you have a key for. Which one is entirely OpenCode's
 * configuration, not ours; this provider only decides how the prompt gets in and what counts
 * as the answer.
 *
 * Three things about this command line were established against a real install (version 1.18.4)
 * rather than from its documentation, because the documentation is silent or wrong on all three:
 *
 *  - **It reads a piped stdin.** The documented form is `opencode run [message..]`, taking the
 *    message as an argument, and stdin is not mentioned anywhere. It does read it: run with no
 *    argument and no pipe it refuses with "You must provide a message or a command", and the
 *    same command with a pipe gets past that check. This matters more than it looks, because an
 *    argument is capped at about 32 KB on Windows and real source documents are far larger.
 *  - **stdout carries the model's text and nothing else.** The progress chrome (`> build ·
 *    <model>`) goes to stderr, so stdout parses cleanly as JSON.
 *  - **`--format json` is the wrong tool here.** It emits raw JSON *events*, an envelope stream
 *    describing the session, so a JSON parser would lock onto the envelope instead of the deck.
 *    The default format is the correct one.
 *
 * `--auto` is deliberately not passed. It auto-approves permissions, which for an agentic tool
 * means letting a model run commands unattended, and generating a deck never needs that. A run
 * that stalls waiting for a permission it will never be granted is caught by the timeout.
 */
/**
 * Build the argument list.
 *
 * Flags belong after the subcommand, not before it. `-m` takes a `provider/model` pair, for
 * example "opencode/nemotron-3-ultra-free" or "ollama/llama3", never a bare model name. Omitted,
 * OpenCode uses whichever model its own configuration makes default.
 */
export function openCodeArgs(model?: string): string[] {
  return model ? ["run", "-m", model] : ["run"];
}

export function createOpenCodeProvider(config: ProviderConfig = { id: "opencode" }): GenerationProvider {
  const command = config.command ?? OPENCODE_DEFAULT_COMMAND;
  const args = openCodeArgs(config.model);

  return {
    id: "opencode",
    describe: () => `${command} (${config.model ?? "its own default model"})`,
    run: (prompt: string, opts: ProviderRunOptions = {}) =>
      spawnText(command, args, prompt, { ...opts, timeoutMs: config.timeoutMs }),
  };
}
