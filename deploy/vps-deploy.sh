#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AuraFlow Portal — VPS release activation.
#
# Runs ON the server. With the VPS-native CI agent, this is called directly by
# the pipeline (no SSH). With the laptop agent it was called over SSH instead.
#
# This script does NOT build. CI builds the server bundle (a single
# self-contained index.js via `bun build`) + the Vite SPA static files and
# stages them into /opt/auraflow-release-incoming/. This script atomically
# swaps that into /opt/auraflow/ and restarts the app.
#
# Architecture: the Portal is ONE Bun process that serves both the API
# (from the bundled server/dist/index.js) and the static frontend (from
# client/dist, served by the server itself). Caddy fronts the single domain
# portal.sanketpatel.online → :3001.
#
# Layout after activation:
#   /opt/auraflow/
#     server/.env                  (production secrets — preserved across releases)
#     server/dist/index.js         (bundled server — no node_modules needed)
#     client/dist/...              (Vite SPA static files — served by the server)
#     deploy/vps-deploy.sh         (this script)
#
# Caller must have: write to /opt + /opt/auraflow-release-incoming, and sudo
# rights for `systemctl restart auraflow`. The woodpecker-agent user has all
# three (it's in the auraflow+scanforge groups and has a sudoers entry).
#
# Exits non-zero on any failure. /opt/auraflow/server/.env is NEVER overwritten.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

INCOMING="/opt/auraflow-release-incoming"
ACTIVE="/opt/auraflow"
BACKUP="/opt/auraflow-prev"
LOG_PREFIX="[auraflow-activate]"

log() { echo "$LOG_PREFIX $*"; }
err() { echo "$LOG_PREFIX ERROR: $*" >&2; exit 1; }

[[ -d "$INCOMING" ]] || err "Incoming release $INCOMING missing — did CI stage the artifact?"
[[ -f "$INCOMING/server/dist/index.js" ]] || err "Server bundle missing in incoming release."
[[ -f "$INCOMING/client/dist/index.html" ]] || err "Web client/dist/index.html missing in incoming release."

# ── 1. Preserve the existing server/.env (the ONLY file we must not clobber) ─
ENV_FILE="$ACTIVE/server/.env"
if [[ -f "$ENV_FILE" ]]; then
  log "Preserving existing $ENV_FILE"
  cp "$ENV_FILE" "$INCOMING/server/.env"
else
  err "No $ENV_FILE found — create it from server/.env.example before first deploy."
fi

# ── 2. Swap incoming → active atomically (keep a 1-deep rollback) ────────────
log "Activating new release..."
if [[ -d "$BACKUP" ]]; then
  log "Removing previous backup $BACKUP"
  rm -rf "$BACKUP"
fi
if [[ -d "$ACTIVE" ]]; then
  log "Moving current release to $BACKUP (rollback target)"
  mv "$ACTIVE" "$BACKUP"
fi
mv "$INCOMING" "$ACTIVE"
mkdir -p "$INCOMING"  # recreate incoming dir for the next CI stage
log "Release activated at $ACTIVE ($(date -u +%FT%TZ))"

# ── 3. Restart the app (single process: API + static) ────────────────────────
# Sudoers pins the exact systemctl command: `restart auraflow` (no .service).
log "Restarting auraflow service..."
sudo systemctl restart auraflow

# Brief settle, then surface status.
sleep 3
log "Service status: $(sudo systemctl is-active auraflow || true)"

log "Memory:"
free -m | awk '/^Mem:/ {printf "  used=%sMi free=%sMi avail=%sMi\n", $3, $4, $7}'

log "Activate complete. Tail logs with: sudo journalctl -u auraflow -f"
log "Rollback (if needed): sudo bash -c 'rm -rf /opt/auraflow && mv /opt/auraflow-prev /opt/auraflow' && sudo systemctl restart auraflow"
