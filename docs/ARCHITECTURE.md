# Architecture

How the pieces fit. Some of what a document like this describes is designed and not built; the
threat model marks that line precisely.

**Where this file and the code disagree, the code wins, and `docs/THREAT-MODEL.md` is the
authority on what protection actually ships.** An architecture document drifts from the code it
describes. Check before you rely on it.

---

## 1. The two artifacts

**The studio.** Runs on the user's machine. A Claude Code skill plus a command line tool.
Takes content in, produces a deck IR (intermediate representation) out, and pushes it to a
portal. Generation itself lives in its own package behind a provider interface, and ships with
two backends: the user's own Claude Code login (a Claude Pro or Max subscription, the default),
and the OpenCode command line tool, which reaches a model on the user's own hardware or a free
tier. Either way DeckTrail holds no application programming interface (API) key of its own: the
credential, where one is needed at all, belongs to the tool being driven. Never runs on a server.
See `DECISIONS.md` D9 and D25.

**The portal.** Runs on the user's own host. Serves gated, tracked, protected decks.
Holds no language model credentials. Small, auditable, boring, and safe.

The split is deliberate. See `DECISIONS.md` D1.

## 2. The deck IR

This is the core abstraction. See `DECISIONS.md` D6, expanded by D16.

**Expanded to a pack (D16).** Validating the model against a real engagement's worth of
artifacts showed a lone slide deck is too narrow: roughly half of them are
scrolling documents, and one engagement is a mixed pack (a deck plus a document plus a
pricing tool behind a hub). The IR is therefore a pack of artifacts (slide deck,
document, hub, tool), it carries typed escape hatches (`image`, `figure`) for imported
and captured content, and its slots are rich text. The full model is `IR-SPEC.md` v0.2.
The sketch below is the slide-deck artifact within that model.

A deck is three JSON documents, not one HTML file.

```
deck.json      the content    slides, each with a layout name and filled slots
theme.json     the brand      colour tokens, typography, logo, spacing, motion
voice.json     the register   tone, forbidden words, audience, house style
```

### Sketch of deck.json

Illustrative. Not the specification.

```json
{
  "id": "acme-proposal",
  "title": "Proposal for Acme",
  "part": { "n": 2, "of": 4 },
  "next": { "label": "Ownership", "ref": "acme-ownership" },
  "slides": [
    {
      "id": "s1",
      "layout": "title",
      "slots": { "eyebrow": "Proposal", "heading": "What we would build" },
      "notes": "Presenter only. Never rendered to the client."
    },
    {
      "id": "s7",
      "layout": "card-grid",
      "slots": {
        "eyebrow": "Scope",
        "heading": "The minimum viable product",
        "cards": [
          { "title": "Intake", "body": "..." },
          { "title": "Scheduling", "body": "..." }
        ]
      }
    }
  ]
}
```

Three properties matter:

1. **The theme is not in it.** A deck can be rendered against any `theme.json`. That is
   what makes reskinning and personalisation possible.
2. **Slides are addressable.** Each has an id. That is what makes per slide streaming and
   per slide analytics possible.
3. **Presenter notes are a separate field.** They are never sent to a client renderer.
   What you would say aloud never reaches a client-facing file, and that is enforced by the
   shape of the data rather than by anyone remembering.

### Sketch of theme.json

These are data. Nothing about a brand, a viewer, or an environment is written into content.

```json
{
  "name": "Orbital Monolith",
  "colors": {
    "bg": "#0e0e0e", "surfaceLow": "#131313", "surfaceHigh": "#201f1f",
    "accent": "#8ff5ff", "accentDim": "#00eefc",
    "accent2": "#ec63ff", "accent2Dim": "#c600e3",
    "text": "#c6c4c4", "heading": "#f5f5f5", "muted": "#8b8988"
  },
  "typography": { "family": "Inter", "scale": 1.0 },
  "logo": { "src": "data:image/png;base64,...", "wordmark": "Acme", "glow": "rgba(143,245,255,.35)" }
}
```

