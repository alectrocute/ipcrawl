#!/usr/bin/env bash
#
# Move all existing production data off Cloudflare and onto the VPS:
#   D1 (ipcrawl)              -> SQLite file  (NUXT_SQLITE_PATH)
#   R2 (stumbletv-screenshots)-> SSD dir      (NUXT_DATA_DIR/screenshots)
#   KV (CAMS_KV: refresh:runs)-> fs kv log    (NUXT_DATA_DIR/cams/refresh/runs)
#
# Run from your laptop (repo root), authenticated with wrangler + an rclone
# remote for R2. Run AFTER setup-vps.sh (so sqlite3 + the data dirs exist) and
# BEFORE deploy.sh / before the ipcrawl service is started, so the import lands
# in a clean database.
#
#   VPS_SSH=root@YOUR_VPS ./deploy/migrate-data.sh            # d1 + r2 + kv
#   VPS_SSH=root@YOUR_VPS ./deploy/migrate-data.sh --freeze   # flip prod to
#                                                             # offline first
#   VPS_SSH=root@YOUR_VPS ./deploy/migrate-data.sh d1         # one step only
#
# Steps are individually runnable: freeze | d1 | r2 | kv | verify. With no step
# args it runs d1, r2, kv, verify (freeze is opt-in because it takes the live
# site down).
set -euo pipefail

VPS_SSH="${VPS_SSH:?Set VPS_SSH, e.g. VPS_SSH=root@203.0.113.10}"

# Match wrangler.jsonc.
D1_NAME="${D1_NAME:-ipcrawl}"
R2_BUCKET="${R2_BUCKET:-stumbletv-screenshots}"
KV_BINDING="${KV_BINDING:-CAMS_KV}"
# rclone remote name pointing at your R2 account (rclone config; type=s3,
# provider=Cloudflare). Bucket is appended below.
R2_REMOTE="${R2_REMOTE:-r2}"

# Paths on the VPS (must match deploy/env.example).
REMOTE_DATA_DIR="${REMOTE_DATA_DIR:-/srv/ipcrawl/data}"
REMOTE_SQLITE="${REMOTE_SQLITE:-$REMOTE_DATA_DIR/explore.sqlite}"
APP_USER="${APP_USER:-ipcrawl}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m%s\033[0m\n' "$*"; }

cd "$REPO_ROOT"

# --- steps ------------------------------------------------------------------

freeze_prod() {
  log "FREEZE: redeploying Worker with NUXT_OFFLINE_FOR_NOW=true"
  warn "This takes the live Cloudflare site to the offline page so no favorites/"
  warn "live-frame writes land in D1/R2 after the export below. Ctrl-C within 5s to abort."
  sleep 5
  # --var overrides the wrangler.jsonc var at deploy time without editing the file.
  npx wrangler deploy --var NUXT_OFFLINE_FOR_NOW:true
  echo "Prod is frozen. Undo later with a normal 'npm run cf:deploy' if you ever roll back."
}

migrate_d1() {
  log "D1 -> SQLite: exporting ${D1_NAME}"
  local dump="$STAGING/d1-dump.sql"
  npx wrangler d1 export "$D1_NAME" --remote --output "$dump"
  echo "Export size: $(du -h "$dump" | cut -f1)"

  log "Stopping ipcrawl service (if running) and resetting the target DB"
  # A clean import: remove any existing file so we don't merge into a
  # half-initialized schema. The app self-heals schema on boot, but importing
  # into an empty file guarantees D1's exact contents land verbatim.
  ssh "$VPS_SSH" "systemctl stop ipcrawl 2>/dev/null || true; \
    rm -f '$REMOTE_SQLITE' '$REMOTE_SQLITE-wal' '$REMOTE_SQLITE-shm'; \
    mkdir -p '$(dirname "$REMOTE_SQLITE")'"

  log "Importing dump into ${REMOTE_SQLITE}"
  # Stream the dump straight into sqlite3 on the VPS.
  ssh "$VPS_SSH" "sqlite3 '$REMOTE_SQLITE'" < "$dump"
  ssh "$VPS_SSH" "chown ${APP_USER}:${APP_USER} '$REMOTE_SQLITE'"
  echo "Import complete."
}

