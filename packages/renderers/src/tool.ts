import type { Tool, Theme, RichText } from "@decktrail/ir";
import { escapeHtml, renderInline } from "./html.js";
import { themeToCss } from "./theme.js";
import { shellCss, renderMadeWith } from "./shell.js";
import { htmlDocument } from "./page.js";
import { watermarkCss, watermarkLayer, antiCopyCss, antiCopyJs } from "./watermark.js";
import { beaconConfigTag, beaconJs, type BeaconConfig } from "./beacon.js";
import { logoCss, brandMark } from "./logo.js";

/**
 * The pricing-tool renderer. A pricing artifact is a live-editable commercials sheet,
 * not a static table (docs/IR-SPEC.md section 7). It renders in one of two states:
 *
 *  - Locked (the default, and forced by the portal): a static, control-free client view.
 *    No editing affordance exists in the DOM at all: not hidden, not disabled, absent. A
 *    control a client can find in the markup is a control they can use, and a pricing sheet
 *    they can edit is worse than no pricing sheet.
 *  - Presenter (opt-in, revealed with the E key): an interactive sheet the sender drives
 *    on a call. Edit an amount, toggle a line in or out, add a line, remove a line, apply
 *    a percentage adjustment, or reset. The total recomputes live. Line items are not a
 *    fixed list.
 *
 * Currency is formatted with Intl.NumberFormat driven by the tool's own locale, so an
 * Indian Rupee sheet groups in lakh and crore and a foreign-currency sheet formats to its
 * own convention. No amount is ever baked into a slide.
 */

/** CSS for the static pricing sheet. Reuses shell tokens so it reskins with the theme.
 *  This is all a locked client view ships; the editing styles below never reach it. */
export const toolCss = `
.wrap{max-width:820px;margin:0 auto;padding:64px 24px 120px}
.wrap>.eyebrow{margin-bottom:14px}
.wrap h1{font-size:calc(clamp(28px,4vw,44px) * var(--scale));color:var(--heading);font-weight:900;letter-spacing:-1px;margin-bottom:24px}
.pt{width:100%;border-collapse:collapse;font-size:calc(16px * var(--scale))}
.pt td{padding:14px 12px;border-bottom:1px solid color-mix(in srgb,var(--muted) 22%,transparent);color:var(--text);vertical-align:top}
.pt td.amt{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.pt .desc .sub{color:var(--muted);font-size:calc(13px * var(--scale));margin-top:4px}
.pt .list{color:var(--muted);text-decoration:line-through;margin-right:8px;font-size:.9em}
.pt tr.sub td{color:var(--muted);font-weight:700;border-bottom:none;padding-top:8px;padding-bottom:8px}
.pt tr.grand td{color:var(--heading);font-weight:800;font-size:calc(19px * var(--scale));border-top:2px solid color-mix(in srgb,var(--accent) 40%,transparent);border-bottom:none;padding-top:18px}
.pt tr.excl td{opacity:.42}
.notes{margin-top:30px;color:var(--muted);font-size:calc(14px * var(--scale));line-height:1.6;list-style:none;display:flex;flex-direction:column;gap:8px}
.notes li{padding-left:16px;position:relative}
.notes li::before{content:"";position:absolute;left:0;top:.55em;width:6px;height:6px;border-radius:2px;background:var(--accent)}
`;

/** Presenter-only editing CSS. Added only in presenter mode, so the locked payload
 *  carries no editing markup or styles at all. */
const toolEditCss = `
.editbar{display:none;flex-wrap:wrap;gap:14px;align-items:center;margin:0 0 20px;padding:14px 16px;border-radius:12px;background:var(--s-high);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 20%,transparent)}
body.editing .editbar{display:flex}
.editbar label{color:var(--muted);font-size:calc(13px * var(--scale));display:flex;align-items:center;gap:6px}
.editbar .btn{background:var(--s-low);color:var(--heading);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:8px;padding:7px 12px;cursor:pointer;font-size:calc(13px * var(--scale))}
.pt .btn{background:var(--s-low);color:var(--heading);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);border-radius:8px;padding:7px 12px;cursor:pointer;font-size:calc(13px * var(--scale))}
.editbar .btn:hover,.pt .btn:hover{border-color:var(--accent)}
.pt input.f,.editbar input{background:var(--s-low);color:var(--text);border:1px solid color-mix(in srgb,var(--muted) 30%,transparent);border-radius:7px;padding:7px 9px;font:inherit;font-size:calc(14px * var(--scale))}
.pt input.amtf{text-align:right;width:130px;font-variant-numeric:tabular-nums}
.pt input.groupf{width:120px}
.pt input.textf{width:100%}
.editbar input.adj{width:70px;text-align:right}
/* The hint makes presenter mode discoverable when the sender opens the sheet, then fades, so
   that nothing on screen suggests the numbers are editable while a client is looking at it. */
.pthint{position:fixed;bottom:14px;left:16px;z-index:19;color:var(--muted);font-size:11px;letter-spacing:1px;animation:pthintfade 1s ease 4s forwards}
body.editing .pthint{display:none}
@keyframes pthintfade{to{opacity:0;visibility:hidden}}
`;