That is the whole theme: colour, typeface, and mark. It reskins every layout at once and needs no
change to any artifact. Everything else about how a deck looks is fixed in the renderer and is the
same under every theme, which is what keeps two themes producing the same deck rather than two
different products.

Prefer a `data:image` logo over a remote URL. A deck carrying a remote logo makes every reader's
browser fetch it from that host in order to open a confidential document.

### voice.json

Register is configuration, not a default anyone inherits. A house style is a real asset, and it is
the author's: "no em dashes", "state what is rather than what is not", "write for a senior reader",
"minimise AI vocabulary" are excellent rules for the person whose rules they are, and wrong for
everybody else.

So the register is a voice profile you write. `voice.example.json` ships as a neutral template to
copy; DeckTrail has no house style of its own, and out of the box the generator writes in plain
professional business English. Bring your own register, and every deck you generate sounds like
you rather than like the tool.

Fields are `name`, `audience`, `tone`, `forbidden[]`, `preferred[]`, `locale`, `instructions` and
`notes`. See `IR-SPEC.md` section 3.3.

## 3. The layout library

See `DECISIONS.md` D7, refined by D16. The generator picks a layout and fills slots. It
never writes CSS and never invents structure. Two typed escape hatches (`image` for
raster assets, `figure` for bespoke SVG/HTML) carry imported and captured content the
generator does not author; they do not loosen the generator's constraint. The catalog
below reflects what a real engagement needs (see
`IR-SPEC.md` v0.2), which added `bullets` (the most common slide), `chart`, `stat-grid`,
and a full document-block catalog.

The catalog lives in one place: `IR-SPEC.md` section 4, which follows the schemas in
`packages/ir`. Seventeen slide layouts, plus the document blocks, plus the pricing tool.

Two of them are escape hatches, and they are deliberately narrow. `image` carries a raster asset
you supply. `figure` carries a self-contained SVG drawing, through an allowlist that strips
scripts, event handlers and styling. Neither loosens the generator's constraint, and neither is a
general import path for markup: where a diagram fits a real layout, it belongs in the layout,
because a layout is reskinnable by a theme and an imported fragment is not.

## 4. The two renderers

Both read the same IR, so a deck you render locally and a deck the portal serves are the same
deck, and the difference between them is only what the portal adds.

| | `standalone` | `portal` |
|---|---|---|
| Output | One self contained HTML file. Logo inlined as base64. | Slide per endpoint, themed and watermarked at request time. |
| Use | Handing a file to a client. Emailing an attachment. Exactly what the skill does today. | Gated, tracked, protected delivery. |
| Theme applied | At build time | At request time |
| Watermark | None, or a static one | Per recipient, per request |
| Slides delivered | All at once | One at a time, each behind a signed token |

Self containment is a virtue when you are handing someone a file. It is a liability when
you are defending content. Hence two renderers, one source of truth.

## 5. The portal

The model:

- Magic link only. No passwords.
- Token is random bytes plus an HMAC (hash based message authentication code). Only the
  SHA-256 hash is stored. Single use, claimed atomically in one SQL statement so it
  cannot be double spent. Thirty minute time to live.
- Login always returns a neutral "check your email" response whether or not the address is
  invited, so invite lists never leak.
- Session is one signed, httpOnly, Secure, SameSite cookie.

Rebuilt:

- Multi tenancy that assumes tenants are hostile to each other, not friendly.
- Session revocation. Revoking an invite must kill a live session, not merely prevent the next
  sign-in.
- Rate limiting on the magic link request endpoint. Without it the endpoint can be spammed, or
  walked to find out which addresses are known.
- A Postgres role that is not the superuser.
- Setup wizard. No `.env` hand editing, no SSH, no `docker compose exec`.

## 6. Analytics

Umami is out. See `DECISIONS.md` D2.

The event model:

