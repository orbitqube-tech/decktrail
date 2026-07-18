import { escapeHtml } from "@decktrail/renderers";

/**
 * Where a viewer may be sent back to after signing in.
 *
 * Only a path on this portal. A `next` arrives in a URL, so it is attacker-supplied, and an
 * open redirect on the end of a magic link is a phishing gift: a link that really is from the
 * portal, really does sign you in, and then lands you somewhere else entirely.
 *
 * "//evil.example" and "https://evil.example" are both rejected: the first is protocol
 * relative and a browser reads it as another host, which is the classic way this check gets
 * passed by a lone startsWith("/").
 */
export function safeNext(next: unknown): string | null {
  if (typeof next !== "string" || next === "") return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

/**
 * Shown when a signed-in viewer opens a link that does not resolve for them.
 *
 * Says the same thing whether the deck was withdrawn, never existed, or belongs to somebody
 * else. That is the whole point: distinguishing them would tell a stranger that a share id is
 * real and that this portal serves that person. The wording has to cover every case honestly
 * without picking one, which is why it lists the possibilities rather than naming the cause.
 *
 * It offers to sign in as someone else, because the likeliest innocent reason to land here is
 * being signed in with the wrong address: the deck was sent to your work email and you are in
 * a browser signed in as your personal one.
 */
export function notAvailablePageHtml(opts: { brand: string; next: string }): string {
  const brand = escapeHtml(opts.brand);
  const next = escapeHtml(opts.next);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${brand}</title>
<style>
:root{--bg:#0e0e0e;--surface:#151515;--line:#282828;--text:#c9c9c9;--heading:#f4f4f4;--muted:#8a8a8a;--accent:#7aa2ff}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6;padding:24px}
.card{width:100%;max-width:420px}
h1{font-size:1.4rem;font-weight:800;letter-spacing:-.02em;color:var(--heading);margin:0 0 .5rem}
p{margin:0 0 1rem;color:var(--muted);font-size:.95rem}
ul{margin:0 0 1.5rem;padding-left:1.1rem;color:var(--muted);font-size:.95rem}
li{margin-bottom:.35rem}
a.btn{display:inline-block;padding:.7rem 1.2rem;border-radius:6px;border:1px solid var(--line);
  color:var(--heading);text-decoration:none;font-size:.9rem;font-weight:600}
a.btn:hover{border-color:var(--muted)}
.foot{margin-top:2rem;font-size:.8rem;color:var(--muted)}
</style>
</head>
<body>
<div class="card">
  <h1>This page is not available</h1>
  <p>That can happen for a few reasons:</p>
  <ul>
    <li>It was shared with a different email address than the one you are signed in with.</li>
    <li>The person who sent it has withdrawn it.</li>
    <li>The link is wrong or has been mistyped.</li>
  </ul>
  <p>If you were expecting to see something here, ask whoever sent it to you.</p>
  <a class="btn" href="/auth/signout?next=${next}">Sign in as someone else</a>
  <p class="foot">Made with <a href="https://decktrail.com" style="color:var(--muted)">DeckTrail</a></p>
</div>
</body>
</html>`;
}

/**
 * The sign-in page a recipient meets when they open a deck link without a session.
 *
 * This exists because the alternative was what shipped: a client clicked the link their
 * consultant sent and got {"error":"please sign in"} as raw JSON, with nowhere to sign in and
 * nothing to do. The deck is the product, and this is the door to it.
 *
 * Deliberately plain, and deliberately vague. It never says whether the address is invited,
 * whether the deck exists, or who it belongs to: the answer is the same either way, because
 * this page is public and anyone can guess a share id.
 */
export function signInPageHtml(opts: { brand: string; next: string; sitekey?: string | null }): string {
  const next = escapeHtml(opts.next);
  const brand = escapeHtml(opts.brand);
  const sitekey = opts.sitekey ? escapeHtml(opts.sitekey) : null;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${brand}</title>
<style>
:root{--bg:#0e0e0e;--surface:#151515;--line:#282828;--text:#c9c9c9;--heading:#f4f4f4;--muted:#8a8a8a;--accent:#7aa2ff}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--text);
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;line-height:1.6;padding:24px}
.card{width:100%;max-width:400px}
h1{font-size:1.5rem;font-weight:800;letter-spacing:-.02em;color:var(--heading);margin:0 0 .5rem}
p{margin:0 0 1.5rem;color:var(--muted);font-size:.95rem}
label{display:block;font-size:.85rem;color:var(--muted);margin-bottom:.4rem}
input[type=email]{width:100%;padding:.75rem;border-radius:6px;border:1px solid var(--line);
  background:var(--surface);color:var(--heading);font-size:1rem}
input[type=email]:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:transparent}
button{width:100%;margin-top:1rem;padding:.8rem;border:0;border-radius:6px;background:var(--accent);
  color:#0a0a0a;font-weight:600;font-size:.95rem;cursor:pointer}
button:disabled{opacity:.6;cursor:default}
.done{padding:1rem;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text);font-size:.95rem}
.foot{margin-top:2rem;font-size:.8rem;color:var(--muted)}
.cf{margin-top:1rem}
</style>
</head>
<body>
<div class="card">
  <div id="ask">
    <h1>${brand}</h1>
    <p>This page is shared with one person. Enter your email and we will send you a link to open it.</p>
    <form id="f">
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autocomplete="email" autofocus>
      ${sitekey ? `<div class="cf cf-turnstile" data-sitekey="${sitekey}"></div>` : ""}
      <button id="go" type="submit">Send me the link</button>
    </form>
  </div>
  <div id="sent" class="done" hidden>
    <strong style="color:var(--heading)">Check your email.</strong><br>
    If that address has access, a link is on its way. It works once and expires shortly.
  </div>
  <p class="foot">Made with <a href="https://decktrail.com" style="color:var(--muted)">DeckTrail</a></p>
</div>
${sitekey ? '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>' : ""}
<script>
document.getElementById('f').addEventListener('submit', function (e) {
  e.preventDefault();
  var btn = document.getElementById('go');
  btn.disabled = true;
  var body = { email: document.getElementById('email').value, next: ${JSON.stringify(next)} };
  var cf = document.querySelector('[name="cf-turnstile-response"]');
  if (cf) body.turnstileToken = cf.value;
  fetch('/auth/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(function () {
    // Always the same outcome, whatever the server said. Whether the address is invited is
    // not this page's business to reveal, and an error here would reveal it.
    document.getElementById('ask').hidden = true;
    document.getElementById('sent').hidden = false;
  });
});
</script>
</body>
</html>`;
}
