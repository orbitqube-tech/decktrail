#!/usr/bin/env sh
# Bring DeckTrail up from a fresh clone, and put the command line tool on your PATH.
#
# One command, because every step below is either derivable or generated, and a step a person has
# to perform by hand is a step they can get wrong. The only value that must be chosen is the
# database password, so this generates one; the portal's own secrets it generates itself on first
# boot, and this deliberately leaves them empty rather than inventing them here.
#
# Safe to run twice. An existing .env is never overwritten and an existing stack is left running.
#
# Usage: ./scripts/up.sh [--port <n>] [--gateway]
set -eu

PORT_WANTED=3000
GATEWAY=0
GATEWAY_PORT=20128
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT_WANTED=${2:?--port needs a number}; shift 2 ;;
    --gateway) GATEWAY=1; shift ;;
    --gateway-port) GATEWAY_PORT=${2:?--gateway-port needs a number}; shift 2 ;;
    -h|--help) echo "Usage: ./scripts/up.sh [--port <n>] [--gateway] [--gateway-port <n>]"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [ ! -f docker-compose.yml ] || [ ! -f .env.example ]; then
  echo "Run this from the repository root: ./scripts/up.sh" >&2
  exit 1
fi

say() { printf '  %s\n' "$1"; }
die() { printf '\n%s\n' "$1" >&2; exit 1; }

printf '\nDeckTrail\n\n'

# ---------------------------------------------------------------- what must already be here

command -v docker >/dev/null 2>&1 || die "Docker is not installed, or not on your PATH. Install Docker Desktop or Docker Engine, then run this again."
docker compose version >/dev/null 2>&1 || die "This needs Docker Compose v2, which ships with current Docker. 'docker compose version' failed."
docker info >/dev/null 2>&1 || die "Docker is installed but not running. Start it, then run this again."
say "Docker is running"

# The tool is built with pnpm because this is a workspace. Corepack ships with Node and can
# provide pnpm without a separate install, so it is tried before giving up on the author's behalf.
PNPM=""
if command -v pnpm >/dev/null 2>&1; then
  PNPM="pnpm"
elif command -v corepack >/dev/null 2>&1 && corepack enable pnpm >/dev/null 2>&1 && command -v pnpm >/dev/null 2>&1; then
  PNPM="pnpm"
fi
[ -n "$PNPM" ] || die "Node with pnpm is needed to build the command line tool. Install Node 24 or newer, then run: corepack enable pnpm"
say "pnpm is available"

# ---------------------------------------------------------------- the port

port_busy() {
  # Ask the operating system, not a guess. Any listener on the port is a reason to stop.
  if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Ports}}' 2>/dev/null | grep -q ":$1->"; then
    return 0
  fi
  if command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -qE "[.:]$1[[:space:]].*LISTEN" && return 0
  fi
  return 1
}

# ---------------------------------------------------------------- configuration

# .env is the authoritative home for the port once it exists, so it is read rather than overridden.
# Deciding the port here and letting Compose read a different one from the file is exactly the
# guess-a-value-you-cannot-see mistake that this project has paid for before.
if [ -f .env ]; then
  PORT=$(sed -n 's/^PORT=\([0-9][0-9]*\).*/\1/p' .env | tail -1)
  PORT=${PORT:-3000}
  if [ "$PORT" != "$PORT_WANTED" ] && [ "$PORT_WANTED" != 3000 ]; then
    say "Ignoring --port $PORT_WANTED: your existing .env says PORT=$PORT, and it wins"
  fi
  say "Keeping the .env you already have, on port $PORT"
else
  PORT=$PORT_WANTED
fi

# Our own running stack holds this port, and that is not a conflict. Without this the second run of
# a script whose whole promise is that it is safe to run twice failed on the port it had itself
# taken. "Busy" has to mean somebody else.
ours_already_up() {
  docker compose ps -q portal 2>/dev/null | grep -q . || return 1
  curl -fsS "http://localhost:$1/healthz" >/dev/null 2>&1
}

if ours_already_up "$PORT"; then
  say "DeckTrail is already running on port $PORT"
elif port_busy "$PORT"; then
  if [ -f .env ]; then
    die "Port $PORT is already in use by something else on this machine, and your .env asks for it.
Change PORT and DT_BASE_HOST in .env to a free port, then run this again."
  fi
  die "Port $PORT is already in use by something else on this machine.
Pick another and DeckTrail will use it end to end:

    ./scripts/up.sh --port 3900"
else
  say "Port $PORT is free"
fi

random_secret() {
  # Three sources, tried in order, because a weak password here is not worth a convenience.
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24 && return 0
  fi
  if [ -r /dev/urandom ] && command -v od >/dev/null 2>&1; then
    od -An -tx1 -N24 /dev/urandom | tr -d ' \n' && return 0
  fi
  if command -v node >/dev/null 2>&1; then
    node -e 'process.stdout.write(require("node:crypto").randomBytes(24).toString("hex"))' && return 0
  fi
  return 1
}

if [ ! -f .env ]; then
  PW=$(random_secret) || die "Could not generate a database password: no openssl, no /dev/urandom and no node. Copy .env.example to .env and set POSTGRES_PASSWORD yourself."
  # Only the database password is written. DT_TOKEN_SECRET, DT_SESSION_SECRET and DT_ADMIN_TOKEN
  # stay empty on purpose: the portal mints and persists those on first boot, and a value invented
  # here would be a second source of truth for a secret.
  awk -v pw="$PW" -v port="$PORT" '
    /^POSTGRES_PASSWORD=/ { print "POSTGRES_PASSWORD=" pw; next }
    /^PORT=/              { print "PORT=" port; next }
    /^DT_BASE_HOST=/      { print "DT_BASE_HOST=localhost:" port; next }
    { print }
  ' .env.example > .env
  say "Wrote .env with a generated database password"