| Event | Carries |
|---|---|
| `login_requested` | email, tenant, ip, user agent |
| `login_success` | email, tenant, ip, user agent |
| `deck_open` | recipient, deck, tier |
| `slide_view` | recipient, deck, slide id, dwell milliseconds |
| `deck_complete` | recipient, deck, total dwell, completion percent |
| `download_attempt` | recipient, deck, blocked or allowed |
| `copy_attempt` | recipient, deck, slide |
| `print_attempt` | recipient, deck |
| `devtools_open` | **defined, never emitted.** Deferred: detection is unreliable and false-positives. A loose end, not a feature. See `THREAT-MODEL.md`. |
| `tripwire` | recipient, deck, reason. The context-menu tripwire, which is built. **Not** the scrape tripwire in `THREAT-MODEL.md`, which is not. No event has an "action taken": nothing is auto-revoked. |
| `bot_blocked` | user agent, ip |
| `denied` | email, tenant |

Per `DECISIONS.md` D10, every viewer-facing event (`deck_open`, `slide_view`,
`deck_complete`, and the protection events) also carries the `version_id` of the deck
version the viewer actually saw, so the engagement timeline is version-aware and the audit
trail can answer exactly what a named person saw and when.

What the sender sees, which is the actual value:

- Who opened it, when, how many times, from where.
- A per slide dwell timeline. Where they lingered. Where they skipped.
- Completion percentage. Where they gave up.
- Forward detection. Same link, new device or new network.
- An engagement score, so ten prospects can be ranked at a glance.
- Alerts. "Acme just opened your deck." "Someone is scraping slide 14."

This is the honeypot. It is the feature people adopt for, before they care about the
protection. It should be beautiful.

**Implementation status.** The server-side events are recorded: `login_requested`,
`login_success`, `deck_open` (carrying the `version_id` per D10), `bot_blocked`, and
`denied`. The owner reads them through an admin-session-gated summary at
`GET /admin/analytics` (opens over time, per deck, per recipient with first and last seen,
plus the bot-attempt list) and a CSV export at `GET /admin/events.csv`. That admin gate is
a magic-link session whose email matches the configured admin, kept separate from the
Bearer token the command-line ingest routes use. AI and scraper user agents are refused at
the content route (403 plus a `bot_blocked` event), alongside a disallow-all `robots.txt`
and an `X-Robots-Tag: noai, noimageai, noindex, nofollow` header on served content.

The per-slide browser events are also recorded now. A beacon injected only into served
content (never into a standalone file) reports `slide_view` (per slide, with dwell), a
`deck_complete` (slides viewed, completion percent) on tab-hide or unload, and the
protection tripwires (`copy_attempt`, `print_attempt`, `download_attempt`, and a
context-menu `tripwire`). It posts to `POST /e`, which takes the recipient and workspace
from the session (not the body), whitelists the event type so a viewer cannot inject a
server event, sanitises the meta, and is IP-rate-limited. `devtools_open` is deferred, since
reliable detection is not worth the false positives.