/** Flatten rich text to a plain string, for editable inputs and JSON. */
function plainText(rt: RichText): string {
  return rt.map((r) => r.text).join("");
}

/** BCP-47 locale for a currency: Indian grouping for the Rupee, a neutral default otherwise. */
function localeFor(currency: string): string {
  return currency === "INR" ? "en-IN" : "en";
}

function formatterFor(currency: string): Intl.NumberFormat {
  return new Intl.NumberFormat(localeFor(currency), {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

type Line = Tool["lines"][number];

interface Group {
  name: string;
  lines: Line[];
}

/** Group lines by their `group` tag, preserving first-appearance order. */
function grouped(lines: Line[]): Group[] {
  const order: string[] = [];
  const map = new Map<string, Line[]>();
  for (const l of lines) {
    const key = l.group ?? "";
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
      order.push(key);
    }
    bucket.push(l);
  }
  return order.map((name) => ({ name, lines: map.get(name) ?? [] }));
}

function priceCell(line: Line, money: (n: number) => string): string {
  const discounted = line.listPrice !== undefined && line.listPrice > line.offerPrice;
  const list = discounted ? `<span class="list">${escapeHtml(money(line.listPrice as number))}</span>` : "";
  return `${list}${escapeHtml(money(line.offerPrice))}`;
}

/** The static, control-free client view: included lines, group subtotals, a grand total. */
function staticTable(tool: Tool, money: (n: number) => string): string {
  const included = tool.lines.filter((l) => l.include);
  const groups = grouped(included);
  const showSubtotals = groups.length >= 2;
  const rows: string[] = [];
  for (const g of groups) {
    for (const line of g.lines) {
      const sub = line.sub ? `<div class="sub">${renderInline(line.sub)}</div>` : "";
      rows.push(
        `<tr><td class="desc">${renderInline(line.description)}${sub}</td><td class="amt">${priceCell(line, money)}</td></tr>`,
      );
    }
    if (showSubtotals) {
      const subtotal = g.lines.reduce((s, l) => s + l.offerPrice, 0);
      const label = g.name || "Other";
      rows.push(`<tr class="sub"><td>${escapeHtml(label)} subtotal</td><td class="amt">${escapeHtml(money(subtotal))}</td></tr>`);
    }
  }
  const total = included.reduce((s, l) => s + l.offerPrice, 0);
  rows.push(`<tr class="grand"><td>Total</td><td class="amt">${escapeHtml(money(total))}</td></tr>`);
  return `<table class="pt"><tbody>${rows.join("")}</tbody></table>`;
}

function notesList(tool: Tool): string {
  if (tool.notes.length === 0) return "";
  const items = tool.notes.map((n) => `<li>${renderInline(n)}</li>`).join("");
  return `<ul class="notes">${items}</ul>`;
}

/** The line data the presenter script drives. Descriptions are pre-rendered for display
 *  and kept as plain text for editing. */
function toolDataJson(tool: Tool): string {
  const lines = tool.lines.map((l) => ({
    html: renderInline(l.description),
    text: plainText(l.description),
    sub: l.sub ? renderInline(l.sub) : "",
    offerPrice: l.offerPrice,
    listPrice: l.listPrice ?? null,
    include: l.include,
    group: l.group ?? "",
  }));
  const data = { currency: tool.locale.currency, locale: localeFor(tool.locale.currency), lines };
  // Escape the closing-script sequence so the JSON cannot break out of the <script> block.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * Presenter script. Owns the sheet in presenter mode: renders the display, and on the E
 * key swaps to an editable grid with add, remove, per-line amount and group edits, an
 * include toggle, a percentage adjustment, and reset. The total recomputes live. Written
 * without template literals so it nests safely inside this module's own template string.
 */
const toolJs = `
(function(){
 var el=document.getElementById('dtdata'); if(!el) return;
 var data=JSON.parse(el.textContent);
 var fmt=new Intl.NumberFormat(data.locale,{style:'currency',currency:data.currency,minimumFractionDigits:0,maximumFractionDigits:2});
 function clone(a){return JSON.parse(JSON.stringify(a));}
 var lines=clone(data.lines), original=clone(data.lines), adjust=0, editing=false;
 var root=document.getElementById('dttool');
 function money(n){return fmt.format(isFinite(n)?n:0);}
 function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
 function grandTotal(){var t=0;for(var i=0;i<lines.length;i++){if(lines[i].include)t+=Number(lines[i].offerPrice)||0;}return t*(1+adjust/100);}
 function displayHtml(){
  var inc=lines.filter(function(l){return l.include;});
  var order=[],map={};
  inc.forEach(function(l){var k=l.group||'';if(!map[k]){map[k]=[];order.push(k);}map[k].push(l);});
  var showSub=order.length>=2, rows='';
  order.forEach(function(k){
   map[k].forEach(function(l){
    var list=(l.listPrice!=null&&l.listPrice>l.offerPrice)?'<span class="list">'+esc(money(l.listPrice))+'</span>':'';
    var sub=l.sub?'<div class="sub">'+l.sub+'</div>':'';
    rows+='<tr><td class="desc">'+l.html+sub+'</td><td class="amt">'+list+esc(money(l.offerPrice))+'</td></tr>';
   });
   if(showSub){var st=map[k].reduce(function(s,l){return s+(Number(l.offerPrice)||0);},0);rows+='<tr class="sub"><td>'+esc(k||'Other')+' subtotal</td><td class="amt">'+esc(money(st))+'</td></tr>';}
  });
  rows+='<tr class="grand"><td>Total</td><td class="amt" id="dtgrand">'+esc(money(grandTotal()))+'</td></tr>';
  return '<table class="pt"><tbody>'+rows+'</tbody></table>';
 }
 function editorHtml(){
  var rows='';
  lines.forEach(function(l,i){
   rows+='<tr class="'+(l.include?'':'excl')+'">'+
    '<td><input type="checkbox" data-idx="'+i+'" data-field="include"'+(l.include?' checked':'')+'></td>'+
    '<td><input class="f textf" data-idx="'+i+'" data-field="text" value="'+esc(l.text)+'"></td>'+
    '<td><input class="f groupf" data-idx="'+i+'" data-field="group" value="'+esc(l.group||'')+'" placeholder="group"></td>'+
    '<td class="amt"><input class="f amtf" type="number" data-idx="'+i+'" data-field="offerPrice" value="'+(Number(l.offerPrice)||0)+'"></td>'+
    '<td class="amt"><button class="btn" data-act="remove" data-idx="'+i+'">Remove</button></td>'+
   '</tr>';
  });
  rows+='<tr class="grand"><td colspan="3">Total</td><td class="amt" id="dtgrand">'+esc(money(grandTotal()))+'</td><td></td></tr>';
  return '<table class="pt"><tbody>'+rows+'</tbody></table>';
 }
 function paint(){
  root.innerHTML=editing?editorHtml():displayHtml();
  document.body.classList.toggle('editing',editing);
 }
 function refreshTotal(){var g=document.getElementById('dtgrand');if(g)g.textContent=money(grandTotal());}
 root.addEventListener('input',function(e){
  var t=e.target, idx=t.getAttribute('data-idx'); if(idx===null) return;
  var f=t.getAttribute('data-field'), l=lines[+idx];
  if(f==='offerPrice')l.offerPrice=Number(t.value)||0; else if(f==='text')l.text=t.value; else if(f==='group')l.group=t.value;
  refreshTotal();
 });
 root.addEventListener('change',function(e){
  var t=e.target; if(t.getAttribute('data-field')!=='include') return;
  lines[+t.getAttribute('data-idx')].include=t.checked;
  var tr=t.closest('tr'); if(tr)tr.className=t.checked?'':'excl';
  refreshTotal();
 });
 root.addEventListener('click',function(e){
  var act=e.target.getAttribute&&e.target.getAttribute('data-act'); if(!act) return;
  if(act==='remove')lines.splice(+e.target.getAttribute('data-idx'),1);
  paint();
 });
 var bar=document.getElementById('dtbar');
 if(bar)bar.addEventListener('click',function(e){
  var act=e.target.getAttribute('data-act'); if(!act) return;
  if(act==='add')lines.push({html:'New item',text:'New item',sub:'',offerPrice:0,listPrice:null,include:true,group:''});
  else if(act==='reset'){lines=clone(original);adjust=0;var a=document.getElementById('dtadj');if(a)a.value='0';}
  paint();
 });
 var adj=document.getElementById('dtadj');
 if(adj)adj.addEventListener('input',function(){adjust=Number(adj.value)||0;refreshTotal();});
 document.addEventListener('keydown',function(e){
  if(e.key!=='e'&&e.key!=='E') return;
  var tag=(e.target&&e.target.tagName||'').toLowerCase(); if(tag==='input'||tag==='textarea') return;
  editing=!editing; paint();
 });
 paint();
})();
`;

export interface ToolOptions {
  /** Interactive presenter mode. Defaults to the artifact's own presenterMode flag. The
   *  portal renderer forces this off so the client view is always locked. */
  presenter?: boolean;
  eyebrow?: string;
  /** Confidentiality label, top-right. Default "Private & Confidential"; null to omit. */
  confidentialLabel?: string | null;
  /** The "made with" mark (D12). Default a plain DeckTrail label; null to omit. */
  madeWith?: { label: string; href?: string } | null;
  /** Per-viewer watermark overlay. Set by the portal renderer, not the standalone one. */
  watermark?: { text: string; opacity?: number } | null;
  /** Anti-copy friction. Set by the portal renderer. */
  protect?: boolean;
  /** Engagement beacon config. Set by the portal renderer; absent in a standalone file. */
  beacon?: BeaconConfig | null;
  lang?: string;
  /** @font-face CSS for the theme's family, from fontFaceCss(). See StandaloneOptions.fontCss. */
  fontCss?: string;
}

/** Render a pricing tool to one self-contained HTML file. */
export function renderTool(tool: Tool, theme: Theme, opts: ToolOptions = {}): string {
  const presenter = opts.presenter ?? tool.presenterMode;
  const confidential = opts.confidentialLabel === undefined ? "Private & Confidential" : opts.confidentialLabel;

  const money = (n: number): string => formatterFor(tool.locale.currency).format(n);
  const eyebrow = opts.eyebrow ? `<div class="eyebrow">${escapeHtml(opts.eyebrow)}</div>` : "";
  const confHtml = confidential ? `<div class="confidential">${escapeHtml(confidential)}</div>` : "";
  const madeHtml = renderMadeWith(opts.madeWith, false);
  const wmHtml = opts.watermark ? watermarkLayer(opts.watermark.text) : "";

  // The static table is the locked client view, and also the no-JS fallback in presenter mode.
  const table = staticTable(tool, money);

  // Presenter-only surface: the reveal hint, the edit bar, and the embedded data + script.
  // None of this exists in the locked DOM, so a client can never reach an editing control.
  const presenterChrome = presenter
    ? `<div class="editbar" id="dtbar">
<button class="btn" data-act="add">Add line</button>
<button class="btn" data-act="reset">Reset</button>
<label>Adjust <input class="adj" id="dtadj" type="number" value="0" step="1">%</label>
</div>`
    : "";
  const presenterData = presenter
    ? `<script type="application/json" id="dtdata">${toolDataJson(tool)}</script>`
    : "";
  const presenterHint = presenter ? `<div class="pthint" aria-hidden="true">Press E to edit</div>` : "";

  const css =
    (opts.fontCss ?? "") +
    themeToCss(theme) +
    shellCss +
    toolCss +
    (theme.logo.src ? logoCss : "") +
    (presenter ? toolEditCss : "") +
    (opts.watermark ? watermarkCss(opts.watermark.opacity ?? 0.16) : "") +
    (opts.protect ? antiCopyCss : "");
  const scripts = (presenter ? toolJs : "") + (opts.protect ? antiCopyJs : "") + (opts.beacon ? beaconJs : "");
  const beaconTag = opts.beacon ? beaconConfigTag(opts.beacon) : "";

  const body = `${confHtml}<div class="wrap">${eyebrow}<h1>${escapeHtml(tool.title)}</h1>${presenterChrome}<div id="dttool">${table}</div>${notesList(tool)}</div>${presenterHint}${presenterData}${brandMark(theme, false)}${madeHtml}${wmHtml}${beaconTag}`;

  return htmlDocument({ title: tool.title, lang: opts.lang, css, body, scripts: scripts || undefined });
}
