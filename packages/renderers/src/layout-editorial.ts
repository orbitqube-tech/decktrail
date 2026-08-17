/** A broadsheet magazine layout: serif type, hairline rules instead of cards and shadows, and a
 *  left-weighted asymmetric page instead of the shell's centred one. */
export const editorialCss = `
.deck{font-family:Georgia,'Times New Roman',Cambria,var(--font);}
body{background-image:none;}

.slide{align-items:flex-start;text-align:left;padding:9vh 12vw 10vh 7vw;}

.eyebrow{display:inline-flex;align-items:center;font-variant:small-caps;text-transform:none;
 font-weight:600;letter-spacing:.1em;color:var(--accent);border:0;}
.eyebrow::before{content:'';display:inline-block;width:20px;height:2px;background:var(--accent);
 margin-right:12px;flex:0 0 20px;}

h1{font-weight:400;letter-spacing:-.025em;line-height:.98;color:var(--heading);}
h2{font-weight:500;letter-spacing:-.015em;line-height:1.08;color:var(--heading);}
h3{font-weight:600;letter-spacing:0;}
.grad{background:none;-webkit-text-fill-color:currentColor;color:var(--accent);}

p{max-width:60ch;}
.lede{font-style:italic;font-weight:400;max-width:60ch;}
.sub{max-width:56ch;}

/* The dot-and-glow bullet is a screen idiom. A tick mark reads as a printed list, and it is the
   same hairline used for the card and step rules, so the page feels like one system. */
ul.points{max-width:60ch;}
ul.points li{padding-left:28px;max-width:none;}
ul.points li::before{top:.82em;width:16px;height:1px;border-radius:0;
 background:var(--accent);box-shadow:none;}

.grid{gap:0 40px;}
.grid.c2{grid-template-columns:repeat(2,1fr);}
.grid.c3{grid-template-columns:repeat(3,1fr);}
.grid.c4{grid-template-columns:repeat(4,1fr);}
.grid.c5{grid-template-columns:repeat(4,minmax(0,1fr));}

/* The signature move: a hairline top rule stands in for the card's fill and shadow. */
.card{background:none;box-shadow:none;border-radius:0;border-top:1px solid
 color-mix(in srgb,var(--accent) 34%,transparent);padding:20px 24px 0 0;}
.card .ico{width:auto;height:auto;border-radius:0;background:none;box-shadow:none;
 justify-content:flex-start;font-size:1.35em;color:var(--accent);margin-bottom:16px;}
.card h3{font-weight:600;margin-bottom:8px;}
.card p{font-style:normal;}
.card .tag{background:none;border-radius:0;padding:0;font-variant:small-caps;
 text-transform:none;letter-spacing:.08em;color:var(--accent2);}
.card ul{padding-left:0;}
.card ul li{position:relative;padding-left:18px;}
.card ul li::before{content:'';position:absolute;left:0;top:.62em;width:10px;height:1px;
 background:var(--muted);}

table.st{margin-top:22px;}
table.st th{font-variant:small-caps;text-transform:none;letter-spacing:.06em;font-weight:600;
 color:var(--heading);border-bottom:2px solid var(--heading);}
table.st td{font-variant-numeric:tabular-nums;border-bottom:1px solid
 color-mix(in srgb,var(--muted) 26%,transparent);}
table.st tbody tr:last-child td{border-bottom:1px solid
 color-mix(in srgb,var(--heading) 40%,transparent);}
table.st tfoot td{border-top:2px solid var(--heading);border-bottom:0;}

.footnote{border-top:1px solid color-mix(in srgb,var(--muted) 30%,transparent);
 padding-top:10px;font-style:italic;}

/* A pull quote, not an alert box: thick rule, larger italic serif, no fill. */
.callout{background:none;border-radius:0;border-left:4px solid var(--accent);
 padding:4px 0 4px 26px;font-style:italic;font-size:calc(19px * var(--scale));
 line-height:1.5;color:var(--heading);}
.callout.red{border-left-color:var(--bad);}
.callout.green{border-left-color:var(--good);}
.callout.note{border-left-color:var(--muted);}

.flow{gap:0;}
.fstep{background:none;box-shadow:none;border-radius:0;flex:1 1 200px;
 border-top:1px solid color-mix(in srgb,var(--accent) 30%,transparent);
 padding:18px 22px 0 0;margin-right:10px;}
.fstep .tag{background:none;border-radius:0;padding:0;font-variant:small-caps;
 text-transform:none;letter-spacing:.07em;}
.fstep .tag.t2{background:none;}
.fstep .tag.t3{background:none;}
.fstep .tag.t4{background:none;}
.fstep h3{font-weight:600;}

.two{gap:0;align-items:start;}
.two > *:first-child{border-right:1px solid color-mix(in srgb,var(--muted) 24%,transparent);
 padding-right:36px;}
.two > *:last-child{padding-left:36px;}

/* Pull-figures: large serif numerals over a small letter-spaced label, the way a magazine sets a
   headline statistic. The hairline between figures does the work the card fill used to. */
.stats{gap:0;}
/* min-width:0 because a grid item defaults to min-content width, so a long unbroken value
   pushes its own column wider than the track and out over its neighbour. */
.stat{background:none;border-radius:0;padding:0 34px;min-width:0;}
.stat:first-child{padding-left:0;}
.stat + .stat{border-left:1px solid color-mix(in srgb,var(--muted) 24%,transparent);}
/* Sized for a word, not only for a number. A stat value is usually short ("62%", "3x") and the
   first draft of this rule assumed it always was, at up to 96px before the theme scale. A deck
   that puts a word there instead ("Attribute") then ran straight through its neighbour, because
   nothing was wrapping and nothing was bounded by the column. The figure still reads as a pull
   figure; it just cannot exceed its own cell any more. */
.stat .v{font-weight:300;font-size:calc(clamp(34px,4.2vw,64px) * var(--scale));
 letter-spacing:-.02em;line-height:1.02;overflow-wrap:anywhere;hyphens:auto;max-width:100%;}
.stat .k{text-transform:uppercase;letter-spacing:.12em;margin-top:14px;}

.chart{max-width:64ch;}
.bar .track{border-radius:0;background:color-mix(in srgb,var(--muted) 14%,transparent);
 height:8px;}
.bar .fill{background:var(--accent);}
.bar .val{font-variant-numeric:tabular-nums;}

figure.shot img{border-radius:0;}
.figcap{border-top:1px solid color-mix(in srgb,var(--muted) 26%,transparent);
 padding-top:8px;font-style:italic;}
.meta{border-top:1px solid color-mix(in srgb,var(--muted) 20%,transparent);
 padding-top:12px;}

.lane .h{background:none;border-radius:0;border-bottom:2px solid var(--heading);
 color:var(--heading);font-variant:small-caps;text-transform:none;padding:6px 4px 10px;}
.lane .a{background:none;border-radius:0;border-bottom:1px solid
 color-mix(in srgb,var(--muted) 26%,transparent);padding:9px 4px;}
.lane .c{background:none;border-radius:0;box-shadow:none;
 border:1px solid color-mix(in srgb,var(--muted) 24%,transparent);}
.lane .c.good{box-shadow:none;border-color:var(--good);}
.lane .c.warn{box-shadow:none;border-color:var(--warn);}
.lane .c.bad{box-shadow:none;border-color:var(--bad);}
.lane .c.dim{opacity:.4;border-style:dashed;}
.legend{border-top:1px solid color-mix(in srgb,var(--muted) 20%,transparent);
 padding-top:12px;}

@media (max-width:720px){
 .slide{padding:7vh 7vw 9vh;}
 .grid.c2,.grid.c3,.grid.c4,.grid.c5{grid-template-columns:1fr;gap:24px;}
 .card{padding-right:0;}
 .flow{flex-direction:column;}
 .fstep{margin-right:0;padding-right:0;}
 .two{grid-template-columns:1fr;}
 .two > *:first-child{border-right:0;border-bottom:1px solid
   color-mix(in srgb,var(--muted) 24%,transparent);padding-right:0;padding-bottom:24px;}
 .two > *:last-child{padding-left:0;padding-top:24px;}
 .stats{grid-template-columns:1fr;}
 .stat{padding:0;}
 .stat + .stat{border-left:0;border-top:1px solid
   color-mix(in srgb,var(--muted) 24%,transparent);padding-top:18px;margin-top:18px;}
}
`;
