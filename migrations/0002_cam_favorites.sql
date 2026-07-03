-- Public favorite tally for /explore cards. One row per (cam, anonymized
-- voter); the composite PK both dedupes repeat votes from the same IP and
-- serves as the covering index for per-cam counts. `voter_hash` is a peppered
-- SHA-256 of the client IP — raw IPs are never stored. Mirrored verbatim in
-- `server/utils/exploreDb.ts` (SCHEMA) for dev/self-heal.
--
-- Schema is also bootstrapped at runtime (see server/utils/exploreDb.ts).

CREATE TABLE IF NOT EXISTS cam_favorites (
  cam_id     TEXT NOT NULL,
  voter_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (cam_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS idx_cam_favorites_voter ON cam_favorites(voter_hash);
