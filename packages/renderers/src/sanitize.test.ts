import { describe, it, expect } from "vitest";
import { sanitizeFigure } from "./sanitize.js";
import { safeHref, safeSrc, renderInline } from "./html.js";
import { renderSlide } from "./slides.js";

/**
 * Everything here guards one class of bug: markup from the IR reaching a client's browser
 * unexamined.
 *
 * The IR is written by a language model out of whatever content a client sent, so "the author
 * wrote it" was never true of any of it. Script that lands here runs on the portal's own
 * origin, in a reader's session, on the one page the product promises is private.
 *
 * The figure hatch was interpolated raw under a TODO to sanitise it "before serving in the
 * multi-tenant portal renderer", which had since been built, while docs/IR-SPEC.md told readers
 * the field was already "constrained and sanitised".
 */

describe("the figure escape hatch", () => {
  it("keeps an ordinary SVG diagram intact", () => {
    const svg = '<svg viewBox="0 0 10 10"><path d="M0 0L10 10" stroke="#fff" stroke-width="2"/></svg>';
    const out = sanitizeFigure(svg);
    expect(out).toContain("<svg");
    expect(out).toContain('viewBox="0 0 10 10"');
    expect(out).toContain('d="M0 0L10 10"');
    expect(out).toContain('stroke="#fff"');
  });

  it("strips a script element and its contents", () => {
    expect(sanitizeFigure('<svg><script>alert(1)</script></svg>')).not.toContain("alert");
    expect(sanitizeFigure('<div>hi<script>fetch("//evil")</script></div>')).not.toContain("fetch");
  });

  it("strips an unclosed or self-closing script, which is how the first pass gets dodged", () => {
    expect(sanitizeFigure('<svg><script src="//evil/x.js">')).not.toContain("script");
    expect(sanitizeFigure("<script/>")).not.toContain("script");
  });

  it("drops every event handler attribute", () => {
    const out = sanitizeFigure('<svg onload="alert(1)"><rect onclick="steal()" x="1"/></svg>');
    expect(out).not.toMatch(/onload|onclick|alert|steal/);
    expect(out).toContain('x="1"'); // the legitimate attribute survives
  });

  it("drops href, so javascript: has nowhere to live", () => {
    const out = sanitizeFigure('<svg><a href="javascript:alert(1)"><text>click</text></a></svg>');
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("href");
  });

  it("drops style, and any attribute smuggling url() or expression()", () => {
    expect(sanitizeFigure('<div style="background:url(javascript:alert(1))">x</div>')).not.toContain("javascript:");
    expect(sanitizeFigure('<rect fill="url(#x)" />')).not.toContain("url(");
  });

  it("strips foreignObject, which is how HTML gets into an SVG", () => {
    const out = sanitizeFigure('<svg><foreignObject><body><script>alert(1)</script></body></foreignObject></svg>');
    expect(out).not.toMatch(/foreignObject|script|alert/);
  });

  it("strips iframe, object, embed, and link", () => {
    for (const el of ["iframe", "object", "embed", "link"]) {
      expect(sanitizeFigure(`<${el} src="//evil"></${el}>`)).not.toContain(el);
    }
  });

  it("strips comments, which can hide a reopening sequence", () => {
    expect(sanitizeFigure("<svg><!-- --><script>alert(1)</script--></svg>")).not.toContain("alert");
  });

  it("discards an element that is not on the allowlist rather than escaping it", () => {
    expect(sanitizeFigure("<marquee>x</marquee>")).not.toContain("marquee");
    expect(sanitizeFigure("<custom-thing/>")).not.toContain("custom-thing");
  });

  it("preserves the case of SVG element and attribute names, which are case sensitive", () => {
    const out = sanitizeFigure('<svg><linearGradient gradientUnits="userSpaceOnUse"><stop offset="0"/></linearGradient></svg>');
    expect(out).toContain("linearGradient");
    expect(out).toContain("gradientUnits");
  });

  it("is empty for empty input, and does not throw on nonsense", () => {
    expect(sanitizeFigure("")).toBe("");
    expect(() => sanitizeFigure("<<<>>><svg")).not.toThrow();
  });

  it("closes the hole through the real renderer, not just the helper", () => {
    const html = renderSlide({
      id: "s1",
      layout: "figure",
      svg: '<svg onload="alert(1)"><script>alert(2)</script></svg>',
    } as never);
    expect(html).not.toMatch(/onload|alert/);
  });
});

describe("link and image schemes", () => {
  it("keeps the schemes a deck legitimately uses", () => {
    expect(safeHref("https://acme.example")).toBe("https://acme.example");
    expect(safeHref("http://acme.example")).toBe("http://acme.example");
    expect(safeHref("mailto:user@decktrail.orbitqube")).toBe("mailto:user@decktrail.orbitqube");
    expect(safeHref("/local/page")).toBe("/local/page");
    expect(safeHref("#anchor")).toBe("#anchor");
  });

  it("neuters javascript:, which escaping never touched", () => {
    // escapeHtml handles & < > " ' and leaves the scheme alone, so this survived it untouched.
    expect(safeHref("javascript:alert(1)")).toBe("#");
    expect(safeHref("JaVaScRiPt:alert(1)")).toBe("#");
    expect(safeHref("  javascript:alert(1)  ")).toBe("#");
    expect(safeHref("data:text/html,<script>alert(1)</script>")).toBe("#");
    expect(safeHref("vbscript:msgbox")).toBe("#");
  });

  it("renders a hostile link inert through renderInline", () => {
    const out = renderInline([{ type: "link", text: "click", href: "javascript:alert(1)" }] as never);
    expect(out).not.toContain("javascript:");
    expect(out).toContain('href="#"');
    expect(out).toContain("click"); // the text still shows: inert, not vanished
  });

  it("allows only real image sources", () => {
    expect(safeSrc("https://acme.example/logo.png")).toBe("https://acme.example/logo.png");
    expect(safeSrc("data:image/png;base64,iVBORw0KGgo=")).toContain("data:image/png");
    expect(safeSrc("javascript:alert(1)")).toBe("");
    expect(safeSrc("data:text/html,<script>alert(1)</script>")).toBe("");
  });
});
