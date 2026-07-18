import { constantTimeEqual } from "./crypto.js";

/** Key-value settings for first-run setup and generated boot secrets. */
export interface SettingsStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export class InMemorySettingsStore implements SettingsStore {
  private readonly m = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.m.get(key) ?? null;
  }
  async set(key: string, value: string): Promise<void> {
    this.m.set(key, value);
  }
}

export async function isSetupComplete(store: SettingsStore): Promise<boolean> {
  return (await store.get("setup_complete")) === "true";
}

/** Where the one-time setup token lives while setup is pending. */
export const SETUP_TOKEN_KEY = "setup_token";

/**
 * The one-time token that lets the operator, and only the operator, complete first-run setup.
 *
 * Setup writes the admin email and cannot ask who you are, because there is nobody to ask yet.
 * Left open, whoever reaches a fresh portal first becomes its admin. On first boot that is
 * merely squatting, since the portal is empty. The case that bites is setup reopening on a
 * portal that already holds decks: `setup_complete` is a database row, not a fuse, so a
 * restore that misses the settings table, or a botched migration, hands a stranger an admin
 * session and with it /admin/events.csv, which is every recipient's address, IP and habits.
 *
 * So the token is generated once, printed to the container log, and required to see or submit
 * the form. It is the pattern Grafana, Nextcloud and Jupyter all use, and it costs the
 * operator one look at `docker compose logs`. It is deleted the moment setup completes.
 */
export async function ensureSetupToken(store: SettingsStore, generate: () => string): Promise<string> {
  const existing = await store.get(SETUP_TOKEN_KEY);
  if (existing) return existing;
  const token = generate();
  await store.set(SETUP_TOKEN_KEY, token);
  return token;
}

/** Whether the supplied token matches the pending one. False when setup is not pending. */
export async function setupTokenValid(store: SettingsStore, supplied: string | undefined): Promise<boolean> {
  if (!supplied) return false;
  const expected = await store.get(SETUP_TOKEN_KEY);
  if (!expected) return false;
  return constantTimeEqual(supplied, expected);
}

/**
 * Shown when setup is pending but the caller has no token. It explains where to get one,
 * because the operator will meet this page and should not have to read the source to get
 * past it. It reveals nothing: that a portal is awaiting setup is obvious from the outside
 * anyway, and the token itself is only in the log.
 */
export function setupLockedHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeckTrail setup</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:8vh auto;padding:0 20px;color:#eee;background:#0e0e0e;line-height:1.6}
h1{font-weight:800;letter-spacing:-1px}
code{background:#1a1a1a;padding:2px 6px;border-radius:4px;color:#7aa2ff;font-size:14px}
pre{background:#141414;border:1px solid #282828;border-radius:8px;padding:14px;overflow-x:auto;font-size:13px;color:#c9c9c9}
small{color:#888}
</style>
</head>
<body>
<h1>Setup needs your token</h1>
<p>This portal has not been set up yet. Setup decides who its administrator is, so it is
locked to whoever can read the server's log. That is you.</p>
<pre>docker compose logs portal | grep setup</pre>
<p>Open the URL it prints. It contains a one-time token.</p>
<p><small>If the log has scrolled away, restart the portal and it prints the token again.
The token is only valid until setup completes.</small></p>
</body>
</html>`;
}

/**
 * The first-run setup page. Submits as JSON via fetch, so no form-body parser is needed.
 * The token is carried through to the POST, which re-checks it: the GET showing the form is
 * a convenience, the POST is the actual gate.
 */
export function setupFormHtml(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>DeckTrail setup</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:8vh auto;padding:0 20px;color:#eee;background:#0e0e0e}
h1{font-weight:800;letter-spacing:-1px}
label{display:block;margin:14px 0 4px;color:#aaa;font-size:14px}
input{width:100%;padding:10px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#eee}
button{margin-top:22px;padding:12px 20px;border:none;border-radius:10px;background:linear-gradient(45deg,#7aa2ff,#b98cff);color:#0e0e0e;font-weight:700;cursor:pointer}
small{color:#888;display:block;margin-top:4px;line-height:1.5}
label.chk{display:flex;align-items:center;gap:8px;margin-top:18px;color:#ccc}
label.chk input{width:auto}
p.note{margin-top:18px;padding:12px 14px;border-radius:8px;background:#161616;color:#999;font-size:13px;line-height:1.6}
p.note a{color:#7aa2ff}
</style>
</head>
<body>
<h1>Welcome to DeckTrail</h1>
<p><small>First-run setup. This runs once.</small></p>
<form id="setup">
<label>Admin email</label><input name="adminEmail" type="email" required>
<label>Brand name (optional)</label><input name="brandName">
<label>SMTP host (optional)</label><input name="smtp_host">
<label>SMTP port (optional)</label><input name="smtp_port">
<label>SMTP user (optional)</label><input name="smtp_user">
<label>SMTP password (optional)</label><input name="smtp_pass" type="password">
<label>From address (optional)</label><input name="smtp_from">
<label class="chk"><input type="checkbox" name="telemetry_optin" value="true"> Share anonymous usage to help improve DeckTrail</label>
<small>Off by default. Sends only an anonymous id, the version, and rough counts. Never your content, your clients, or your viewers. Change it any time.</small>
<p class="note">Your decks carry a small "Made with DeckTrail by OrbitQube" mark. The licence does not require it and you can turn it off without asking us. We do ask you to keep it: it is the only way anyone finds this project. See <a href="https://decktrail.com/attribution" target="_blank" rel="noopener">why we ask</a>.</p>
<button type="submit">Finish setup</button>
</form>
<script>
document.getElementById('setup').addEventListener('submit',function(e){
 e.preventDefault();
 var d={};new FormData(e.target).forEach(function(v,k){if(v)d[k]=v});
 d.setupToken=${JSON.stringify(token)};
 fetch('/setup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(d)})
  .then(function(r){if(r.ok){location.href='/'}else{r.json().then(function(j){alert(j.error||'setup failed')})}});
});
</script>
</body>
</html>`;
}
