import { escapeHtml } from "./html.js";

export interface PageParts {
  title: string;
  lang?: string;
  css: string;
  body: string;
  scripts?: string;
}

/** The low-level HTML document wrapper shared by every renderer. */
export function htmlDocument(p: PageParts): string {
  const scripts = p.scripts ? `\n<script>${p.scripts}</script>` : "";
  return `<!doctype html>
<html lang="${escapeHtml(p.lang ?? "en")}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(p.title)}</title>
<style>${p.css}</style>
</head>
<body>
${p.body}${scripts}
</body>
</html>`;
}
