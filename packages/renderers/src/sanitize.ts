/**
 * The figure escape hatch: markup that did not come from a layout.
 *
 * `figure` exists so an imported diagram can be carried across without rebuilding it as slots.
 * It used to be interpolated raw, under a comment reading "trusted-author content in Wave 1
 * (standalone). TODO(portal): sanitise before serving in the multi-tenant portal renderer."
 * The portal renderer now does exactly that serve, so the TODO's own precondition had arrived
 * and gone unnoticed, and docs/IR-SPEC.md meanwhile told readers the field was "constrained
 * and sanitised". It was not. For a project whose entire pitch is that it does not overclaim,
 * a documented control that does not exist is worse than the hole itself.
 *
 * The content is not trusted. A deck's IR is written by a language model out of whatever the
 * client sent, so "the author wrote it" was never true of this field. Script here runs on the
 * portal's own origin, in the reader's session.
 *
 * This is an ALLOWLIST, and it is deliberately small. Rejecting known-bad markup is a game you
 * lose to the next parser quirk; permitting a fixed set of drawing elements and attributes and
 * discarding everything else fails closed. If a legitimate diagram loses an element, widen the
 * list on purpose.
 */

/** Elements a diagram may use. Drawing and text, nothing that loads, scripts, or navigates. */
const ALLOWED_ELEMENTS = new Set([
  "svg", "g", "defs", "title", "desc", "symbol", "use",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath",
  "marker", "pattern", "mask", "clipPath",
  "linearGradient", "radialGradient", "stop",
  "figure", "figcaption", "div", "span", "p", "br",
  "table", "thead", "tbody", "tr", "th", "td",
  "ul", "ol", "li", "strong", "em", "b", "i", "small", "code",
]);

/**
 * Attributes those elements may carry.
 *
 * No `href`/`xlink:href` (they take javascript: and data:), no `style` (it takes url() and, in
 * older engines, expression()), and nothing beginning with "on". Geometry, presentation and
 * class only.
 */
const ALLOWED_ATTRS = new Set([
  "viewBox", "width", "height", "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry",
  "d", "points", "transform", "class", "id", "fill", "fill-opacity", "fill-rule",
  "stroke", "stroke-width", "stroke-opacity", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "opacity",
  "font-family", "font-size", "font-weight", "text-anchor", "dominant-baseline", "dy", "dx",
  "offset", "stop-color", "stop-opacity", "gradientUnits", "gradientTransform",
  "patternUnits", "markerWidth", "markerHeight", "refX", "refY", "orient",
  "colspan", "rowspan", "xmlns", "preserveAspectRatio",
]);

/**
 * Elements whose entire contents go too, not just their tags.
 *
 * The closing tag tolerates junk before the ">" on purpose: `</script-->` is a real evasion,
 * and a strict `</script>` matched nothing there, so the tags were stripped by the pass below
 * while the payload stayed behind as text.
 */
const STRIP_WITH_CONTENT = /<\s*(script|style|iframe|object|embed|foreignObject|animate|set|link|meta)\b[\s\S]*?<\s*\/\s*\1\b[^>]*>/gi;

/** The same elements when self-closing or unclosed, which is how the first pass gets dodged. */
const STRIP_SELF_CLOSING = /<\s*\/?\s*(script|style|iframe|object|embed|foreignObject|animate|animateTransform|animateMotion|set|link|meta|base|form|input|button)\b[^>]*>/gi;

function cleanAttributes(tagBody: string): string {
  let out = "";
  const attr = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = attr.exec(tagBody)) !== null) {
    const name = m[1] ?? "";
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    if (!ALLOWED_ATTRS.has(name)) continue;
    // A permitted attribute can still carry a payload: url(javascript:...) in a paint value,
    // or a stray quote that ends the attribute and starts a new one.
    if (/javascript:|expression\s*\(|url\s*\(/i.test(value)) continue;
    out += ` ${name}="${value.replace(/"/g, "&quot;").replace(/</g, "&lt;")}"`;
  }
  return out;
}

/** Sanitise figure markup down to the allowlist. */
export function sanitizeFigure(markup: string): string {
  if (!markup) return "";

  // Comments go first: one can hide a closing tag from the element strip below, and a browser
  // does not always agree with a regex about where a comment ends.
  let s = markup.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(STRIP_WITH_CONTENT, "").replace(STRIP_SELF_CLOSING, "");

  s = s.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g, (_all, slash, rawName, body) => {
    const name = String(rawName);
    // Case matters in SVG (viewBox, linearGradient), so match the allowlist as written first.
    const canonical = ALLOWED_ELEMENTS.has(name)
      ? name
      : [...ALLOWED_ELEMENTS].find((e) => e.toLowerCase() === name.toLowerCase());
    if (!canonical) return "";
    if (slash) return `</${canonical}>`;
    const selfClosing = /\/\s*$/.test(String(body));
    return `<${canonical}${cleanAttributes(String(body))}${selfClosing ? " /" : ""}>`;
  });

  return s;
}
