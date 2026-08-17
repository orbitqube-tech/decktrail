/**
 * Vivid: the loudest of the four layouts, for a launch deck or a pitch. Solid saturated blocks
 * stand in for the shell's soft tinted panels, headings are pushed hard past shell scale, and
 * every shadow is a flat offset rather than a blur, so a slide reads like a printed poster
 * rather than a pane of glass. Siblings in a grid or a flow alternate accent and accent2 so a
 * row of cards reads as a colour rhythm, not a single tint repeated.
 */
export const vividCss = `
.deck{background:var(--bg)}
.slide{background:var(--bg);padding:6vh 6vw 10vh}
.eyebrow{display:inline-block;background:var(--accent2);color:var(--bg);padding:7px 16px;border-radius:2px;font-weight:800;letter-spacing:2px;box-shadow:5px 5px 0 0 var(--bg)}
h1{font-size:calc(clamp(38px,7vw,84px) * var(--scale));font-weight:900;letter-spacing:-3px;line-height:1}
h2{font-size:calc(clamp(26px,4.2vw,50px) * var(--scale));font-weight:900;letter-spacing:-1.6px;line-height:1.03;display:flex;align-items:center;gap:14px}
h2::before{content:"";width:14px;height:14px;background:var(--accent);flex:none;border-radius:2px}
h3{font-weight:800;letter-spacing:-.2px}
.grad{background:linear-gradient(100deg,var(--accent) 40%,var(--accent2) 60%);-webkit-background-clip:text;background-clip:text;color:transparent;font-weight:900}
p{font-weight:500}
.lede{font-weight:700}
.sub{font-weight:500}
ul.points{margin-top:10px}
ul.points li{padding-left:30px;font-weight:600}
/* A square bar reads as a mark, not a bullet, and needs no glow to sit forward on a saturated
   background the way the shell's soft dot did. */
ul.points li::before{top:.42em;width:14px;height:14px;border-radius:2px;background:var(--accent);box-shadow:none}
ul.points li:nth-child(even)::before{background:var(--accent2)}
.grid{gap:calc(16px * var(--scale))}
/* The signature move: a card is a filled block, not a tinted panel, so every colour inside it
   has to flip to something that survives sitting on top of --accent. --text is tuned for the
   page background and disappears here, so nothing inside a filled card uses it. */
.card{border-radius:3px;background:var(--accent);color:var(--bg);box-shadow:6px 6px 0 0 var(--bg);padding:calc(22px * var(--scale)) calc(20px * var(--scale))}
.card:nth-child(even){background:var(--accent2)}
.card .ico{background:color-mix(in srgb,var(--bg) 22%,transparent);box-shadow:none;border-radius:2px;color:var(--bg)}
.card h3{color:var(--bg);font-weight:900}
.card p{color:color-mix(in srgb,var(--bg) 80%,transparent)}
.card .tag{background:color-mix(in srgb,var(--bg) 24%,transparent);color:var(--bg);border-radius:2px;font-weight:800}
.card ul{color:color-mix(in srgb,var(--bg) 82%,transparent)}
.card ul li{font-weight:600}
table.st{border-collapse:separate;border-spacing:0}
table.st th{background:var(--accent2);color:var(--bg);font-weight:800;border-bottom:none;letter-spacing:.4px;text-transform:uppercase;font-size:calc(12px * var(--scale))}
table.st td{border-bottom:2px solid var(--s-high);font-weight:600}
table.st tfoot td{color:var(--accent);border-bottom:none;border-top:3px solid var(--accent)}
.footnote{text-transform:uppercase;letter-spacing:1px;font-weight:700;font-size:calc(11px * var(--scale))}
.callout{border-radius:3px;background:var(--accent);color:var(--bg);border-left:none;box-shadow:6px 6px 0 0 var(--bg);font-weight:700}
.callout.red{background:var(--bad)}
.callout.green{background:var(--good)}
.callout.note{background:var(--muted);color:var(--bg)}
.flow{gap:calc(14px * var(--scale))}
.fstep{border-radius:3px;background:var(--accent2);color:var(--bg);box-shadow:6px 6px 0 0 var(--bg)}
.fstep:nth-child(even){background:var(--accent)}
.fstep .tag,.fstep .tag.t2,.fstep .tag.t3,.fstep .tag.t4{background:color-mix(in srgb,var(--bg) 24%,transparent);color:var(--bg);border-radius:2px;font-weight:800}
.fstep h3{color:var(--bg);font-weight:900}
.fstep p{color:color-mix(in srgb,var(--bg) 82%,transparent)}
.two{gap:calc(28px * var(--scale))}
.stats{gap:calc(20px * var(--scale))}
.stat{border-radius:3px;background:var(--accent);box-shadow:6px 6px 0 0 var(--bg);padding:calc(24px * var(--scale))}
.stat:nth-child(even){background:var(--accent2)}
/* A stat value is usually short, and sometimes it is a word rather than a number. Allowed to
   break and to shrink with its column, so a long one cannot run out over its neighbour. */
.stat{min-width:0}
.stat .v{color:var(--bg);font-size:calc(48px * var(--scale));letter-spacing:-2px;
 overflow-wrap:anywhere;max-width:100%}
.stat .v.good{color:var(--bg)}
.stat .v.warn{color:var(--bg)}
.stat .v.bad{color:var(--bg)}
.stat .k{color:color-mix(in srgb,var(--bg) 78%,transparent);text-transform:uppercase;letter-spacing:1px;font-weight:800}
.chart{gap:14px}
.bar .track{border-radius:0;background:var(--s-high)}
.bar .fill{background:var(--accent)}
.bar .lbl{font-weight:700}
.bar .val{font-weight:800;color:var(--heading)}
figure.shot img{border-radius:3px;box-shadow:6px 6px 0 0 var(--bg)}
.figcap{font-weight:700;text-transform:uppercase;letter-spacing:1px;font-size:calc(11px * var(--scale))}
.meta{font-weight:600}
.lane{gap:8px}
.lane .h{background:var(--accent2);color:var(--bg);border-radius:2px;font-weight:800}
.lane .a{background:var(--accent);color:var(--bg);border-radius:2px;font-weight:800}
.lane .a .d{background:var(--bg);border-radius:2px}
.lane .c{border-radius:2px;box-shadow:none;font-weight:600}
.lane .c.good{box-shadow:inset 0 0 0 2px var(--good)}
.lane .c.warn{box-shadow:inset 0 0 0 2px var(--warn)}
.lane .c.bad{box-shadow:inset 0 0 0 2px var(--bad)}
.legend{font-weight:700;text-transform:uppercase;letter-spacing:.5px}
.legend i{border-radius:2px}
@media (prefers-reduced-motion: reduce){
 h2::before{transition:none}
}
@media (max-width: 720px){
 .slide{padding:5vh 6vw 11vh}
 h1{font-size:calc(clamp(30px,10vw,50px) * var(--scale))}
 h2{font-size:calc(clamp(22px,7vw,32px) * var(--scale))}
 .eyebrow{padding:5px 12px}
 .grid.c2,.grid.c3,.grid.c4,.grid.c5{grid-template-columns:1fr}
 .two{grid-template-columns:1fr}
 .flow{flex-direction:column}
 .stats{grid-template-columns:1fr 1fr}
 .stat .v{font-size:calc(34px * var(--scale))}
 .bar{grid-template-columns:1fr}
 .bar .val{text-align:left}
 .card,.fstep,.stat,.callout,.eyebrow,figure.shot img{box-shadow:4px 4px 0 0 var(--bg)}
}
`;
