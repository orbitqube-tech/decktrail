import { escapeHtml } from "./html.js";

/**
 * The deck shell: framework CSS and navigation JS shared by every rendered deck.
 * All colour and font values come from the theme via CSS custom properties
 * (see theme.ts), so the shell itself carries no brand.
 */

/**
 * The attribution mark (D12, D19). The default credits DeckTrail and OrbitQube with two links
 * (decktrail.com and orbitqube.com). It is a default and a request, not a licence requirement:
 * a self-hoster may pass a custom `{ label, href }`, or `null` to omit it, and needs nobody's
 * permission to do either. See ATTRIBUTION.md for why we ask, and TRADEMARK.md for the thing we
 * do protect, which is the name rather than the mark. `raised` lifts the mark above a deck's
 * bottom navigation bar; a scrolling document or tool leaves it at the edge.
 */
export function renderMadeWith(m: { label: string; href?: string } | null | undefined, raised: boolean): string {
  if (m === null) return "";
  const cls = `madewith${raised ? " up" : ""}`;
  if (m === undefined) {
    return `<span class="${cls}">Made with <a href="https://decktrail.com">DeckTrail</a> by <a href="https://www.orbitqube.com">OrbitQube</a></span>`;
  }
  return m.href ? `<a class="${cls}" href="${escapeHtml(m.href)}">${escapeHtml(m.label)}</a>` : `<span class="${cls}">${escapeHtml(m.label)}</span>`;
}

export const shellCss = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:var(--bg);color:var(--text);font-family:var(--font);-webkit-font-smoothing:antialiased;
 background-image:radial-gradient(1200px 600px at 88% -8%,color-mix(in srgb,var(--accent2) 12%,transparent),transparent 60%),
 radial-gradient(1100px 600px at -8% 10%,color-mix(in srgb,var(--accent) 12%,transparent),transparent 58%)}
.deck{position:relative;height:100vh;width:100vw;overflow:hidden}
.slide{position:absolute;inset:0;padding:6.5vh 6vw 9vh;display:none;flex-direction:column;justify-content:center;opacity:0;transform:translateY(14px);transition:.4s}
.slide.active{display:flex;opacity:1;transform:none}
.eyebrow{font-size:calc(12px * var(--scale));letter-spacing:4px;text-transform:uppercase;color:var(--accent);font-weight:700;margin-bottom:calc(16px * var(--scale))}
h1{font-size:calc(clamp(30px,5.2vw,58px) * var(--scale));line-height:1.07;color:var(--heading);font-weight:900;letter-spacing:-1.4px}
h2{font-size:calc(clamp(22px,3.2vw,38px) * var(--scale));line-height:1.12;color:var(--heading);font-weight:800;letter-spacing:-.8px;margin-bottom:calc(22px * var(--scale))}
h3{font-size:calc(clamp(15px,1.5vw,19px) * var(--scale));color:var(--heading);font-weight:700}
.grad{background:linear-gradient(45deg,var(--accent),var(--accent2));-webkit-background-clip:text;background-clip:text;color:transparent}
p{font-size:calc(clamp(15px,1.5vw,19px) * var(--scale));line-height:1.6;color:var(--text);max-width:66ch}
.lede{font-size:calc(clamp(17px,1.85vw,22px) * var(--scale));line-height:1.6;color:var(--heading);max-width:66ch;margin-bottom:calc(16px * var(--scale))}
.sub{font-size:calc(clamp(16px,1.8vw,22px) * var(--scale));line-height:1.6;color:var(--muted);max-width:62ch;margin-top:calc(14px * var(--scale))}
ul.points{list-style:none;margin-top:6px}
/* The measure lives on the li, not the ul. A ch unit resolves against the element's own
   font-size, and the ul inherits the body's, so a max-width here sized the box for 68
   characters of 16px text and then filled it with 20px text: about 47 fitted, against 76. */
ul.points li{position:relative;padding-left:24px;margin:11px 0;color:var(--text);font-size:calc(clamp(13px,1.4vw,17px) * var(--scale));line-height:1.5;max-width:76ch}
ul.points li::before{content:"";position:absolute;left:0;top:.62em;width:8px;height:8px;border-radius:50%;background:linear-gradient(45deg,var(--accent),var(--accent2));box-shadow:0 0 10px color-mix(in srgb,var(--accent) 50%,transparent)}
.grid{display:grid;gap:calc(12px * var(--scale));margin-top:calc(8px * var(--scale))}
.grid.c2{grid-template-columns:repeat(2,1fr)}
.grid.c3{grid-template-columns:repeat(3,1fr)}
.grid.c4{grid-template-columns:repeat(4,1fr)}
.grid.c5{grid-template-columns:repeat(5,1fr)}
.card{background:var(--s-high);border-radius:14px;padding:calc(18px * var(--scale)) calc(16px * var(--scale));box-shadow:inset 0 0 0 1px rgba(255,255,255,.05)}
/* The icon box. A card that names a role reads faster with a mark against it, and the vetted
   decks give every one. Tinted from the theme, so it is the brand's colour and not a fixed one. */
