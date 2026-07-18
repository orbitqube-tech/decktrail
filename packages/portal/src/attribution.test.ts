import { describe, it, expect } from "vitest";
import { setupFormHtml } from "./settings.js";
import { trademarkRequestUrl } from "./defaults.js";

/**
 * Guards on what the product tells an operator about the attribution mark (D19).
 *
 * The first draft of this claimed the licence required the mark and that removing it needed
 * our written permission. Neither was true, and the checks below exist so that claim cannot
 * quietly return. Overstating our own licence, in a product whose pitch is that you can trust
 * it with your client relationships, is the kind of error worth a test rather than a comment.
 */

describe("what we tell operators about the attribution mark", () => {
  const html = setupFormHtml();

  it("does not claim the licence requires the mark", () => {
    expect(html).not.toMatch(/licence asks you to keep/i);
    expect(html).not.toMatch(/must be preserved/i);
    expect(html).not.toMatch(/Section 7\(b\)/i);
  });

  it("tells the operator plainly that they may turn it off without asking", () => {
    expect(html).toMatch(/does not require it/i);
    expect(html).toMatch(/without asking us/i);
  });

  it("still asks them to keep it", () => {
    expect(html).toMatch(/we do ask you to keep it/i);
  });

  it("does not route mark removal through a permission request", () => {
    // The setup note must not send anyone to the trademark form to remove the mark: that form
    // is for using the DeckTrail name, which is a different question with a different answer.
    expect(html).not.toContain(trademarkRequestUrl);
    expect(html).not.toMatch(/request permission/i);
  });
});

describe("the trademark request path", () => {
  it("points at the trademark template, not the old waiver one", () => {
    expect(trademarkRequestUrl).toContain("trademark-permission");
    expect(trademarkRequestUrl).not.toContain("attribution-waiver");
  });
});
