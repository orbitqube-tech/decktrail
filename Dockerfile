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
RUN corepack enable
WORKDIR /app
COPY --from=build /app ./
USER node
EXPOSE 3000
CMD ["node", "packages/portal/dist/server.js"]