fi

# ---------------------------------------------------------------- the stack

say "Starting the stack, which pulls images the first time"
# Deliberately not `--wait`: on a first boot the database initialises and the portal mints and
# persists its secrets, and that ran past Compose's own patience while the stack was in fact coming
# up fine. Start the containers, then wait on the thing that actually matters, which is the portal
# answering. Compose's output is kept so a real failure can be shown rather than summarised.
if ! docker compose up -d >/tmp/decktrail-up.log 2>&1; then
  echo "" >&2
  echo "The stack did not start. Docker's own words:" >&2
  cat /tmp/decktrail-up.log >&2
  exit 1
fi

BASE="http://localhost:$PORT"
say "Waiting for the portal, which sets itself up on a first boot"
i=0
until [ "$i" -ge 180 ]; do
  if curl -fsS "$BASE/healthz" >/dev/null 2>&1; then break; fi
  if [ "$(docker compose ps -q portal 2>/dev/null | wc -l)" -eq 0 ]; then
    echo "" >&2
    echo "The portal container is gone. Its last words:" >&2
    docker compose logs --tail 40 portal >&2 || true
    exit 1
  fi
  i=$((i + 1))
  sleep 1
done
if [ "$i" -ge 180 ]; then
  echo "" >&2
  echo "The stack started but $BASE/healthz never answered. The portal's own words:" >&2
  docker compose logs --tail 40 portal >&2 || true
  exit 1
fi
say "Portal is healthy on $BASE"

# ---------------------------------------------------------------- the command line tool

say "Building the command line tool"
$PNPM install --silent >/dev/null 2>&1 || die "pnpm install failed. Run it yourself to see why: $PNPM install"
$PNPM -r build >/dev/null 2>&1 || die "The build failed. Run it yourself to see why: $PNPM -r build"

# A repository-local launcher always works and needs no permissions. Linking it globally is nicer
# when it is allowed, so it is attempted and its failure is not fatal.
cat > decktrail <<'LAUNCHER'
#!/usr/bin/env sh
exec node "$(dirname "$0")/packages/studio/dist/cli.js" "$@"
LAUNCHER
chmod +x decktrail

HOW="./decktrail"
if (cd packages/studio && npm link >/dev/null 2>&1) && command -v decktrail >/dev/null 2>&1; then
  HOW="decktrail"
  say "Installed the decktrail command on your PATH"
else
  say "Created ./decktrail in this folder (a global install was not available)"
fi

# ---------------------------------------------------------------- the optional routing gateway

GATEWAY_READY=0
if [ "$GATEWAY" -eq 1 ]; then
  if docker ps --format '{{.Names}}' | grep -qx decktrail-gateway; then
    say "Routing gateway already running"
    GATEWAY_READY=1
  elif port_busy "$GATEWAY_PORT"; then
    say "Something already listens on $GATEWAY_PORT; leaving it alone and skipping the gateway"
  else
    say "Starting a routing gateway, which pulls a large image the first time"
    docker rm -f decktrail-gateway >/dev/null 2>&1 || true
    if docker run -d --name decktrail-gateway --stop-timeout 40 \
        -p "127.0.0.1:$GATEWAY_PORT:20128" \
        -v decktrail-gateway-data:/app/data \
        diegosouzapw/omniroute:latest >/dev/null 2>&1; then
      i=0
      until [ "$i" -ge 120 ]; do
        curl -fsS "http://127.0.0.1:$GATEWAY_PORT/v1/models" >/dev/null 2>&1 && break
        i=$((i + 1)); sleep 1
      done
      if [ "$i" -lt 120 ]; then
        say "Gateway is answering on http://127.0.0.1:$GATEWAY_PORT"
        GATEWAY_READY=1
      else
        say "The gateway started but never answered. Look at: docker logs decktrail-gateway"
      fi
    else
      say "Could not start the gateway. Look at: docker logs decktrail-gateway"
    fi
  fi

  # Teaching OpenCode about the gateway means editing OpenCode's configuration, which belongs to
  # the author and may already say things we must not lose. So this merges, backs up first, and
  # refuses rather than guesses when the file carries comments a JSON parser would destroy.
  if [ "$GATEWAY_READY" -eq 1 ] && command -v node >/dev/null 2>&1; then
    GATEWAY_PORT="$GATEWAY_PORT" node scripts/wire-gateway.mjs || true
  fi
fi

# ---------------------------------------------------------------- what to do next

SETUP=$(docker compose logs portal 2>/dev/null | grep -o "$BASE/setup?token=[A-Za-z0-9_-]*" | tail -1 || true)

printf '\nReady.\n\n'
if [ -n "$SETUP" ]; then
  printf 'Open this once to name yourself and set your brand:\n\n    %s\n\n' "$SETUP"
else
  printf 'Finish setup by opening the link this prints:\n\n    docker compose logs portal | grep setup\n\n'
fi
printf 'Then make a deck from anything you already have:\n\n'
if [ "$GATEWAY_READY" -eq 1 ]; then
  printf '    %s generate notes.md --client acme --prompt "lead with the cost" \\\n' "$HOW"
  printf '        --provider opencode --model omniroute/bestfast\n\n'
  printf 'That routes through the gateway, which picks a free model and reports what it cost.\n'
  printf 'Drop the last line to use your own Claude login instead.\n\n'
else
  printf '    %s generate notes.md --client acme --prompt "lead with the cost"\n' "$HOW"
  printf '    %s generate proposal.pdf --client acme\n\n' "$HOW"
fi
printf 'A PDF, a PowerPoint deck, a Word document, a scan or plain notes all work.\n\n'
