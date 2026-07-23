/**
 * A model backend the generation engine can drive.
 *
 * The engine knows nothing beyond this: hand it a prompt, get back whatever the model said. The
 * repair loop, the schema validation and the workspace rule live above it and are identical for
 * every provider, so adding a backend never touches the pipeline.
 */
export interface GenerationProvider {
  /** Stable identifier, the same string the operator sets in configuration. */
  readonly id: string;
  /** A short human description of what this will actually call, for the "generating with" line. */
  readonly describe: () => string;
  /** Run one prompt and return the model's raw output. */
  run(prompt: string, opts?: ProviderRunOptions): Promise<string>;
}

export interface ProviderRunOptions {
  /** Cancel from the caller, so an interrupt stops the child rather than orphaning it. */
  signal?: AbortSignal;
  /** Each chunk the backend writes to stderr, so a caller can surface progress. */
  onStderr?: (chunk: string) => void;
}

/**
 * Everything a provider needs, resolved by the caller from flags, environment and config file.
 *
 * Nothing in this package reads `process.env`. Configuration is resolved once by whoever owns
 * the process (the command line tool) and passed in, so the engine stays a pure library and one
 * setting keeps one authoritative home.
 */
export interface ProviderConfig {
  /** Which backend: see PROVIDER_IDS. */
  id: string;
  /** Override the binary name or path, for a non-standard install. */
  command?: string;
  /** Model to use, in whatever form the backend expects. OpenCode wants `provider/model`. */
  model?: string;
  /** Kill the call after this long. Defaults to DEFAULT_GENERATE_TIMEOUT_MS. */
  timeoutMs?: number;
}
