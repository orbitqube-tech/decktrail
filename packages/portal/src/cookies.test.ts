import { describe, it, expect } from "vitest";
import { parseCookies, serializeSessionCookie } from "./cookies.js";
import type { Config } from "./config.js";

const cfg = (over: Partial<Config> = {}): Config =>
  ({ cookieName: "dt_session", cookieSecure: false, ...over }) as Config;

describe("parseCookies", () => {
  it("parses a normal header", () => {
    expect(parseCookies("a=1; dt_session=abc.def")).toEqual({ a: "1", dt_session: "abc.def" });
  });

  it("decodes percent-encoding", () => {
    expect(parseCookies("k=a%20b")).toEqual({ k: "a b" });
  });

  it("does not throw on a malformed escape", () => {
    // Verified against the running portal: `Cookie: dt_session=%` made decodeURIComponent
    // throw, and every cookie-reading route, including a deck serve, answered 500 instead of
    // 401. The header is attacker-controlled, so that was a one-request denial of service.
    expect(() => parseCookies("dt_session=%")).not.toThrow();
    expect(parseCookies("dt_session=%")).toEqual({ dt_session: "%" });
    expect(() => parseCookies("a=%E0%A4%A")).not.toThrow();
  });

  it("ignores pairs with no value separator, and empty names", () => {
    expect(parseCookies("novalue; =x; ok=1")).toEqual({ ok: "1" });
  });

  it("returns empty for an absent header", () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe("serializeSessionCookie", () => {
  it("is HttpOnly, SameSite and scoped to the whole site", () => {
    const c = serializeSessionCookie(cfg(), "v", 60_000);
    expect(c).toContain("dt_session=v");
    expect(c).toContain("HttpOnly"); // not readable from a deck's own JavaScript
    expect(c).toContain("SameSite=Lax");
    expect(c).toContain("Path=/");
    expect(c).toContain("Max-Age=60");
  });

  it("sets Secure only when configured to", () => {
    expect(serializeSessionCookie(cfg({ cookieSecure: true }), "v", 1000)).toContain("Secure");
    expect(serializeSessionCookie(cfg({ cookieSecure: false }), "v", 1000)).not.toContain("Secure");
  });
});
