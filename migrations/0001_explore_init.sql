-- Explorer (Plan 2) schema. One row per camera endpoint, indexed on every
-- column the /explore grid filters or sorts by so server-side pagination stays
-- fast. Mirrored verbatim in `server/utils/exploreDb.ts` (SCHEMA), which runs
-- the same statements IF NOT EXISTS on first access so a fresh DB self-heals.
--
-- Schema is also bootstrapped at runtime (see server/utils/exploreDb.ts).

CREATE TABLE IF NOT EXISTS cams (
  id              TEXT PRIMARY KEY,          -- shortHash(ip:port), shared with the roulette
  ip              TEXT NOT NULL,
  port            INTEGER NOT NULL,
  country         TEXT,
  city            TEXT,
  org             TEXT,                       -- "ISP"
  module          TEXT,                       -- _shodan.module (http/https/rtsp/vnc/…)
  lat             REAL,
  lon             REAL,
  screenshot_mime TEXT NOT NULL,
  live_path       TEXT,                       -- working snapshot path, or NULL
  live_checked_at INTEGER,                    -- epoch ms of last probe reconcile
  is_live         INTEGER NOT NULL DEFAULT 0, -- 1 when a live snapshot path is confirmed
  first_seen_at   INTEGER NOT NULL,           -- epoch ms
  last_seen_at    INTEGER NOT NULL            -- epoch ms
);

CREATE INDEX IF NOT EXISTS idx_cams_country  ON cams(country);
CREATE INDEX IF NOT EXISTS idx_cams_city     ON cams(city);
CREATE INDEX IF NOT EXISTS idx_cams_org      ON cams(org);
CREATE INDEX IF NOT EXISTS idx_cams_live     ON cams(is_live);
CREATE INDEX IF NOT EXISTS idx_cams_lastseen ON cams(last_seen_at DESC);
