/**
 * AI and scraper user-agent defense. The auth wall is the real anti-scrape control (no
 * session, no content), so this is a second, honest layer: known model and crawler agents
 * are refused at the content route and surfaced as a first-class `bot_blocked` signal, so
 * "who tried to feed this to a model" is a glanceable panel. Advisory, and stated as such:
 * a determined scraper can forge a user agent. See docs/THREAT-MODEL.md.
 */

/**
 * Known AI/model and scraper agent tokens. One authoritative list drives both the
 * user-agent block and the robots.txt disallow entries. Matched case-insensitively as a
 * substring of the user agent.
 */
export const BOT_TOKENS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "CCBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "cohere-ai",
  "Diffbot",
  "ImagesiftBot",
  "Omgilibot",
  "meta-externalagent",
  "FacebookBot",
  "YouBot",
  "PetalBot",
  "DataForSeoBot",
  "Timpibot",
  "Scrapy",
] as const;

/** The `X-Robots-Tag` response header value for served content. Advisory. */
export const ROBOTS_TAG = "noai, noimageai, noindex, nofollow";

/** Whether a user agent is a known AI/scraper agent that should be refused and logged. */
export function isBlockedBot(ua: string | undefined): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return BOT_TOKENS.some((t) => lower.includes(t.toLowerCase()));
}

/** A disallow-all robots.txt that also names each blocked agent explicitly. Advisory. */
export function robotsTxt(): string {
  const named = BOT_TOKENS.map((t) => `User-agent: ${t}\nDisallow: /`).join("\n\n");
  return `${named}\n\nUser-agent: *\nDisallow: /\n`;
}
