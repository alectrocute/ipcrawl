CREATE TABLE IF NOT EXISTS cam_refresh_meta (
  id           TEXT PRIMARY KEY,
  refreshed_at TEXT NOT NULL,
  count        INTEGER NOT NULL,
  blocked      INTEGER NOT NULL DEFAULT 0,
  queries_json TEXT NOT NULL,
  errors_json  TEXT NOT NULL
);
