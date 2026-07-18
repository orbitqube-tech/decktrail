#!/usr/bin/env sh
# Run the integration tests against a real Postgres.
#
# They exist because the fakes lie. InMemoryThemeAdmin and DrizzleThemeAdmin disagreed about
# whether a delete was scoped by workspace, and the suite passed against the permissive fake
# while production silently did nothing. The atomic single-use magic-link claim, which is the
# only thing stopping link replay, has no meaningful in-memory equivalent at all: it is a
# DELETE ... RETURNING and either the database does it atomically or it does not.
#
# They skip themselves without DATABASE_URL_TEST, so before this script they ran nowhere.
# One of them had been failing since a refactor and nobody knew.
#
# Usage: ./scripts/test-integration.sh      (needs the compose stack up)
set -eu

BRIDGE=dt-pgbridge
PORT=${DT_TEST_PG_PORT:-55432}
DB=${DT_TEST_DB:-decktrail_test}

cleanup() { docker rm -f "$BRIDGE" >/dev/null 2>&1 || true; }
trap cleanup EXIT

if [ ! -f .env ]; then
  echo "No .env. Copy .env.example and set POSTGRES_PASSWORD." >&2
  exit 1
fi
PW=$(grep '^POSTGRES_PASSWORD=' .env | cut -d= -f2-)

if ! docker compose ps db --status running >/dev/null 2>&1; then
  echo "The db service is not running. Start it with: docker compose up -d db" >&2
  exit 1
fi

# A throwaway database, so a test run can never touch real decks.
docker compose exec -T db psql -U decktrail -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
docker compose exec -T db psql -U decktrail -d postgres -c "CREATE DATABASE ${DB};" >/dev/null

# The compose file does not publish the database port, which is right: it should not be
# reachable from outside the stack. So bridge it for the length of this run only.
NET=$(docker inspect "$(docker compose ps -q db)" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}')
cleanup
docker run --rm -d --name "$BRIDGE" --network "$NET" -p "${PORT}:5432" \
  alpine/socat tcp-listen:5432,fork,reuseaddr tcp-connect:db:5432 >/dev/null
sleep 2

DATABASE_URL_TEST="postgres://decktrail:${PW}@localhost:${PORT}/${DB}" \
  pnpm --filter @decktrail/portal test

docker compose exec -T db psql -U decktrail -d postgres -c "DROP DATABASE IF EXISTS ${DB};" >/dev/null
echo "Integration tests done, ${DB} dropped."
