#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# AuraFlow Portal — VPS release activation (runs ON the server, AFTER CI rsync).
#
# This script does NOT build. CI (Woodpecker, laptop agent) builds the server
# bundle (a single self-contained index.js via `bun build`) + the Vite SPA
# static files and rsyncs them into /opt/auraflow-release-incoming/. This
# script atomically swaps that into /opt/auraflow/ and restarts the app.
#
# Why split build vs activate? The VPS has 1GB RAM shared with ScanForge.
# Building on it risks OOM. The laptop agent has headroom; the VPS only ever
# runs the already-built artifacts.
#
# Architecture: the Portal is ONE Bun process that serves both the API
# (from the bundled server/dist/index.js) and the static frontend (from
# client/dist, served by the server itself). No Caddy for the Portal —
# Caddy only fronts the single domain portal.sanketpatel.online → :3001.
#
# Layout after activation:
#   /opt/auraflow/
#     server/.env                  (production secrets — preserved across releases)
#     server/dist/index.js         (bundled server — no node_modules needed)
#     client/dist/...              (Vite SPA static files — served by the server)
#     deploy/vps-deploy.sh         (this script)
#
# Usage (called by CI over SSH after rsync):
#   bash /opt/auraflow-release-incoming/deploy/vps-deploy.sh
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

[[ "$(id -un)" == "auraflow" ]] || err "Must run as user 'auraflow' (got $(id -un))."

[[ -d "$INCOMING" ]] || err "Incoming release $INCOMING missing — did CI rsync run?"
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
mkdir -p "$INCOMING"  # recreate incoming dir for the next CI rsync
log "Release activated at $ACTIVE ($(date -u +%FT%TZ))"

# ── 3. Restart the app (single process: API + static) ────────────────────────
# Sudoers (auraflow-deploy) pins the exact systemctl commands: use the unit
# name WITHOUT flags/suffix (`restart auraflow`, `status auraflow`).
log "Restarting auraflow service..."
sudo systemctl restart auraflow

# Brief settle, then surface status.
sleep 3
log "Service status:"
sudo systemctl is-active auraflow || true

log "Memory:"
free -m | awk '/^Mem:/ {printf "  used=%sMi free=%sMi avail=%sMi\n", $3, $4, $7}'

log "Activate complete. Tail logs with:"
log "  sudo journalctl -u auraflow -f"
log "Rollback (if needed): sudo -u auraflow bash -c 'rm -rf /opt/auraflow && mv /opt/auraflow-prev /opt/auraflow' && sudo systemctl restart auraflow"
