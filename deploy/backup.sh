#!/usr/bin/env bash
#
# Nightly local backup of the ipcrawl data volume. Runs on the VPS as the
# ipcrawl user via ipcrawl-backup.timer. On Cloudflare, D1/R2 were durable by
# default; on a single VPS, durability is now your job — pair this with an
# off-box copy (rsync/rclone the resulting tarball elsewhere) for real safety.
#
# Produces, under ${APP_ROOT}/backups:
#   - explore-<ts>.sqlite  : a consistent sqlite3 .backup snapshot (WAL-safe)
#   - data-<ts>.tar.gz      : screenshots + kv log + the sqlite snapshot
# and prunes anything older than RETENTION_DAYS.
set -euo pipefail

APP_ROOT="${APP_ROOT:-/srv/ipcrawl}"
DATA_DIR="${NUXT_DATA_DIR:-$APP_ROOT/data}"
SQLITE_PATH="${NUXT_SQLITE_PATH:-$DATA_DIR/explore.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-$APP_ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"

# sqlite3 .backup takes a live, consistent snapshot even with WAL + the app
# writing — much safer than cp'ing the file mid-transaction.
snapshot="$BACKUP_DIR/explore-$ts.sqlite"
if [[ -f "$SQLITE_PATH" ]]; then
  sqlite3 "$SQLITE_PATH" ".backup '$snapshot'"
fi

# Bundle the screenshots + KV log alongside the DB snapshot. Exclude the live
# sqlite/-wal/-shm (the snapshot above is the consistent copy of the DB).
tarball="$BACKUP_DIR/data-$ts.tar.gz"
tar -czf "$tarball" \
  --exclude='explore.sqlite' \
  --exclude='explore.sqlite-wal' \
  --exclude='explore.sqlite-shm' \
  -C "$DATA_DIR" . \
  -C "$BACKUP_DIR" "$(basename "$snapshot")"

# Prune old snapshots + tarballs.
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'explore-*.sqlite' -o -name 'data-*.tar.gz' \) \
  -mtime +"$RETENTION_DAYS" -delete

echo "Backup complete: $tarball"
