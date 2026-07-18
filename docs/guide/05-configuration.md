# Configuration

Every setting DeckTrail has, where it lives, and which one wins when two disagree.

---

## The three places, and why there are three

This is the part that confuses people, so it goes first.

| Where | Set when | Lives in | Changing it needs |
|---|---|---|---|
| **`.env`** | Before the container starts | The environment | A restart |
| **The setup wizard** | Once, on first run | The database | Nothing, it is one-time |
| **The console** | Any time, at `/admin` | The database | Nothing, it applies immediately |

The split is not arbitrary:

- **`.env` is for things the server needs before it can ask anyone anything.** It cannot read
  its database password out of its database.
- **The wizard is for the handful of facts a new install needs to be useful**, asked once so a
  fresh install works without editing files.
- **The console is for what you change as you work**: your brand, your voice, which theme a
  deck wears.

### When two disagree, `.env` wins

For the SMTP settings, which are the only ones you can set in two places, **an environment
value overrides whatever the wizard stored**. If mail is not behaving as the wizard suggests,
check `.env` first: a leftover `DT_SMTP_HOST` there silently beats the console.

---

## What you must set

Exactly one thing.

| | |
|---|---|
| `POSTGRES_PASSWORD` | Any long random string. Used by both containers. |

Everything else has a working default or generates itself.

> **Leave the secrets empty.** `DT_TOKEN_SECRET`, `DT_SESSION_SECRET` and `DT_ADMIN_TOKEN`
> generate themselves on first boot and persist. The server only generates a secret when the
> variable is **unset**, so a placeholder is not a missing value, it is the value. An earlier
> version of `.env.example` shipped placeholders, and every install that copied the file ran
> with an admin token published in this repository. The portal now refuses to start on any
> placeholder it has ever shipped, but the rule is simpler than the guard: **empty means
> generated, anything else means you meant it.**

---

## `.env` in full

### Database

| Variable | Default | What it does |
|---|---|---|
| `POSTGRES_PASSWORD` | none | **Required.** The database password. |
| `DATABASE_URL` | built from the above | Point at an external Postgres instead of the bundled one. |

### Secrets (leave empty)

| Variable | Default | What it does |
|---|---|---|
| `DT_TOKEN_SECRET` | generated | Signs magic-link tokens. |
| `DT_SESSION_SECRET` | generated | Signs session cookies. Changing it signs everyone out. |
| `DT_ADMIN_TOKEN` | generated | The Bearer token `decktrail push` uses. Read it back with `grep '^DT_ADMIN_TOKEN=' .env`, or from the `settings` table if it was generated. |

### Where you are

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | The port inside the container. |
| `DT_BASE_HOST` | `localhost:3000` | **The host in the links you send people.** Get this wrong and your magic links point somewhere that does not exist. Set it to your real domain before you send a deck to anyone. |
| `DT_COOKIE_SECURE` | `true` | Send the session cookie only over HTTPS. **Leave it `true` in production.** `false` for local http. |
| `DT_COOKIE_NAME` | `dt_session` | |
| `DT_COOKIE_DOMAIN` | unset | Only if you serve across subdomains. |

### Email

Leave every one of these blank and DeckTrail **logs magic links to the container log** instead
of sending them. A fresh install works with no mail configuration at all; that is deliberate,
and it is why the quickstart never asks you to sign up for anything.

| Variable | Default | What it does |
|---|---|---|
| `DT_SMTP_HOST` | unset | Your mail host. |
| `DT_SMTP_PORT` | `587` | |
| `DT_SMTP_USER` | unset | |
| `DT_SMTP_PASS` | unset | |
| `DT_SMTP_FROM` | unset | Must be a real mailbox on your sending domain. |

> **The one rule that matters more than the rest: send through an authenticated mail service,
> never straight from the app's own host.** Mail from an application server's IP fails SPF,
> DKIM and DMARC, which is what a receiving inbox uses to decide you are real. It will be
> filed as spam, and you will not find out, because the client simply never replies.
>
> Point `DT_SMTP_HOST` at your mailbox provider (Google Workspace, Fastmail, your registrar's
> mail) or a transactional relay (Amazon SES, Resend, Mailgun) via its SMTP endpoint. They
> sign your mail and their IPs are authorised in your DNS.

Optional app-level DKIM signing, only if you send direct from a host whose mail service does
not sign for you. A real mail service already signs; leave these unset there.

| Variable | What it does |
|---|---|
| `DT_DKIM_DOMAIN` | The signing domain. |
| `DT_DKIM_SELECTOR` | The DNS selector. |
| `DT_DKIM_PRIVATE_KEY_FILE` | Path to the key. **Prefer this** over the inline form, so the key stays off the environment. |
| `DT_DKIM_PRIVATE_KEY` | The key inline. |

### Abuse controls

