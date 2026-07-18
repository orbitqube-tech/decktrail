import { describe, it, expect } from "vitest";
import { verifyTurnstileToken } from "./turnstile.js";

/** A fetch stub that records the call and returns a canned response. */
function stubFetch(response: unknown, ok = true): { fetch: typeof fetch; calls: Array<{ url: string; body: string }> } {
  const calls: Array<{ url: string; body: string }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: String(init?.body ?? "") });
    return { ok, json: async () => response } as Response;
  }) as typeof fetch;
  return { fetch: fetchImpl, calls };
}

describe("verifyTurnstileToken", () => {
  it("returns true only when Cloudflare reports success", async () => {
    const { fetch } = stubFetch({ success: true });
    expect(await verifyTurnstileToken("secret", "token", "1.2.3.4", fetch)).toBe(true);
  });

  it("fails closed on a non-success result", async () => {
    const { fetch } = stubFetch({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await verifyTurnstileToken("secret", "token", undefined, fetch)).toBe(false);
  });

  it("fails closed on an empty token without calling out", async () => {
    const { fetch, calls } = stubFetch({ success: true });
    expect(await verifyTurnstileToken("secret", "", "1.2.3.4", fetch)).toBe(false);
    expect(calls.length).toBe(0);
  });

  it("fails closed on a non-OK HTTP response", async () => {
    const { fetch } = stubFetch({ success: true }, false);
    expect(await verifyTurnstileToken("secret", "token", undefined, fetch)).toBe(false);
  });

  it("fails closed on a network error", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as typeof fetch;
    expect(await verifyTurnstileToken("secret", "token", undefined, fetchImpl)).toBe(false);
  });

  it("sends the secret, token, and remote IP to the verify endpoint", async () => {
    const { fetch, calls } = stubFetch({ success: true });
    await verifyTurnstileToken("sek", "tok", "9.9.9.9", fetch);
    expect(calls[0]?.url).toContain("challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(calls[0]?.body).toContain("secret=sek");
    expect(calls[0]?.body).toContain("response=tok");
    expect(calls[0]?.body).toContain("remoteip=9.9.9.9");
  });
});
