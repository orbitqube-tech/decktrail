export {
  generateDeck,
  extractJson,
  resolveAssetRefs,
  DEFAULT_REPAIR_ATTEMPTS,
  type GenerateOptions,
  type GenerateAsset,
} from "./engine.js";
export {
  buildGeneratePrompt,
  buildRepairPrompt,
  renderVoice,
  renderAssets,
  DEFAULT_VOICE_BLOCK,
  FAITHFUL_BLOCK,
  ASSET_REF_PREFIX,
  type PromptAsset,
  type PromptOptions,
} from "./prompt.js";
export { spawnText, DEFAULT_GENERATE_TIMEOUT_MS, type SpawnTextOptions } from "./spawn.js";
export type { GenerationProvider, ProviderConfig, ProviderRunOptions } from "./provider.js";
export {
  createProvider,
  createClaudeProvider,
  createOpenCodeProvider,
  openCodeArgs,
  isProviderId,
  PROVIDER_IDS,
  DEFAULT_PROVIDER_ID,
  CLAUDE_DEFAULT_COMMAND,
  OPENCODE_DEFAULT_COMMAND,
  type ProviderId,
} from "./providers/index.js";
