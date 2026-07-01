-- One row per refresh run, capturing the total catalogue size at that moment.
-- Feeds the 12-month rolling "cameras over time" chart on /stats. The `cams`
-- table itself hard-deletes rows after a 60-day retention window (pruneCams),
-- so the catalogue's history can only be reconstructed from these snapshots —
-- not from `cams` directly. `ts` is the PK so a re-run at the same millisecond
-- idempotently overwrites.
CREATE TABLE IF NOT EXISTS cam_count_snapshots (
  ts    INTEGER PRIMARY KEY,
  count INTEGER NOT NULL,
  live  INTEGER NOT NULL DEFAULT 0
);
