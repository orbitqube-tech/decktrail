/** Storybook: a warm, generous picture book for grown ups, all soft edges and quiet paper. */
export const storybookCss = `
body{background-image:radial-gradient(1400px 700px at 82% -10%,color-mix(in srgb,var(--accent2) 9%,transparent),transparent 62%),
 radial-gradient(1200px 700px at -10% 8%,color-mix(in srgb,var(--accent) 9%,transparent),transparent 60%)}
.slide{padding:8vh 9vw 10vh}
.slide:has(h1):has(.sub){align-items:center;text-align:center}
.slide:has(h1):has(.sub) h1{max-width:20ch}
.slide:has(h1):has(.sub) .sub{margin-left:auto;margin-right:auto}
.slide:has(h1):has(.sub) .eyebrow{align-self:center}
.eyebrow{border-radius:999px;padding:6px 18px 7px;background:color-mix(in srgb,var(--accent2) 16%,transparent);
 color:var(--accent2);letter-spacing:2.5px;font-weight:700}
h1,h2,h3{font-family:Iowan Old Style,Palatino Linotype,Book Antiqua,Palatino,Georgia,serif}
h1{letter-spacing:-.4px;font-weight:800}
h2{letter-spacing:-.2px;font-weight:800}
h3{font-weight:700}
.grad{background-image:linear-gradient(100deg,var(--accent),var(--accent2))}
p{line-height:1.7;max-width:62ch}
.lede{font-style:italic;line-height:1.65}
.sub{line-height:1.7}
ul.points{margin-top:10px}
ul.points li{padding-left:30px;margin:14px 0}
ul.points li::before{width:11px;height:11px;top:.5em;background:var(--accent2);box-shadow:none}
.grid{gap:22px;margin-top:14px}
.grid.c2{gap:26px}
.grid.c3{gap:22px}
.grid.c4{gap:18px}
.grid.c5{gap:16px}
/* Tinted rather than left on the plain surface token, and given a real edge. On a dark theme
   --s-high sits a shade off the page and a black drop shadow is invisible against it, so a card
   styled that way is the default card with a serif heading on top. The tint and the ring are
   what make this layout legible as its own thing whatever palette it is wearing. */
.card{background:color-mix(in srgb,var(--accent2) 7%,var(--s-high));border-radius:26px;padding:30px 28px;
 box-shadow:0 10px 24px rgba(0,0,0,.18),inset 0 0 0 1.5px color-mix(in srgb,var(--accent2) 24%,transparent)}
.card:hover{transform:rotate(-.4deg)}
@media (prefers-reduced-motion:reduce){.card:hover{transform:none}}
.card .ico{width:46px;height:46px;border-radius:50%;font-size:21px;margin-bottom:14px;
 background:color-mix(in srgb,var(--accent2) 18%,transparent);box-shadow:none}
.card h3{margin-bottom:8px}
.card p{line-height:1.55}
.card .tag{border-radius:999px;padding:3px 12px;background:color-mix(in srgb,var(--accent2) 16%,transparent);color:var(--accent2)}
.card ul{padding-left:20px}
.card ul li{margin:6px 0}
table.st{border-collapse:separate;border-spacing:0;border-radius:18px;overflow:hidden;
 box-shadow:0 8px 20px rgba(0,0,0,.07);margin-top:14px}
table.st th{background:color-mix(in srgb,var(--accent) 10%,transparent);border-bottom:none;padding:12px 16px}
table.st td{padding:12px 16px;border-bottom:1px solid color-mix(in srgb,var(--muted) 14%,transparent)}
table.st tr:last-child td{border-bottom:none}
table.st tfoot td{background:color-mix(in srgb,var(--accent2) 8%,transparent)}
.footnote{font-style:italic;margin-top:16px}
.callout{border-left:none;border-radius:20px;padding:18px 22px;box-shadow:0 8px 18px rgba(0,0,0,.07);
 transform:rotate(-.5deg);position:relative}
.callout::before{content:"";position:absolute;top:-8px;left:28px;width:26px;height:14px;border-radius:5px;
 background:color-mix(in srgb,var(--accent) 30%,transparent)}
.callout.red{background:color-mix(in srgb,var(--bad) 10%,var(--s-high))}
.callout.green{background:color-mix(in srgb,var(--good) 10%,var(--s-high))}
.callout.note{background:color-mix(in srgb,var(--muted) 10%,var(--s-high))}
.flow{gap:16px;margin-top:16px}
.fstep{border-radius:22px;padding:18px 20px;box-shadow:0 8px 18px rgba(0,0,0,.07)}
.fstep .tag{border-radius:999px}
.fstep .tag.t2{border-radius:999px}
.fstep .tag.t3{border-radius:999px}
.fstep .tag.t4{border-radius:999px}
.fstep h3{margin-bottom:6px}
.fstep p{line-height:1.55}
.two{gap:28px}
.stats{gap:22px}
.stat{border-radius:24px;padding:26px;box-shadow:0 8px 18px rgba(0,0,0,.06)}
.stat .v{font-family:Iowan Old Style,Palatino Linotype,Book Antiqua,Palatino,Georgia,serif}
.stat .k{letter-spacing:.4px;margin-top:8px}
.chart{gap:14px;margin-top:16px}
.bar .lbl{font-style:italic}
.bar .track{height:12px;border-radius:999px;background:var(--s-low)}
.bar .fill{border-radius:999px}
figure.shot{margin-top:16px}
figure.shot img{border-radius:20px;box-shadow:0 10px 24px rgba(0,0,0,.1)}
.figcap{font-style:italic;text-align:center;margin-top:10px}
.meta{gap:6px}
.lane{gap:10px}
.lane .h{letter-spacing:1px;padding:8px 8px 10px}
.lane .a{border-radius:14px;background:color-mix(in srgb,var(--accent) 7%,transparent)}
.lane .a .d{background:var(--accent2)}
.lane .c{border-radius:14px;box-shadow:0 4px 10px rgba(0,0,0,.05)}
.lane .c.good{box-shadow:0 4px 10px rgba(0,0,0,.05),inset 0 0 0 1px color-mix(in srgb,var(--good) 45%,transparent)}
.lane .c.warn{box-shadow:0 4px 10px rgba(0,0,0,.05),inset 0 0 0 1px color-mix(in srgb,var(--warn) 45%,transparent)}
.lane .c.bad{box-shadow:0 4px 10px rgba(0,0,0,.05),inset 0 0 0 1px color-mix(in srgb,var(--bad) 45%,transparent)}
.lane .c.dim{opacity:.35}
.legend{gap:20px}
.legend i{border-radius:50%}
.legend i.d2{background:var(--accent2)}
.legend i.d3{background:var(--bad)}

@media (max-width:720px){
 .slide{padding:6vh 6vw 9vh}
 .grid.c2,.grid.c3,.grid.c4,.grid.c5{grid-template-columns:1fr}
 .two{grid-template-columns:1fr}
 .flow{flex-direction:column}
 .card{padding:20px 18px}
 .card:hover{transform:none}
 .stats{grid-template-columns:1fr 1fr}
 .callout{transform:none}
 figure.shot img{border-radius:16px}
}
`;
