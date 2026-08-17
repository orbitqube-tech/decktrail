/** Crest: a formal, squared, document-like layout for an engagement or a review, where the
 * reader should feel the sender was careful. Soft shadows and round corners are replaced with
 * crisp 1px tinted borders, and every slide carries a small stamped mark so the deck reads as an
 * issued record rather than a pitch. */
export const crestCss = `
body{background-image:none}

/* The rule across the top is the stamp. A corner bracket was tried here as well and removed:
   a slide is positioned to the viewport edges, so a mark at its top left corner landed under the
   progress bar and read as a stray box rather than as a deliberate crop mark. One stamp is
   enough, and the full width rule is the one that survives a screenshot. */
.slide{padding:5.6vh 5.8vw 8.6vh;border-top:3px solid var(--accent)}

.eyebrow{font-size:calc(11px * var(--scale));letter-spacing:3px;font-weight:800;margin-bottom:calc(14px * var(--scale))}
.eyebrow::before{content:"";display:inline-block;width:6px;height:6px;margin-right:8px;vertical-align:middle;background:var(--accent)}

h1{font-weight:700;letter-spacing:-.6px;line-height:1.04}
h2{font-weight:700;letter-spacing:-.4px;margin-bottom:calc(18px * var(--scale))}
h3{font-weight:700;letter-spacing:-.2px}

/* The gradient headline reads as a pitch deck's flourish. A crest heading is issued, not
 * designed, so it takes the same solid heading colour as everything around it. */
.grad{background:none;-webkit-background-clip:initial;background-clip:initial;
 -webkit-text-fill-color:var(--heading);color:var(--heading)}

p{line-height:1.55}
.lede{line-height:1.5;margin-bottom:calc(12px * var(--scale));color:var(--heading)}
.sub{margin-top:calc(10px * var(--scale))}

ul.points li{margin:8px 0;padding-left:20px}
/* A short dash reads as a ruled list item on a printed brief. The circle it replaces belonged to
 * a warmer, informal layout; this one has no glow and no gradient, only the accent flat. */
ul.points li::before{border-radius:0;top:.68em;width:10px;height:2px;background:var(--accent);box-shadow:none}

.grid{gap:calc(10px * var(--scale))}

.card{border:1px solid color-mix(in srgb,var(--accent) 28%,transparent);border-radius:0;
 box-shadow:none;padding:0;position:relative;overflow:hidden}
.card::before{content:"";display:block;height:5px;background:var(--accent)}
.card{display:flex;flex-direction:column;padding-bottom:calc(16px * var(--scale))}
.card .ico,.card h3,.card p,.card .tag,.card ul{padding-left:calc(16px * var(--scale));padding-right:calc(16px * var(--scale))}
.card .ico{border-radius:2px;margin-top:calc(14px * var(--scale));box-shadow:none;
 background:color-mix(in srgb,var(--accent) 14%,transparent);
 border:1px solid color-mix(in srgb,var(--accent) 26%,transparent)}
.card h3{letter-spacing:-.1px}
.card .tag{border-radius:0;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent)}

table.st{border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);font-variant-numeric:tabular-nums}
table.st th{background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--heading);
 text-transform:uppercase;letter-spacing:.5px;font-size:calc(12px * var(--scale));
 border:1px solid color-mix(in srgb,var(--accent) 30%,transparent)}
table.st td{border:1px solid color-mix(in srgb,var(--muted) 22%,transparent);font-variant-numeric:tabular-nums}
/* A faint band on every other row is how a printed schedule stays readable across many rows
 * without colour doing the work; the tint comes from the accent, never a fixed grey. */
table.st tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--accent) 5%,transparent)}
table.st tfoot td{border-top:2px solid var(--accent);background:color-mix(in srgb,var(--accent) 8%,transparent)}

.footnote{border-top:1px solid color-mix(in srgb,var(--muted) 24%,transparent);padding-top:10px}

.callout{border-radius:0;border:1px solid color-mix(in srgb,var(--accent) 26%,transparent);
 border-left-width:3px}
.callout.red{border-color:color-mix(in srgb,var(--bad) 40%,transparent);border-left-color:var(--bad)}
.callout.green{border-color:color-mix(in srgb,var(--good) 40%,transparent);border-left-color:var(--good)}
.callout.note{border-color:color-mix(in srgb,var(--muted) 34%,transparent);border-left-color:var(--muted)}

.flow{gap:0}
.fstep{border-radius:0;box-shadow:none;border:1px solid color-mix(in srgb,var(--accent) 24%,transparent);
 margin-left:-1px}
.fstep:first-child{margin-left:0}
.fstep .tag{border-radius:0;border:1px solid color-mix(in srgb,var(--accent) 30%,transparent)}
.fstep .tag.t2{border-color:color-mix(in srgb,var(--accent2) 30%,transparent)}
.fstep .tag.t3{border-color:color-mix(in srgb,var(--good) 30%,transparent)}
.fstep .tag.t4{border-color:color-mix(in srgb,var(--warn) 30%,transparent)}
.fstep h3{letter-spacing:-.1px}

.two{gap:26px}

.stats{gap:calc(14px * var(--scale))}
.stat{border-radius:0;border:1px solid color-mix(in srgb,var(--accent) 26%,transparent);padding:calc(18px * var(--scale))}
.stat .v{color:var(--accent);font-weight:700;font-variant-numeric:tabular-nums}
.stat .k{text-transform:uppercase;letter-spacing:.5px;font-size:calc(12px * var(--scale))}

.chart{gap:8px}
.bar .track{border-radius:0;border:1px solid color-mix(in srgb,var(--accent) 24%,transparent);height:12px}
.bar .fill{background:var(--accent)}
.bar .val{font-variant-numeric:tabular-nums}

figure.shot img{border-radius:0;border:1px solid color-mix(in srgb,var(--accent) 26%,transparent)}
figure.shot figcaption,.figcap{text-transform:uppercase;letter-spacing:.4px;font-size:calc(11px * var(--scale))}
.meta{border-top:1px solid color-mix(in srgb,var(--muted) 24%,transparent);padding-top:10px}

.lane{gap:4px}
.lane .h{color:var(--accent)}
.lane .a{border-radius:0;background:var(--s-high);border:1px solid color-mix(in srgb,var(--accent) 26%,transparent)}
.lane .a .d{border-radius:0;width:8px;height:8px}
.lane .c{border-radius:0;box-shadow:none;border:1px solid color-mix(in srgb,var(--muted) 22%,transparent)}
.lane .c.good{border-color:color-mix(in srgb,var(--good) 50%,transparent)}
.lane .c.warn{border-color:color-mix(in srgb,var(--warn) 50%,transparent)}
.lane .c.bad{border-color:color-mix(in srgb,var(--bad) 50%,transparent)}
.lane .c.dim{border-style:dashed}

.legend i{border-radius:0}
.legend i.d2{border-radius:0}
.legend i.d3{border-radius:0}

.progress{background:var(--accent)}
.nav{border-radius:0;border:1px solid color-mix(in srgb,var(--accent) 24%,transparent)}
.nav:hover{border-color:var(--accent)}
.bar-nav{border-top:1px solid color-mix(in srgb,var(--accent) 20%,transparent)}

@media (prefers-reduced-motion: reduce) {
 .card,.fstep,.stat,.nav{transition:none}
}

@media (max-width: 720px) {
 .slide{padding:5vh 6vw 9vh}
 .grid.c2,.grid.c3,.grid.c4,.grid.c5{grid-template-columns:1fr}
 .two{grid-template-columns:1fr}
 .flow{flex-direction:column}
 .fstep{margin-left:0;margin-top:-1px}
 .fstep:first-child{margin-top:0}
 table.st{font-size:calc(12px * var(--scale))}
 .card .ico,.card h3,.card p,.card .tag,.card ul{padding-left:calc(12px * var(--scale));padding-right:calc(12px * var(--scale))}
}
`;
