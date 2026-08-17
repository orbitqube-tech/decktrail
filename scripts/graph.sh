#!/usr/bin/env sh
# Rebuild the knowledge graph over this repository.
#
# The command lives here rather than in somebody's shell history so that "regenerate the graph"
# means one fixed thing, flags and all, and so a later reader can tell whether the graph they
# are looking at is current.
#
# Usage: ./scripts/graph.sh
set -eu

command -v graphify >/dev/null 2>&1 || {
  echo "graphify is not on PATH. This script only rebuilds the graph; it does not install it." >&2
  exit 1
}

echo "Rebuilding the code graph (no model call, no token cost)..."
graphify update .

cat <<'NOTE'

Done. Two numbers in graphify-out/GRAPH_REPORT.md have to be read together:

  Extraction: 100% EXTRACTED ... / Token cost: 0 input - 0 output

A hundred percent extracted at zero token cost is not a perfect score. It means no semantic
lane was available, so every node came from parsing structure rather than from reading prose.
On a corpus with this much documentation in it, that is a large silent gap, and the report has
no field that says so. Quote the token cost whenever you quote the percentage.

`graphify update` is deliberately the only pass here. A semantic pass costs real money and is
an opt-in for a specific question, never a default.
NOTE
