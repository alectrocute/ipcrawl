-- Index on `cams.ip` for the public /api/ip endpoint.
--
-- That endpoint does `SELECT 1 FROM cams WHERE ip = ?` per request to answer
-- "is this visitor's IP in the catalogue?" Without an index it's a full table
-- scan on every hit — fine for the dev seed (120 rows) but brutal on the prod
-- catalogue under any real load. Mirrored in server/utils/exploreDb.ts (SCHEMA)
-- so a fresh / unmigrated DB self-heals on first access.
--
-- Schema is also bootstrapped at runtime (see server/utils/exploreDb.ts).

CREATE INDEX IF NOT EXISTS idx_cams_ip ON cams(ip);
