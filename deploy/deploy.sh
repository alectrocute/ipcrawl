#!/usr/bin/env bash
#
# Build ipcrawl for node-server and ship it to the VPS. Run from your laptop
# (repo root or anywhere — it cd's to the repo):
#
#   VPS_SSH=root@YOUR_VPS ./deploy/deploy.sh
#
# Steps: build with the node-server preset, rsync .output/ into
# /srv/ipcrawl/app, restart the systemd service, and health-check /api/status.
# Idempotent; safe to run on every deploy.
set -euo pipefail

VPS_SSH="${VPS_SSH:?Set VPS_SSH, e.g. VPS_SSH=root@203.0.113.10}"
APP_ROOT=/srv/ipcrawl
APP_USER=ipcrawl
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

cd "$REPO_ROOT"

log "Building (NITRO_PRESET=node-server)"
NITRO_PRESET=node-server pnpm build:node

if [[ ! -f .output/server/index.mjs ]]; then
  echo "Build did not produce .output/server/index.mjs — aborting." >&2
  exit 1
fi

log "Shipping .output/ to ${VPS_SSH}:${APP_ROOT}/app"
# --delete so removed assets/chunks don't linger across deploys. The data
# volume is a sibling (${APP_ROOT}/data), never touched here.
rsync -az --delete \
  .output/ \
  "${VPS_SSH}:${APP_ROOT}/app/"

log "Fixing ownership + restarting service"
ssh "$VPS_SSH" "chown -R ${APP_USER}:${APP_USER} ${APP_ROOT}/app && systemctl restart ipcrawl && systemctl --no-pager status ipcrawl | head -n 5"

log "Health check (/api/status via localhost on the VPS)"
# Hit the app directly on the box so we test the origin, not the CDN cache.
for i in $(seq 1 10); do
  if ssh "$VPS_SSH" "curl -fsS -m 5 http://127.0.0.1:3000/api/status >/dev/null"; then
    echo "Origin is up."
    exit 0
  fi
  echo "  not ready yet (attempt $i/10)…"; sleep 2
done

echo "Health check failed after 10 attempts. Check: ssh ${VPS_SSH} journalctl -u ipcrawl -n 50" >&2
exit 1
