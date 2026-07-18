# Going live

The quickstart runs everything on `localhost`. This is what changes when you serve real clients
on a real domain. Nothing here is DeckTrail-specific magic; it is the standard shape of putting a
container on the internet, with the few settings DeckTrail needs called out.

Take it as a deliberate step after you have used the thing in your own hands, not a rush. Prove
it, then cut over, keeping a one-command rollback (decision D11).

---

## 1. Serve it on a domain

Put DeckTrail behind a reverse proxy that terminates HTTPS (Traefik, Caddy, and nginx all work).
The portal listens on port 3000; the proxy holds 443 and forwards to it. Do not publish port
3000 to the internet directly.

Then set, in `.env`:

```sh
DT_BASE_HOST=decks.your-domain.com     # the public host, no scheme
DT_COOKIE_SECURE=true                  # cookies only over HTTPS
DT_TRUST_PROXY_HEADER=true             # ONLY because a trusted proxy is really in front
```

`DT_BASE_HOST` is the host every magic link and share URL is built from, so it must match the
real public name or links will point at the wrong place. `DT_TRUST_PROXY_HEADER` makes the portal
read the client IP from the proxy; set it to true only when a proxy you control genuinely sits in
front, because otherwise a client could spoof its own IP and slip the rate limits.

Leave the session-cookie domain unset unless you have a specific reason: a host-only cookie
cannot bleed to a neighbouring app on a parent domain.

## 2. Send real email

Until now the portal logged magic links instead of sending them. For real clients they have to
arrive, and arrive in the inbox.

```sh
DT_SMTP_HOST=smtp.your-provider.com
DT_SMTP_PORT=587
DT_SMTP_USER=your-user
DT_SMTP_PASS=your-pass
DT_SMTP_FROM="You <hello@your-domain.com>"
```

**The one rule that matters most: never send mail straight from the app's own host.** A fresh
VPS internet-protocol address has no sending reputation and its mail lands in spam. Use an
authenticated mail service (your domain's provider, or a transactional sender), and set up SPF
(Sender Policy Framework) and DKIM (DomainKeys Identified Mail) records on the sending domain so
receivers trust it. Send yourself a link and confirm it reaches the inbox, not the spam folder,
before you send one to a client.

## 3. Turn on abuse protection

The magic-link request endpoint is the one public write on the portal, so it is protected in
layers (decision D18), all on free tiers:

- **Turnstile** (Cloudflare's CAPTCHA) on the sign-in form. Set `DT_TURNSTILE_SITEKEY` and
  `DT_TURNSTILE_SECRET`; verification is off while the secret is unset, so local dev still works.
- **App rate limits** in the portal: a per-IP cap and a per-email cooldown, tunable with
  `DT_RATELIMIT_IP_MAX`, `DT_RATELIMIT_IP_WINDOW_MS`, and `DT_EMAIL_COOLDOWN_MS`.
- **An edge rate-limit rule** at your CDN, plus its bot-fight mode, for volumetric floods. A
  CAPTCHA stops scripted abuse of the form but not a flood, which never solves the challenge yet
  still reaches the origin; the edge rule is what absorbs that.

Every value has a safe default and lives in one place; see [Configuration](05-configuration.md).

## 4. Prove it, then cut over

- Bring the new stack up alongside anything already running, additively. Verify it in isolation
  first (a `Host:` header smoke test through the proxy before you point DNS at it).
- Confirm HTTPS resolves with a valid certificate and the sign-in form loads your brand.
- Send yourself a real magic link and open a deck end to end.
- Then point DNS at it. Keep the old state as an instant rollback; for a container stack that is
  a single `docker compose down` on the new project, touching nothing shared.

## 5. Keep secrets out of git

The portal generates and persists its own `DT_TOKEN_SECRET`, `DT_SESSION_SECRET`, and
`DT_ADMIN_TOKEN` on first boot if you leave them blank. Whatever you set, the filled `.env` stays
on the server and never goes into version control.

## Next

- [Configuration](05-configuration.md) for every setting and which of the three places wins.
- [Troubleshooting](07-troubleshooting.md) for mail-in-spam and sign-in problems.
- [What it cannot do](../THREAT-MODEL.md) before a real client, every time.

---

<!-- guide-nav -->
**The guide:** [← Configuration](05-configuration.md) · [All docs](../README.md) · [Troubleshooting →](07-troubleshooting.md)
