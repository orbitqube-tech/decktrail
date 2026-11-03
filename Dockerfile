# DeckTrail portal image. Multi-stage: build the monorepo, run the portal as non-root.
FROM node:24-slim AS build
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile
RUN pnpm -r build
# Fetch the webfont once, here, so a served deck carries its own copy and a client's browser
# never fetches one. Linking a font CDN from the deck itself would make every reader announce
# each confidential document they open to a third party.
#
# Deliberately not fatal. A build behind a proxy that cannot reach Google still produces a
# working image; its decks render in the system face, which is how they rendered until now.
RUN pnpm fetch-fonts || echo "no webfont fetched: decks will use the system face"

FROM node:24-slim AS runtime
# Security floor (2026-11-03): refuse to ship a Node runtime below the fix for CVE-2026-111497
# and three other High issues (nodejs.org security release, 21 Oct 2026). A floating base tag
# resolves to whatever image is cached on the build host; a stale cache must fail the build,
# not silently ship the old runtime. Fix a failure with `docker pull <base>` or `build --pull`.
RUN node -e "const v=process.versions.node.split('.').map(Number),f={22:[23,4],24:[22,1],26:[12,1]}[v[0]];if(v[0]<22||(f&&(v[1]<f[0]||(v[1]===f[0]&&v[2]<f[1])))){console.error('SECURITY FLOOR: Node '+process.versions.node+' is below 22.23.4 / 24.22.1 / 26.12.1 (CVE-2026-111497). Pull a fresh base image or build with --pull.');process.exit(1)}"
RUN corepack enable
WORKDIR /app
COPY --from=build /app ./
USER node
EXPOSE 3000
CMD ["node", "packages/portal/dist/server.js"]
