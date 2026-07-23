import type { GenerationProvider, ProviderConfig } from "../provider.js";
import { createClaudeProvider } from "./claude.js";
import { createOpenCodeProvider } from "./opencode.js";

/**
 * Every backend that can be named in configuration.
 *
 * `claude` is first because it is the default and stays the default: at stock settings DeckTrail
 * generates exactly as it always has, through the operator's own Claude Code login, and every
 * other backend is something they opted into.
 */
export const PROVIDER_IDS = ["claude", "opencode"] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** The backend used when nothing has been configured. */
export const DEFAULT_PROVIDER_ID: ProviderId = "claude";

const FACTORIES: Record<ProviderId, (config: ProviderConfig) => GenerationProvider> = {
  claude: createClaudeProvider,
  opencode: createOpenCodeProvider,
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

/**
 * Build the configured provider, or fail naming what was asked for and what exists.
 *
 * An unknown identifier is refused rather than quietly falling back to the default. A silent
 * fallback here would mean a typo in a setting sends the work to a different model than the one
 * the operator asked for, and says nothing: the value would have been guessed, not derived.
 */
export function createProvider(config: ProviderConfig): GenerationProvider {
  if (!isProviderId(config.id)) {
    throw new Error(`unknown generation provider "${config.id}". Known providers: ${PROVIDER_IDS.join(", ")}.`);
  }
  return FACTORIES[config.id](config);
}

export { createClaudeProvider, CLAUDE_DEFAULT_COMMAND } from "./claude.js";
export { createOpenCodeProvider, openCodeArgs, OPENCODE_DEFAULT_COMMAND } from "./opencode.js";