.card .ico{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:19px;margin-bottom:12px;
 background:linear-gradient(45deg,color-mix(in srgb,var(--accent) 18%,transparent),color-mix(in srgb,var(--accent2) 18%,transparent));
 box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 16%,transparent)}
.card h3{color:var(--heading);font-size:calc(clamp(13px,1.35vw,16px) * var(--scale));font-weight:700;margin-bottom:6px;line-height:1.25}
.card p{color:var(--muted);font-size:calc(clamp(11px,1.1vw,13px) * var(--scale));line-height:1.4;max-width:none}
.card .tag{display:inline-block;margin-bottom:8px;font-size:10px;letter-spacing:.5px;text-transform:uppercase;color:var(--accent);font-weight:700;
 padding:2px 8px;border-radius:20px;background:color-mix(in srgb,var(--accent) 14%,transparent)}
.card ul{margin-top:6px;padding-left:16px;color:var(--muted);font-size:calc(clamp(11px,1.1vw,13px) * var(--scale));line-height:1.4}
.card ul li{margin:4px 0}
table.st{width:100%;border-collapse:collapse;margin-top:8px;font-size:calc(15px * var(--scale))}
table.st th{text-align:left;color:var(--accent);font-weight:700;padding:10px 12px;border-bottom:1px solid color-mix(in srgb,var(--accent) 24%,transparent)}
table.st td{padding:10px 12px;border-bottom:1px solid color-mix(in srgb,var(--muted) 22%,transparent);color:var(--text)}
table.st tfoot td{font-weight:800;color:var(--heading)}
.footnote{margin-top:12px;color:var(--muted);font-size:calc(13px * var(--scale))}
.callout{margin-top:18px;padding:16px 18px;border-radius:12px;background:var(--s-high);border-left:3px solid var(--accent);color:var(--text);font-size:calc(15px * var(--scale))}
.callout.red{border-left-color:var(--bad)}
.callout.green{border-left-color:var(--good)}
.callout.note{border-left-color:var(--muted)}
/* Steps run across, not down. A stage of a process is a peer of the stage beside it, and the
   vetted decks set them as a row of cards; stacking them turned four short steps into a tall
   list with a number circle bigger than the text it numbered. */
.flow{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;align-items:stretch}
.fstep{background:var(--s-high);border-radius:12px;padding:calc(14px * var(--scale)) calc(16px * var(--scale));flex:1;min-width:150px;
 box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);position:relative}
.fstep .tag{font-size:10px;letter-spacing:.5px;text-transform:uppercase;font-weight:700;padding:2px 8px;border-radius:20px;display:inline-block;margin-bottom:8px;
 color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,transparent)}
/* A second and third tag colour, so distinct actors read apart at a glance as they do in the
   vetted decks. Assigned per distinct tag by the renderer, not by meaning. */
