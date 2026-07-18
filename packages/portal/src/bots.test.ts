import { describe, it, expect } from "vitest";
import { isBlockedBot, robotsTxt } from "./bots.js";

describe("isBlockedBot", () => {
  it("blocks known AI and scraper agents, case-insensitively", () => {
    expect(isBlockedBot("Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)")).toBe(true);
    expect(isBlockedBot("ClaudeBot/1.0")).toBe(true);
    expect(isBlockedBot("ccbot/2.0")).toBe(true);
    expect(isBlockedBot("Mozilla/5.0 (compatible; PerplexityBot/1.0)")).toBe(true);
  });

  it("allows an ordinary browser and an empty agent", () => {
    expect(isBlockedBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0")).toBe(false);
    expect(isBlockedBot(undefined)).toBe(false);
    expect(isBlockedBot("")).toBe(false);
  });
});

describe("robotsTxt", () => {
  it("disallows every named agent and a catch-all", () => {
    const txt = robotsTxt();
    expect(txt).toContain("User-agent: GPTBot");
    expect(txt).toContain("User-agent: ClaudeBot");
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Disallow: /");
  });
});