The React owner console (`packages/console`) renders all of this. It is a single-page app
built with Vite and served by the portal at `/admin` (the built assets ship in the image and
the portal serves them; the admin API routes take precedence over the static wildcard). The
admin session gates it. The dashboard reads `GET /admin/analytics` and shows the workspace
brand (not DeckTrail's), signal tiles (opens, unique viewers, sign-ins, and scrape attempts),
an opens-over-time line chart (Chart.js, the only charting dependency, chosen for weight and a
clean licence), per-deck and per-recipient engagement, and a scrape-attempt panel, with the
audit CSV a download away. It is deliberately its own visual identity, since it is the
owner's tool and not a client-facing artifact.

A Brand tab manages themes (D16): create and edit a theme (the palette with colour pickers,
typography, and a logo uploaded as a data URI so no file storage is needed), and assign a
theme to any artifact. The assigned theme is applied at serve time over the version theme,
so a deck can be rebranded without republishing. It is backed by a themes table and an
admin-session-gated themes API (`/admin/themes`, `/admin/artifacts`, and the assign route).

## 7. Connectors

Everything external is a swappable adapter with a common interface. Nothing is hardcoded.

| Connector | Adapters |
|---|---|
| Email | SMTP, Resend, Postmark, Amazon SES (simple email service) |
| Storage | Local disk, S3, Cloudflare R2 |
| Language model | Two backends behind one provider interface, per `DECISIONS.md` D9 and D25: `claude`, the user's own Claude Code login (the default, no key), and `opencode`, the OpenCode command line tool, which reaches a local model, its own free tier, or a hosted one. A direct Claude-via-API-key adapter is still deferred: OpenCode already covers that ground. |
| Deploy | Docker Compose, Fly, Coolify, Railway |
| Analytics (optional) | Built in, Umami plugin |

Plus a `doctor` command that exercises every configured connector and reports exactly what
is broken and how to fix it. Self hosted software lives and dies on this.

## 8. Setup, which is the actual viral mechanic

Nobody stars a tool they could not get running. An install that needs SSH, two compose
projects, two databases, a reverse-proxy auth hop, and a manual wizard where you copy a
UUID (universally unique identifier) into a `.env` by hand.

Target:

```
docker compose up
```

A browser opens. A first run wizard asks for: an admin email, a website URL to pull the
brand from, and email settings with a live test send button. All secrets are generated.
Nothing is edited by hand. Under five minutes, from nothing, to a deck you can send.

That number is not a vanity metric. It is the difference between a project that spreads
and one that does not.

## 9. Deployment

Docker Compose is the reference target: one compose file, one Postgres, one app container.

The default assumes a clean box: DeckTrail brings its own Postgres, publishes its own port, and
owns everything in its compose file.

Running it beside other things is an advanced case and the docs treat it as one. If your host
already has a reverse proxy, add labels for DeckTrail's own router and do not edit the shared
configuration; if the host runs anything you cannot afford to have starved, give the portal and
its database explicit CPU and memory limits. Neither is DeckTrail's requirement. Both are what you
owe the neighbours.

## 10. Versioning and the audit trail

See `DECISIONS.md` D10.

- Every deck carries an immutable, append-only version history. A version is a full
  snapshot of the deck IR, stored as a row in a `deck_version` table (version number, IR
  snapshot, parent version, author, created-at in Indian Standard Time, source of
  `generated` or `hand-edited`, and an optional one-line changelog note). A sent version
  is never mutated; editing produces a new version.
- Change history is a diff computed between two snapshots on read. Snapshots are the source
  of truth; diffs are never stored as such.
- The versioning unit is the whole deck for the minimum viable product. Per-slide history
  is a later refinement.
- A client share link pins to the exact version it was created for. Revising a deck never
  changes what a client who already holds a link sees, until the sender deliberately sends
  the newer version. Every send and every revision is its own recorded audit event.

## 11. URLs and existing-deck migration

See `DECISIONS.md` D13.

- **Host:** a configurable base host, never hardcoded. Where a portal replaces an existing one,
  the old host can be kept serving so links already sent to clients keep resolving.
- **Owner console (readable):** `/<workspace>/<deck-slug>` and
  `/<workspace>/<deck-slug>/v<n>`. Only the owner sees these.
- **Recipient share link (opaque):** `/d/<shareId>`, an unguessable identifier that
  resolves to the pinned version, carries the per-viewer watermark, and is magic-link
  gated. A forwarded link leaks nothing about the workspace, other clients, the deck
  subject, or the version.
- Existing decks migrate onto this system as versioned decks, with the old paths aliased to
  resolve to the imported pinned version. The migration is a zero-downtime cutover in a
  low-traffic window (night, Indian Standard Time): verify the new system serves every
  legacy URL identically in isolation first, tag a rollback point, then cut over, keeping
  the old system as an instant rollback. No client-facing downtime.

## 12. The watermark is configuration, not code

See `DECISIONS.md` D14. The per-viewer watermark the `portal` renderer injects is defined by
self-hoster settings, not hardcoded. Its fields, its format, and the confidentiality label
are all configuration with one authoritative home. The default stays a sensible per-viewer
traceable stamp (identity plus timestamp plus a confidentiality label), because per-viewer
attribution is the real protection control, but every token is overrideable. `email + timestamp
+ Confidential` is a default, not a literal in the renderer.