.fstep .tag.t2{color:var(--accent2);background:color-mix(in srgb,var(--accent2) 14%,transparent)}
.fstep .tag.t3{color:var(--good);background:color-mix(in srgb,var(--good) 14%,transparent)}
.fstep .tag.t4{color:var(--warn);background:color-mix(in srgb,var(--warn) 14%,transparent)}
.fstep h3{color:var(--heading);font-size:calc(clamp(13px,1.3vw,16px) * var(--scale));font-weight:700;margin-bottom:5px;line-height:1.25}
.fstep p{font-size:calc(clamp(11px,1.1vw,13.5px) * var(--scale));color:var(--muted);line-height:1.4;max-width:none}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:8px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:calc(18px * var(--scale));margin-top:calc(10px * var(--scale))}
.stat{background:var(--s-high);border-radius:14px;padding:calc(22px * var(--scale))}
.stat .v{font-size:calc(34px * var(--scale));font-weight:900;color:var(--heading)}
.stat .v.good{color:var(--good)}.stat .v.warn{color:var(--warn)}.stat .v.bad{color:var(--bad)}
.stat .k{color:var(--muted);font-size:calc(14px * var(--scale));margin-top:6px}
.chart{display:flex;flex-direction:column;gap:10px;margin-top:12px;max-width:70ch}
.bar{display:grid;grid-template-columns:180px 1fr 80px;align-items:center;gap:12px}
.bar .lbl{color:var(--text);font-size:calc(14px * var(--scale))}
.bar .track{height:16px;border-radius:8px;background:var(--s-high);overflow:hidden}
.bar .fill{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.bar .val{color:var(--muted);font-size:calc(13px * var(--scale));text-align:right}
figure.shot{margin-top:12px}
figure.shot img{max-width:100%;border-radius:12px;display:block}
figure.shot figcaption,.figcap{color:var(--muted);font-size:calc(13px * var(--scale));margin-top:8px}
.meta{margin-top:22px;color:var(--muted);font-size:calc(14px * var(--scale));display:flex;flex-direction:column;gap:4px}
/* A swimlane is a grid of cards, not a bordered table. The table read as a spreadsheet: hairline
   rules everywhere, no way to see at a glance which actor owns what, and an empty cell that
   looked like a mistake rather than "nothing happens here". */
.lane{display:grid;gap:6px;margin-top:8px}
.lane .h{color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.5px;font-size:calc(clamp(9px,.92vw,12px) * var(--scale));padding:6px 8px;text-align:center}
.lane .a{color:var(--heading);font-weight:700;font-size:calc(clamp(11px,1.05vw,14px) * var(--scale));display:flex;align-items:center;gap:8px;
 padding:9px 10px;background:rgba(255,255,255,.035);border-radius:9px}
.lane .a .d{width:9px;height:9px;border-radius:50%;flex:none;background:var(--accent)}
.lane .c{background:var(--s-high);border-radius:9px;padding:8px 9px;line-height:1.32;font-size:calc(clamp(9.5px,.98vw,12.5px) * var(--scale));
 box-shadow:inset 0 0 0 1px rgba(255,255,255,.045);color:var(--text)}
.lane .c.good{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--good) 45%,transparent)}
.lane .c.warn{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--warn) 45%,transparent)}
.lane .c.bad{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--bad) 45%,transparent)}
/* An empty cell says "this actor does nothing at this stage", which is information. It is dimmed
   and marked rather than left blank, so it does not read as a gap in the deck. */
.lane .c.dim{opacity:.32;display:flex;align-items:center;justify-content:center;color:var(--muted)}
.legend{display:flex;flex-wrap:wrap;gap:16px;margin-top:14px;font-size:calc(12px * var(--scale));color:var(--muted)}
.legend span{display:flex;align-items:center;gap:7px}
.legend i{width:9px;height:9px;border-radius:50%;background:var(--accent);display:block}
.legend i.d2{background:var(--accent2)}.legend i.d3{background:var(--bad)}

/* A flowchart is a flow, drawn as SVG with computed coordinates (flowchart.ts). It used to be a
   row of pills followed by its own edge list as bullets, which is the data and not the diagram.
   The colours come from the theme like everything else, so the diagram is the brand's. */
.fc{display:block;margin-top:10px;max-height:60vh;width:100%}
.fc .fc-box{fill:var(--s-high);stroke:color-mix(in srgb,var(--accent) 34%,transparent);stroke-width:1.4}
.fc .fc-box.bad{stroke:color-mix(in srgb,var(--bad) 60%,transparent)}
.fc .fc-dec{fill:color-mix(in srgb,var(--accent2) 12%,transparent);stroke:var(--accent2);stroke-width:1.6}
.fc .fc-l{stroke:var(--accent);stroke-width:2;fill:none}
.fc .fc-l.bad{stroke:var(--bad)}
.fc .fc-loop{stroke:var(--accent2);stroke-width:1.8;fill:none}
.fc .fc-ahp{fill:var(--accent)}
.fc .fc-ahp.bad{fill:var(--bad)}
.fc .fc-ahp.loop{fill:var(--accent2)}
.fc .fc-t{fill:var(--heading);font-family:var(--font);font-size:14px;font-weight:700}
.fc .fc-t.dec{fill:var(--accent2)}
.fc .fc-t.bad{fill:var(--bad)}
.fc .fc-el{fill:var(--muted);font-family:var(--font);font-size:11px}
.fc .fc-el.bad{fill:color-mix(in srgb,var(--bad) 78%,white)}
.fc .fc-el.loop{fill:var(--accent2);font-weight:700}
.progress{position:fixed;top:0;left:0;height:3px;background:linear-gradient(90deg,var(--accent),var(--accent2));width:0;transition:.4s;z-index:20}
.bar-nav{position:fixed;bottom:0;left:0;right:0;height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 26px;z-index:20}
/* Three parts: the made-with mark far left, the deck's name centred, the counter and both arrows
   right. The name sits in the middle because it is the one thing that is about the deck rather
   than about the software or the reader's position in it. The grid keeps it centred on the slide
   and not merely on the space left over, which is what a flex row would have given. */
