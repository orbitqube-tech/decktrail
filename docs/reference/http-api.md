# HTTP API reference

Every route the portal serves, what authorises it, and what it is for. The routes are defined in
`packages/portal/src/app.ts`; this is the reference version.

## How authorisation works

There are three ways a request is trusted, and each route uses exactly one:

- **Public.** No auth. Some are rate-limited.
- **Admin token.** An `Authorization: Bearer <DT_ADMIN_TOKEN>` header. This is the machine
  credential the `decktrail` CLI uses to publish and share. It is not a person.
- **Admin session.** A signed session cookie whose email matches the portal's `admin_email`.
  This is the owner signed in to the console in a browser.

A recipient viewing a deck uses their own signed session (from a claimed magic link), which is
distinct from the admin session.

## Public routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Redirects to `/admin/`. |
| GET | `/healthz` | Liveness check, returns `{"ok":true}`. |
| GET | `/robots.txt` | Disallow-all, naming the AI and scraper agents (advisory). |
| GET | `/setup` | The first-run wizard form, gated by the one-time setup token. Redirects once setup is complete. |
| POST | `/setup` | Completes first-run setup (admin email, brand, mail). Requires the setup token; refuses once already set up. |
| GET | `/auth/config` | Non-secret login config: the Turnstile sitekey and the brand name for the sign-in page. |
| POST | `/auth/request` | Requests a magic link for an email. Per-IP rate-limited and per-email cooled down; verifies Turnstile when configured. Always responds neutrally, so it never reveals who is invited. |
| GET | `/auth/claim` | Claims a magic-link token, starting a session, then redirects to the deck (a safe `next`). |
| GET | `/auth/signout` | Ends the session. |
| POST | `/e` | The engagement beacon: a slide-view or attempt event from a deck being read. The event is validated against the artifact it claims to be for, so the body cannot lie about which deck it hit. |
| GET | `/d/:shareId` | Serves a shared deck. Gated to the share's recipient session; anyone else gets "not available". Injects the per-viewer watermark and anti-copy friction at serve time. |

## Admin-token routes (the CLI)

| Method | Path | Purpose |
|---|---|---|
| POST | `/admin/publish` | Publishes an IR document as a new immutable version in its workspace. |
| POST | `/admin/shares` | Mints a per-recipient share link for a published artifact. |

## Admin-session routes (the console)

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/analytics` | The dashboard data: opens, unique viewers, sign-ins, scrape attempts, per-recipient and per-deck engagement. `?workspace=` narrows to one client. |
| GET | `/admin/events.csv` | The full audit trail as CSV. |
| GET | `/admin/themes` | Lists brand themes. `?workspace=` narrows. |
| POST | `/admin/themes` | Creates or updates a brand theme. |
| DELETE | `/admin/themes/:id` | Deletes a theme. |
| GET | `/admin/artifacts` | Lists published artifacts and workspaces, for assigning themes. |
| POST | `/admin/artifacts/:id/theme` | Assigns a theme to an artifact (or clears it). |
| PUT | `/admin/voice` | Saves the generation voice. |
| GET | `/admin` | The built owner console (single-page app). |

## Dual-auth route

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/voice` | Reads the saved voice. Accepts the admin session (console) OR the admin token (the CLI reads it here for generation). |

## Notes

- Unauthorised requests to admin routes get `401`; a missing dependency gets `503`; a bad body
  gets `400`. Nothing leaks which emails are invited.
- The base host in generated URLs comes from `DT_BASE_HOST`, and the scheme from
  `DT_COOKIE_SECURE` (https when true). See [Configuration](../guide/05-configuration.md).
