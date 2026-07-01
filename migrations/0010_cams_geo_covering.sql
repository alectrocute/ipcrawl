-- Upgrade the map viewport index to a COVERING index.
--
-- The /map LOD cluster query aggregates lat/lon/is_live/id for every camera in
-- the bbox (GROUP BY grid cell). With only (lat, lon) indexed, each matching
-- row also cost a table lookup to read is_live/id — roughly doubling rows read,
-- and the second-biggest D1 reader after the grid. Folding is_live + id into
-- the index makes the aggregation index-only (no table reads) and lets the
-- `source=live` map filter resolve in-index too.
--
-- Replaces idx_cams_geo from 0005_cams_geo_index.sql. Mirrored in
-- server/utils/exploreDb.ts (SCHEMA).
--
-- Apply with: wrangler d1 migrations apply ipcrawl [--remote]

DROP INDEX IF EXISTS idx_cams_geo;
CREATE INDEX IF NOT EXISTS idx_cams_geo ON cams(lat, lon, is_live, id);