/* minmax(0,...) on every track, or a cell wider than its share overflows into its neighbour
   instead of shrinking: the made-with mark ran straight through the deck's own title on any
   narrow viewport, and a deck is read in a half-screen window more often than not. */
/* Every track minmax(0,...) so a track may shrink below its content, and every cell stretched to
   its track rather than justify-self'd to its content width: an item sized to its content ignores
   the track and runs into its neighbour, which is how the made-with mark came to sit on top of
   the deck's own title in any half-width window. The alignment happens inside each cell. */
.bar-nav{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,auto) minmax(0,1fr);gap:12px}
.bar-nav > div{display:flex;align-items:center;min-width:0;overflow:hidden}
.bar-nav .b-left{gap:10px;font-size:12.5px;color:var(--muted);justify-content:flex-start}
.bar-nav .b-mid{gap:9px;font-size:12.5px;color:var(--muted);justify-content:center}
.bar-nav .b-right{gap:14px;justify-content:flex-end;overflow:visible}
.bar-nav .b-mid .t,.bar-nav .b-left .madewith{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* When all three will not fit, they give way in the order a reader needs least: the mark first,
   then the deck's name. The counter and the arrows always stay. */
@media(max-width:900px){.bar-nav .b-left{display:none}}
@media(max-width:620px){.bar-nav .b-mid{display:none}}
.nav{width:36px;height:36px;border-radius:50%;background:var(--s-high);color:var(--heading);border:none;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center}
.nav:hover{background:color-mix(in srgb,var(--accent) 16%,var(--s-high));color:var(--accent)}
.counter{color:var(--muted);font-size:13px;cursor:pointer;font-variant-numeric:tabular-nums;user-select:none}
.counter:hover{color:var(--accent)}
.confidential{position:fixed;top:10px;right:14px;z-index:25;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--muted)}
/* On a document or a tool there is no bar, so the mark floats at the bottom left corner. On a
   deck it is placed into the bar's left cell instead (see .bar-nav .b-left .madewith), because a
   floating mark and a fixed bar have no way to agree about the same corner: it used to sit under
   the arrows, and lifting it clear only moved the collision onto the deck's own name. */
.madewith{position:fixed;bottom:14px;left:26px;z-index:19;font-size:calc(11px * var(--scale));color:var(--muted);text-decoration:none}
.madewith a{color:var(--text);text-decoration:none}
.madewith a:hover{text-decoration:underline}
.bar-nav .madewith{position:static;font-size:11.5px;white-space:nowrap}
/* Jump to a slide. The counter is the handle: a reader who wants slide 19 should not press the
   arrow nineteen times. Keyed to "o", and to Escape on the way out. */
#jumpmenu{position:fixed;inset:0;background:color-mix(in srgb,var(--bg) 93%,transparent);backdrop-filter:blur(6px);z-index:40;display:none;
 grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px;align-content:start;padding:38px 40px;overflow:auto}
#jumpmenu.on{display:grid}
/* The way out, said rather than implied. Escape and a click on the backdrop both closed it, and
   neither was written anywhere on the screen, so the only visible way back to the slide you were
   reading was to pick it out of the grid again. */
#jumpmenu .jt{grid-column:1/-1;color:var(--muted);font-size:12px;letter-spacing:2px;text-transform:uppercase;
 margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:16px}
#jumpmenu .jback{font:inherit;font-size:12px;letter-spacing:1px;text-transform:uppercase;border:none;cursor:pointer;
 background:var(--s-high);color:var(--accent);border-radius:8px;padding:7px 13px;display:flex;align-items:center;gap:8px;
 box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 26%,transparent)}
#jumpmenu .jback:hover{background:color-mix(in srgb,var(--accent) 16%,var(--s-high))}
#jumpmenu .jback kbd{font:inherit;font-size:10px;opacity:.75;border:1px solid currentColor;border-radius:4px;padding:0 4px}
#jumpmenu .ji{display:flex;align-items:center;gap:12px;text-align:left;background:var(--s-high);color:var(--text);border:none;border-radius:12px;
 padding:12px 14px;cursor:pointer;font:inherit;font-size:13.5px;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--accent) 12%,transparent)}
