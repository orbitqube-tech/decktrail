/** Mirrors the portal's AnalyticsSummary (packages/portal/src/analytics.ts). */
export interface DeckStat {
  artifactId: string;
  opens: number;
  viewers: number;
  lastOpen: string | null;
}
export interface RecipientStat {
  recipient: string;
  opens: number;
  decks: number;
  firstSeen: string;
  lastSeen: string;
}
export interface BotAttempt {
  ts: string;
  ip: string | null;
  ua: string | null;
}
export interface DailyOpens {
  date: string;
  opens: number;
}
export interface AnalyticsSummary {
  totalOpens: number;
  uniqueViewers: number;
  loginSuccesses: number;
  deniedCount: number;
  byDeck: DeckStat[];
  byRecipient: RecipientStat[];
  opensOverTime: DailyOpens[];
  botAttempts: BotAttempt[];
}
export interface AuthConfig {
  turnstileSitekey: string | null;
  brand: string | null;
  trademarkUrl?: string;
  trademarkEmail?: string;
}

export interface ThemeColors {
  bg: string;
  surfaceLow: string;
  surfaceHigh: string;
  accent: string;
  accentDim: string;
  accent2: string;
  accent2Dim: string;
  text: string;
  heading: string;
  muted: string;
  good?: string;
  warn?: string;
  bad?: string;
}
export interface ThemeShape {
  name: string;
  colors: ThemeColors;
  typography: { family: string; scale: number };
  logo: { src: string; glow?: string };
}
export interface ThemeRecord {
  id: string;
  name: string;
  theme: ThemeShape;
}
export interface ArtifactRecord {
  id: string;
  title: string;
  slug: string;
  kind: string;
  themeId: string | null;
  /** The client this deck belongs to (D23). */
  workspace: string;
}

export interface VoiceShape {
  name: string;
  audience?: string;
  tone?: string;
  forbidden: string[];
  preferred: string[];
  locale?: { currency: string; dates?: string };
  instructions?: string;
  notes?: string;
}
