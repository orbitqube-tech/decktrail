#!/usr/bin/env sh
# Drive the whole product in a real browser, as the two people who use it.
#
# Wipes the stack first, on purpose: the journey starts at first boot, and the setup wizard
# only runs once. That is why this must never be pointed at a portal with real decks on it.
#
# Usage: ./scripts/e2e.sh [--headless]
set -eu

case "${DT_E2E_BASE:-http://localhost:3000}" in
  http://localhost*|http://127.0.0.1*) ;;
  *) echo "Refusing to run: this wipes the database, and DT_E2E_BASE is not local." >&2; exit 1 ;;
esac

# The example deck by default, so the gate runs on a fresh clone with nothing to configure and
# nothing private to point at. DT_E2E_IR overrides it with a deck of your own.
IR=${DT_E2E_IR:-examples/decktrail.deck.json}
if [ ! -f "$IR" ]; then
  echo "No deck at $IR. Set DT_E2E_IR to a deck IR file, or run from the repository root." >&2
  exit 1
fi

echo "Wiping and rebuilding the stack..."
docker compose down -v >/dev/null 2>&1 || true
docker compose up -d --build >/dev/null
sleep 12

DT_E2E_IR="$IR" node scripts/e2e.mjs "$@"
