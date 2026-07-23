export { runValidate, runRender, neutralTheme, type ValidateResult } from "./commands.js";
export { pushArtifact, createShareLink, publishAndShare, fetchVoice, type PushResult } from "./push.js";
export { extractBrand, fetchBrand, stylesheetUrls } from "./brand.js";
export {
  loadConfig,
  describeConfig,
  CONFIG_DIR_NAME,
  CONFIG_FILE_NAME,
  DEFAULT_VOICE_CACHE_MAX_AGE_DAYS,
  type StudioConfig,
  type ConfigFlags,
  type ConfigLayer,
} from "./config.js";
export {
  resolveVoice,
  describeVoiceOrigin,
  readVoiceCache,
  writeVoiceCache,
  voiceCachePath,
  cacheAgeDays,
  VOICE_CACHE_FILE_NAME,
  type VoiceCache,
  type VoiceOrigin,
  type ResolvedVoice,
} from "./voice.js";

// Generation moved to its own package so the model backend can be swapped without touching the
// command line tool, and so the portal never links generation code by accident. Re-exported here
// because the two have always been one import for anyone consuming the studio as a library.
export {
  generateDeck,
  extractJson,
  buildGeneratePrompt,
  buildRepairPrompt,
  renderVoice,
  createProvider,
  DEFAULT_VOICE_BLOCK,
  PROVIDER_IDS,
  DEFAULT_PROVIDER_ID,
  type GenerationProvider,
  type ProviderId,
} from "@decktrail/generate";
