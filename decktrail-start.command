#!/usr/bin/env bash
# Double-click entry point for macOS. It is a doorway to scripts/up.sh, not a second copy of
# the install: every decision about ports, secrets and containers is made there, so this file
# stays thin enough that it cannot disagree with the other platforms.
#
# No port is passed. The port's one authoritative home is .env, and up.sh already defaults to
# 3000 and defers to .env when it exists. Naming it again here would pin a value that is meant
# to be a setting.
#
# This file is committed with its executable bit set. Do not ship it without one: a launcher a
# reader has to be told to chmod is a launcher that fails on the first double click.
set -eu

# Finder starts a double-clicked file in the user's home directory, so anchor to the one this
# file lives in before using any relative path.
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==================================================="
echo "Starting DeckTrail Local Environment..."
echo "==================================================="
echo ""
echo "Please wait while the application boots up."
echo "Do not close this terminal while you are using DeckTrail."
echo ""

./scripts/up.sh

echo ""
echo "DeckTrail has stopped."