#jumpmenu .ji:hover{background:color-mix(in srgb,var(--accent) 14%,var(--s-high));color:var(--accent)}
#jumpmenu .ji.on{box-shadow:inset 0 0 0 1px var(--accent)}
#jumpmenu .ji span:last-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#jumpmenu .jn{min-width:26px;height:26px;border-radius:7px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent);
 display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none}
`;

export const shellJs = `
(function(){
 var slides=[].slice.call(document.querySelectorAll('.slide'));
 var i=0,prog=document.getElementById('prog'),counter=document.getElementById('counter'),jump=null;
 // The slide is in the URL, so a deck can be linked to at the slide worth reading: deck.html#12
 // opens on slide 12, and moving through the deck keeps the address honest. One-based, because
 // the number in the address should be the number in the counter.
 function fromHash(){var n=parseInt(String(location.hash||'').slice(1),10);return isNaN(n)?null:n-1}
 function show(n,quiet){i=Math.max(0,Math.min(slides.length-1,n));
  slides.forEach(function(s,x){s.classList.toggle('active',x===i)});
  if(prog)prog.style.width=(slides.length<2?100:(i/(slides.length-1)*100))+'%';
  if(counter)counter.textContent=(i+1)+' / '+slides.length;
  if(jump)[].slice.call(jump.querySelectorAll('.ji')).forEach(function(b,x){b.classList.toggle('on',x===i)});
  // replaceState, not a hash assignment: the deck should not fill the reader's back button with
  // every slide they passed through on the way here.
  if(!quiet&&history.replaceState)try{history.replaceState(null,'','#'+(i+1))}catch(e){}}
 window.addEventListener('hashchange',function(){var n=fromHash();if(n!==null&&n!==i)show(n,true)});
 var next=document.getElementById('next'),prev=document.getElementById('prev');
 if(next)next.onclick=function(){show(i+1)};
 if(prev)prev.onclick=function(){show(i-1)};

 // Jump to a slide: every slide as a card, titled by its own eyebrow or heading.
 jump=document.createElement('div');jump.id='jumpmenu';
 var hdr=document.createElement('div');hdr.className='jt';
 var ht=document.createElement('span');ht.textContent='Jump to a slide';hdr.appendChild(ht);
 // Named for what it does, not for the widget it is: a reader who opened this to look around
 // wants the slide they left, and closing is how they get it.
 var back=document.createElement('button');back.className='jback';back.type='button';
 back.innerHTML='Back to the slide <kbd>Esc</kbd>';
 back.addEventListener('click',function(){jump.classList.remove('on')});
 hdr.appendChild(back);jump.appendChild(hdr);
 slides.forEach(function(s,idx){
  var eb=s.querySelector('.eyebrow'),h=s.querySelector('h1,h2');
  var t=(eb&&eb.textContent.trim())||(h&&h.textContent.trim())||('Slide '+(idx+1));
  var b=document.createElement('button');b.className='ji';b.type='button';
  var n=document.createElement('span');n.className='jn';n.textContent=String(idx+1);
  var l=document.createElement('span');l.textContent=t;
  b.appendChild(n);b.appendChild(l);
  b.addEventListener('click',function(){show(idx);jump.classList.remove('on')});
  jump.appendChild(b);});
 jump.addEventListener('click',function(e){if(e.target===jump)jump.classList.remove('on')});
 document.body.appendChild(jump);
 if(counter){counter.title='Jump to a slide';counter.addEventListener('click',function(e){e.stopPropagation();jump.classList.toggle('on')})}

 document.addEventListener('keydown',function(e){
  var t=document.activeElement&&document.activeElement.tagName;
  if(t==='INPUT'||t==='TEXTAREA')return;
  if(e.key==='ArrowRight'||e.key===' '||e.key==='PageDown'){e.preventDefault();show(i+1)}
  else if(e.key==='ArrowLeft'||e.key==='PageUp'){e.preventDefault();show(i-1)}
  else if(e.key==='Home'){e.preventDefault();show(0)}
  else if(e.key==='End'){e.preventDefault();show(slides.length-1)}
  else if(e.key==='o'||e.key==='O'){e.preventDefault();jump.classList.toggle('on')}
  else if(e.key==='Escape'){jump.classList.remove('on')}
  else if(e.key==='f'||e.key==='F'){document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen()}});

 // No click-to-advance. It cost the reader any attempt to select a line, and a deck sent to a
 // client is read, not clicked through: a stray click on a paragraph should do nothing.
 show(fromHash()||0,true);
})();
`;
