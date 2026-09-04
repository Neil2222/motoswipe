#!/bin/sh
set -eu

# =============================================================================
# MotoSwipe container entrypoint
#
# Applies pending migrations, then hands off to the server with `exec` so Node
# becomes PID 1's direct child and receives SIGTERM on `docker stop`.
#
# `prisma migrate deploy` is the deploy-safe command: it applies committed
# migrations and never generates, resets or prompts. Running it on every start
# means a `docker compose pull && up -d` upgrade migrates itself.
#
# Set MOTOSWIPE_SKIP_MIGRATIONS=1 to opt out — for instance when several
# replicas start at once and you would rather migrate once, deliberately, from
# a one-off container.
# =============================================================================

log() {
  echo "[motoswipe] $*"
}

if [ -z "${DATABASE_URL:-}" ]; then
  log "FATAL: DATABASE_URL is not set."
  log "Pass it through docker compose, or see .env.example."
  exit 1
fi

if [ "${MOTOSWIPE_SKIP_MIGRATIONS:-0}" = "1" ]; then
  log "MOTOSWIPE_SKIP_MIGRATIONS=1 — not applying migrations."
else
  log "Applying database migrations..."

  # Postgres may still be starting even with a compose healthcheck in front, so
  # retry a few times before giving up.
  attempt=1
  max_attempts=10
  until npx prisma migrate deploy; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      log "FATAL: migrations failed after ${max_attempts} attempts."
      exit 1
    fi
    log "Migration attempt ${attempt}/${max_attempts} failed; retrying in 3s..."
    attempt=$((attempt + 1))
    sleep 3
  done

  log "Migrations are up to date."
fi

log "Starting MotoSwipe on port ${PORT:-3000}"
exec "$@"