migrate_r2() {
  log "R2 -> SSD: staging ${R2_REMOTE}:${R2_BUCKET} locally"
  # Sync R2 to a local staging dir, then push to the VPS. Two-hop keeps R2
  # creds on your laptop (nothing sensitive lands on the box) and makes the
  # transfer resumable/inspectable.
  mkdir -p "$STAGING/screenshots"
  rclone sync "${R2_REMOTE}:${R2_BUCKET}" "$STAGING/screenshots" --progress
  local n
  n="$(find "$STAGING/screenshots" -type f | wc -l | tr -d ' ')"
  echo "Fetched ${n} screenshot objects."

  log "Pushing screenshots to ${REMOTE_DATA_DIR}/screenshots"
  ssh "$VPS_SSH" "mkdir -p '$REMOTE_DATA_DIR/screenshots'"
  # Trailing slash: contents into the dir. The unstorage fs driver stores each
  # object flat as '<id>.<ext>', exactly how they came out of R2.
  rsync -az --delete "$STAGING/screenshots/" "${VPS_SSH}:${REMOTE_DATA_DIR}/screenshots/"
  ssh "$VPS_SSH" "chown -R ${APP_USER}:${APP_USER} '$REMOTE_DATA_DIR/screenshots'"
  echo "Screenshots transferred."
}

migrate_kv() {
  log "KV -> fs: copying refresh:runs history"
  # Only the refresh run log is durable/useful; livepersist:* gates are
  # ephemeral rate gates that repopulate on their own, so we skip them.
  local runs="$STAGING/refresh-runs.json"
  if npx wrangler kv key get "refresh:runs" --binding "$KV_BINDING" > "$runs" 2>/dev/null && [[ -s "$runs" ]]; then
    # unstorage fs driver maps the key 'refresh:runs' to '<base>/refresh/runs'.
    ssh "$VPS_SSH" "mkdir -p '$REMOTE_DATA_DIR/cams/refresh'"
    rsync -az "$runs" "${VPS_SSH}:${REMOTE_DATA_DIR}/cams/refresh/runs"
    ssh "$VPS_SSH" "chown -R ${APP_USER}:${APP_USER} '$REMOTE_DATA_DIR/cams'"
    echo "Migrated refresh:runs ($(wc -c < "$runs" | tr -d ' ') bytes)."
  else
    warn "No refresh:runs key found in KV (or it was empty) — skipping. The log"
    warn "will simply start fresh on the VPS; not a data-loss concern."
  fi
}

verify() {
  log "VERIFY: comparing row/object counts (D1/R2 vs VPS)"
  local tables=(cams cam_favorites cam_count_snapshots cam_refresh_meta)
  for t in "${tables[@]}"; do
    local d1_count vps_count
    d1_count="$(npx wrangler d1 execute "$D1_NAME" --remote --json \
      --command "SELECT COUNT(*) AS n FROM $t" 2>/dev/null \
      | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log(j[0].results[0].n)}catch{console.log("?")}})')"
    vps_count="$(ssh "$VPS_SSH" "sqlite3 '$REMOTE_SQLITE' 'SELECT COUNT(*) FROM $t'" 2>/dev/null || echo '?')"
    printf '  %-22s D1=%-8s VPS=%-8s %s\n' "$t" "$d1_count" "$vps_count" \
      "$([[ "$d1_count" == "$vps_count" ]] && echo OK || echo MISMATCH)"
  done

  local r2_via_db vps_files
  r2_via_db="$(ssh "$VPS_SSH" "sqlite3 '$REMOTE_SQLITE' 'SELECT COUNT(*) FROM cams'" 2>/dev/null || echo '?')"
  vps_files="$(ssh "$VPS_SSH" "find '$REMOTE_DATA_DIR/screenshots' -type f 2>/dev/null | wc -l | tr -d ' '" || echo '?')"
  printf '  %-22s cams=%-8s screenshots=%-8s %s\n' "screenshots" "$r2_via_db" "$vps_files" \
    "(a few missing is normal: not every cam has a stored still)"
}

# --- dispatch ---------------------------------------------------------------
steps=("$@")
if [[ ${#steps[@]} -eq 0 ]]; then
  steps=(d1 r2 kv verify)
fi

for step in "${steps[@]}"; do
  case "$step" in
    --freeze|freeze) freeze_prod ;;
    d1)              migrate_d1 ;;
    r2)              migrate_r2 ;;
    kv)              migrate_kv ;;
    verify)          verify ;;
    *) echo "Unknown step: $step (valid: freeze|d1|r2|kv|verify)" >&2; exit 1 ;;
  esac
done

log "Data migration steps complete: ${steps[*]}"