| Variable | Default | What it does |
|---|---|---|
| `DT_TRUST_PROXY_HEADER` | `false` | Whether to believe `CF-Connecting-IP`. **See the warning below.** |
| `DT_TURNSTILE_SITEKEY` | unset | Cloudflare Turnstile, public half. |
| `DT_TURNSTILE_SECRET` | unset | Turnstile, secret half. Unset means no CAPTCHA. |
| `DT_RATELIMIT_IP_MAX` | `10` | Magic-link requests per IP per window. |
| `DT_RATELIMIT_IP_WINDOW_MS` | `60000` | |
| `DT_EMAIL_COOLDOWN_MS` | `60000` | Minimum gap between links to one address. Stops mail-bombing. |
| `DT_RATELIMIT_EVENT_MAX` | `600` | Beacon events per IP per window. Generous, so real reading is never throttled. |
| `DT_RATELIMIT_EVENT_WINDOW_MS` | `60000` | |

> **`DT_TRUST_PROXY_HEADER` is off, and should stay off unless you are genuinely behind
> Cloudflare** or another proxy that sets `CF-Connecting-IP` **and strips a client-supplied
> one.**
>
> A header is written by whoever sends the request. Trusted blindly, every per-IP limit above
> becomes decorative: an attacker rotates the header and the counter never reaches its limit.
> It also lets anyone write an IP of their choosing into your audit log, which is the record
> you would rely on if a leak ever mattered. This was verified against a running portal, not
> theorised.
>
> If DeckTrail is reachable directly on its port, the socket address is the only thing that
> cannot be faked. Turning this on without a proxy in front is strictly worse than leaving it
> off.

### Session and link lifetimes

| Variable | Default | What it does |
|---|---|---|
| `DT_MAGIC_TTL_MS` | `1800000` (30 min) | How long a sign-in link is good for. Single use regardless. |
| `DT_SESSION_TTL_MS` | `604800000` (7 days) | How long a viewer stays signed in. |

### Telemetry

| Variable | Default | What it does |
|---|---|---|
| `DT_TELEMETRY_ENDPOINT` | `https://decktrail.com/telemetry` | Where an opted-in instance reports. Point it at your own receiver, or nowhere. |
| `DT_TELEMETRY_INTERVAL_MS` | weekly | How often. |

**Telemetry is off unless you turned it on during setup.** When on, one weekly ping carries an
anonymous instance id, the version, and two bucketed counts (roughly how many decks, roughly
how many views). It never carries your content, your clients, your viewers, or an exact
figure, and it fails silently. Turn it off by setting `telemetry_optin` to `false` in the
`settings` table.

Nothing else in DeckTrail ever contacts us. **No rendered deck makes a network request to any
domain this project controls**, and none ever will: that would mean watching your clients read
your decks, which is the thing this product exists to tell you not to accept from anyone.

---

## The setup wizard

Runs once, at `/setup`, gated by a token printed in the container log. See
[Quickstart](01-quickstart.md#2-find-your-setup-link) for why.

| Field | Stored as | Notes |
|---|---|---|
| Admin email | `admin_email` | Who owns this portal. This address, and only this address, reaches `/admin`. |
| Brand name | `brand_name` | Shown to your clients on the sign-in page and in emails. Not DeckTrail's name; yours. |
| SMTP fields | `smtp_*` | **Overridden by `.env` if set there.** |
| Share anonymous usage | `telemetry_optin` | Off unless you tick it. |

---

## The console

At `/admin`, once you are signed in as the admin email.

| Tab | What it sets | Applies |
|---|---|---|
| **Brand** | Themes: colours, typography, a logo. And which theme each deck wears. | **At serve time.** Reassign a theme and the next open uses it. No republishing. |
| **Voice** | How generation writes: audience, tone, what to prefer, what never to use, free-form instructions. | **At generation time**, and only when you pass `--portal` and `--token`. See below. |

### How the voice actually reaches a deck

This is worth stating plainly, because it used to be broken and silently did nothing.

```sh
decktrail generate notes.md --portal https://decks.you.com --token "$TOKEN"
```

The voice is resolved in this order, most specific first:

1. `--voice myvoice.json`, a file you named.
2. `voice.json` in the directory you run the command from.
3. **The voice you set in the console**, read from the portal. Needs `--portal` and `--token`.
4. A neutral professional default.

It prints which one it used. Generating in the wrong register is the kind of mistake you notice
three decks later, so it says so rather than guessing quietly.

---

## Reading a generated secret back

If you left the secrets empty, the portal generated them. To find your admin token:

```sh
grep '^DT_ADMIN_TOKEN=' .env                       # if you set it
docker compose exec db psql -U decktrail -d decktrail \
  -tAc "select value from settings where key='adminToken'"   # if it generated one
```

---

## Next

- [Going live](06-going-live.md) for a real domain, real mail, and what to change before
  strangers can reach it.
- [Troubleshooting](07-troubleshooting.md) when a setting is not doing what you expect.

---

<!-- guide-nav -->
**The guide:** [← Sending and tracking](04-sending-and-tracking.md) · [All docs](../README.md) · [Going live →](06-going-live.md)
