import type { GenerationProvider, ProviderConfig, ProviderRunOptions } from "../provider.js";
import { spawnText } from "../spawn.js";

/** The binary this provider drives when nothing overrides it. */
export const CLAUDE_DEFAULT_COMMAND = "claude";

/**
 * Generation through the operator's own Claude Code login: a Claude Pro or Max subscription,
 * authenticated once with `claude login`. No application programming interface (API) key is
 * involved and the product never handles the credential, which is what makes this the default.
 *
 * `-p` is print mode, which runs the prompt once and exits rather than opening a session.
 */
export function createClaudeProvider(config: ProviderConfig = { id: "claude" }): GenerationProvider {
  const command = config.command ?? CLAUDE_DEFAULT_COMMAND;
  return {
    id: "claude",
    describe: () => `${command} (your own Claude Code login)`,
    run: (prompt: string, opts: ProviderRunOptions = {}) =>
      spawnText(command, ["-p"], prompt, { ...opts, timeoutMs: config.timeoutMs }),
  };
}
