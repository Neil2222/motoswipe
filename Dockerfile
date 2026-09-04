# syntax=docker/dockerfile:1.7

# =============================================================================
# MotoSwipe production image
#
# Multi-stage so the published image contains no build toolchain, no dev
# dependencies and no source: just Node, the compiled server, the Prisma client
# and the migration files.
#
# Base is Debian slim rather than Alpine. Prisma 7 talks to Postgres through the
# node-postgres driver adapter, so there is no Rust query engine to match to a
# libc — but @node-rs/argon2 does ship native bindings, and glibc prebuilds are
# the ones that are reliably available for both amd64 and arm64.
#
# Build:  docker build -t youruser/motoswipe:latest .
# Multi-arch:
#   docker buildx build --platform linux/amd64,linux/arm64 \
#     -t youruser/motoswipe:latest --push .
# =============================================================================

ARG NODE_VERSION=24-bookworm-slim


# -----------------------------------------------------------------------------
# 1. Dependencies — cached independently of source changes
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS deps
WORKDIR /app

# Only the manifests, so this layer is reused whenever source changes but
# dependencies do not.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev


# -----------------------------------------------------------------------------
# 2. Build — generate the Prisma client, compile SvelteKit
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS build
WORKDIR /app

ENV NODE_ENV=development

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma.config.ts ./
COPY prisma ./prisma

# The generated client is TypeScript that Vite compiles into the bundle, so it
# has to exist before the build.
RUN npx prisma generate

COPY . .

# `env.ts` validates lazily, so no database or secret is needed to build.
RUN npm run build

# Reinstall production-only dependencies for the runtime stage. Done here rather
# than with `npm prune` so the lockfile is honoured exactly.
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev


# -----------------------------------------------------------------------------
# 3. Runtime
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    # adapter-node reads these directly. BODY_SIZE_LIMIT guards against a
    # request body large enough to exhaust memory.
    BODY_SIZE_LIMIT=512K

# Only what the container actually needs:
#  - openssl: TLS to Postgres when the database enforces it
#  - tini:    a real PID 1, so SIGTERM reaches Node and shutdown is clean
#  - curl:    the healthcheck below
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl tini curl \
 && rm -rf /var/lib/apt/lists/*

# Never run as root. The node image already provides uid/gid 1000.
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/package.json ./package.json

# NOTE ON IMAGE SIZE
#
# The image is around 860 MB, and roughly 215 MB of that is the Prisma CLI,
# which the entrypoint needs to run `migrate deploy` on every start.
#
# Pruning @prisma/studio-core and @prisma/dev (about 60 MB plus their React
# tree) was tried and reverted: the Prisma 7 CLI eagerly requires
# `@prisma/studio-core/data/bff` even for `migrate deploy`, so removing it
# breaks migrations outright.
#
# The alternative — dropping the CLI and making the operator apply migrations
# by hand — trades disk space, which a NAS has, for an upgrade footgun, which
# it does not need. Self-updating migrations are worth the megabytes.

# Migrations and the Prisma CLI config, so the container can run
# `prisma migrate deploy` against its own schema at startup.
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts

# The TypeScript sources and CLI entrypoints.
#
# The compiled server in ./build does not need these, but the seed and import
# commands do, and both are things an operator has to be able to run inside the
# container:
#
#   docker compose exec motoswipe npx tsx prisma/seed.ts
#   docker compose exec motoswipe npx tsx scripts/import.ts --list
#
# A fresh instance with an empty catalogue has nothing to swipe, so "load the
# starter data" cannot be a build-machine-only operation. Copied from the build
# stage rather than the context so the generated Prisma client comes along.
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts ./scripts

# The entrypoint applies migrations, then execs the server.
COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/motoswipe-entrypoint
RUN test -x /usr/local/bin/motoswipe-entrypoint || true

EXPOSE 3000

# Hits a route that touches the database, so an app that cannot reach Postgres
# is reported unhealthy rather than merely "listening".
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/healthz" || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/bin/sh", "/usr/local/bin/motoswipe-entrypoint"]
CMD ["node", "build/index.js"]
