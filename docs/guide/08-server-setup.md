# Setting it up on your own server

The quickstart runs DeckTrail on your laptop. This is the same thing on a real server with a real
domain and HTTPS, step by step, the way the quickstart is step by step. [Going live](06-going-live.md)
is the shorter checklist of what changes for real clients; this is the concrete walkthrough.

These commands assume a Unix-style shell (any Linux VPS gives you one). Run them as a non-root
user with `sudo`.

---

## 1. Provision the server

Any small VPS works (one or two shared vCPUs, 2GB RAM). Create a non-root user with sudo, and log
in as them:

```sh
adduser deploy && usermod -aG sudo deploy    # as root, once
# then log back in as deploy
```

## 2. Install Docker

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER        # log out and back in so this takes effect
docker compose version               # confirm the Compose plugin is present
```

## 3. Lock the firewall down

Open only SSH and the web ports. The portal's own port is never exposed (the compose binds it to
loopback), so do not open 3000.

```sh
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## 4. Point DNS at the server

At your DNS provider, add an `A` record (and `AAAA` if you have IPv6) for `decks.your-domain.com`
pointing at the server's IP. Do this before the next step, because the certificate is issued over
that name. Give it a few minutes to propagate.

## 5. Get the code and configure it

```sh
git clone https://github.com/orbitqube-tech/decktrail
cd decktrail
cp .env.example .env
```

Edit `.env`:

```sh
POSTGRES_PASSWORD=a-long-random-string        # openssl rand -base64 24
DT_BASE_HOST=decks.your-domain.com            # your public host, no scheme
DT_COOKIE_SECURE=true                         # cookies only over HTTPS
DT_TRUST_PROXY_HEADER=true                    # correct here: a reverse proxy is genuinely in front
# Mail, through an authenticated service, never this box's own IP (see step 8):
DT_SMTP_HOST=smtp.your-provider.com
DT_SMTP_PORT=587
DT_SMTP_USER=your-user
DT_SMTP_PASS=your-pass
DT_SMTP_FROM="You <hello@your-domain.com>"
```

Leave `DT_TOKEN_SECRET`, `DT_SESSION_SECRET`, and `DT_ADMIN_TOKEN` blank; they generate on first
boot and persist in the database. Every `DT_*` value in `.env` now reaches the container.

## 6. Start it, behind HTTPS

DeckTrail does not terminate TLS itself: a reverse proxy sits in front of it, terminates HTTPS,
and obtains the certificate. Pick the one that fits your server, and use exactly one.

### Option A: the bundled Caddy

The simplest choice on a fresh box where nothing else uses ports 80 and 443.

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

This brings up Postgres, the portal (on loopback only), and Caddy, which obtains a Let's Encrypt
certificate for `DT_BASE_HOST` automatically and forwards to the portal. Both services restart on
reboot.

### Option B: behind Traefik

Choose this when your server **already runs Traefik** in front of other sites, or when you prefer
Traefik. A proxy already owning 80 and 443 is the common case on a shared box, and the bundled
Caddy cannot bind those ports alongside it. The `docker-compose.traefik.yml` overlay instead adds
routing labels to the portal and joins Traefik's network; it publishes no ports of its own, so it
never clashes with a proxy that is already there.

Tell the overlay which Traefik to attach to, in `.env`:

```sh
TRAEFIK_NETWORK=proxy            # the external docker network your Traefik watches
TRAEFIK_ENTRYPOINT=websecure     # its entrypoint bound to 443
TRAEFIK_CERTRESOLVER=letsencrypt # an ACME certificate resolver it defines
```

**B1. You already run Traefik.** Set the three values above to match your existing Traefik, then:

```sh
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build
```

Traefik picks up the labels, routes `DT_BASE_HOST` to the portal, and issues the certificate with
your resolver. Nothing else behind that Traefik is touched. Give it up to a minute to obtain the
certificate on first start.

**B2. You do not run Traefik yet.** Bring up a minimal one first. Create its network, and a
`traefik-standalone.yml` beside the DeckTrail files:

```sh
docker network create proxy
```

```yaml
# traefik-standalone.yml
services:
  traefik:
    image: traefik:v3
    restart: unless-stopped
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --entrypoints.web.http.redirections.entrypoint.scheme=https
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.letsencrypt.acme.tlschallenge=true
      - --certificatesresolvers.letsencrypt.acme.email=you@your-domain.com
      - --certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - traefik_le:/letsencrypt
    networks:
      - proxy
networks:
  proxy:
    external: true
volumes:
  traefik_le:
```

```sh
docker compose -f traefik-standalone.yml up -d                                    # Traefik, once
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build  # then DeckTrail
```

The defaults (`proxy`, `websecure`, `letsencrypt`) already match this minimal Traefik, so no other
`.env` change is needed. Set the ACME email to a real address you own.

## 7. Finish setup

```sh
docker compose logs portal | grep setup      # the one-time setup URL, now on your real host
```

Open `https://decks.your-domain.com/setup?token=...`, set your admin email and brand. Setup locks
once done.

## 8. Verify each wire, do not assume it

This is the part that separates a working install from one that fails quietly for a client:

- **HTTPS and the brand:** `curl -sI https://decks.your-domain.com/healthz` returns `200` with a
  valid certificate, and the sign-in page shows your brand.
- **Mail reaches the inbox, not spam.** Send yourself a magic link and confirm it arrives in the
  inbox. Mail from a raw server IP is filed as spam; use an authenticated mail service with SPF
  and DKIM on the sending domain. Do this before you send a client anything.
- **The real client IP is recorded.** Open a deck, then check the audit log shows your address's
  real IP, not Caddy's internal one. If it shows the proxy IP, `DT_TRUST_PROXY_HEADER` did not
  take effect.

## 9. Back it up

Everything lives in the `dt_pg` Postgres volume: the generated secrets (including the admin token)
and every deck, share, and audit event. Losing it loses all of that. Back it up on a schedule:

```sh
docker compose exec -T db pg_dump -U decktrail decktrail | gzip > decktrail-$(date +%F).sql.gz
```

Restore by piping a dump back into `psql` on a fresh volume.

## 10. Send an engagement

From your own machine (not the server), author and publish as in [Writing a deck](02-writing-decks.md)
and [Sending and tracking](04-sending-and-tracking.md), pointing `--portal` at
`https://decks.your-domain.com`. To ship a client a single grouped link for a whole engagement,
publish each artifact, then push the pack: see [the engagement hub](04-sending-and-tracking.md#send-a-whole-engagement-as-one-link).

Generate and edit decks on your own machine, never on this server: generation uses your local
`claude` login, and the server only receives the finished decks over HTTPS. Do not install or log
in the `claude` CLI here. This keeps your model login on the one machine you control and the
server model-free. See [Build locally, host remotely](04-sending-and-tracking.md#build-locally-host-remotely).

## Rollback

Bring the stack down with the same files you started it with, so Compose knows about every
service. For the Caddy option:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

For the Traefik option, swap the second file (this leaves any Traefik you run separately alone):

```sh
docker compose -f docker-compose.yml -f docker-compose.traefik.yml down
```

Nothing outside this project is touched. Add `-v` only if you also want to drop the database.

---

<!-- guide-nav -->
**The guide:** [← Going live](06-going-live.md) · [All docs](../README.md) · [Troubleshooting →](07-troubleshooting.md)
