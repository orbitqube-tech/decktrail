import { describe, it, expect } from "vitest";
import { safeNext, signInPageHtml, notAvailablePageHtml } from "./signin.js";

/**
 * The recipient's door.
 *
 * What shipped: a client clicked the link their consultant sent, and the portal answered
 * {"error":"please sign in"} as raw JSON, with nowhere to sign in. Their magic link, when they
 * eventually got one, answered {"ok":true} and left them there. The product could not deliver
 * a deck to a human.
 */

describe("where a viewer may be sent after signing in", () => {
  it("allows a path on this portal", () => {
    expect(safeNext("/d/shr_abc")).toBe("/d/shr_abc");
    expect(safeNext("/admin/")).toBe("/admin/");
  });

  it("refuses another site", () => {
    // `next` arrives in a URL, so it is attacker-supplied. An open redirect on the end of a
    // magic link is a phishing gift: a link that genuinely is from the portal, genuinely signs
    // you in, and then lands you somewhere else.
    expect(safeNext("https://evil.example/login")).toBeNull();
    expect(safeNext("http://evil.example")).toBeNull();
  });

  it("refuses a protocol-relative URL, which a lone startsWith('/') would allow", () => {
    // "//evil.example" starts with "/" and a browser reads it as another host. This is the
    // exact way this check is usually got past.
    expect(safeNext("//evil.example")).toBeNull();
    expect(safeNext("/\\evil.example")).toBeNull();
  });

  it("refuses nothing, an empty value, and a non-string", () => {
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext("")).toBeNull();
    expect(safeNext(42)).toBeNull();
    expect(safeNext({ toString: () => "/d/x" })).toBeNull();
  });
});

describe("the sign-in page", () => {
  const page = (over = {}) => signInPageHtml({ brand: "OrbitQube", next: "/d/shr_abc", ...over });

  it("wears the sender's brand, not DeckTrail's", () => {
    expect(page()).toContain("OrbitQube");
  });

  it("carries the deck it will return the viewer to", () => {
    expect(page()).toContain('"/d/shr_abc"');
  });

  it("says nothing about whether the address is invited or the deck exists", () => {
    // The page is public and anyone can guess a share id, so it must reveal neither.
    const html = page();
    expect(html).not.toMatch(/not invited|no such deck|does not exist|unknown recipient/i);
    expect(html).toContain("If that address has access"); // the same answer either way
  });

  it("asks not to be indexed", () => {
    expect(page()).toContain('name="robots" content="noindex,nofollow"');
  });

  it("escapes the brand, which the operator sets", () => {
    const html = page({ brand: '<script>alert(1)</script>' });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("escapes the next path, which comes from the URL", () => {
    const html = page({ next: '/d/"><script>alert(1)</script>' });
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("shows the Turnstile widget only when a sitekey is configured", () => {
    // Checking for the widget div and the script, not the bare string "cf-turnstile": the
    // page's own JavaScript reads [name="cf-turnstile-response"] either way.
    expect(page({ sitekey: "0xABC" })).toContain('data-sitekey="0xABC"');
    expect(page({ sitekey: "0xABC" })).toContain("challenges.cloudflare.com");
    expect(page()).not.toContain("data-sitekey");
    expect(page({ sitekey: null })).not.toContain("challenges.cloudflare.com");
  });
});

describe("the not-available page", () => {
  const page = (over = {}) => notAvailablePageHtml({ brand: "OrbitQube", next: "/d/shr_abc", ...over });

  it("gives the same answer whatever the real reason is", () => {
    // Withdrawn, never existed, or somebody else's deck must be indistinguishable. Naming the
    // cause would confirm to a stranger that a share id is real and who it belongs to.
    const html = page();
    expect(html).not.toMatch(/not yours|belongs to|revoked|does not exist|no such/i);
    expect(html).toContain("shared with a different email address");
    expect(html).toContain("has withdrawn it");
    expect(html).toContain("link is wrong");
  });

  it("offers a way out for the likeliest innocent cause", () => {
    // Being signed in as the wrong person: sent to your work address, read in a browser signed
    // in as your personal one.
    expect(page()).toContain("/auth/signout?next=/d/shr_abc");
    expect(page()).toContain("Sign in as someone else");
  });

  it("wears the sender's brand and asks not to be indexed", () => {
    expect(page()).toContain("OrbitQube");
    expect(page()).toContain('content="noindex,nofollow"');
  });

  it("escapes what it is given", () => {
    expect(page({ brand: "<script>x</script>" })).not.toContain("<script>x</script>");
    expect(page({ next: '"><script>x</script>' })).not.toContain("<script>x</script>");
  });
});
