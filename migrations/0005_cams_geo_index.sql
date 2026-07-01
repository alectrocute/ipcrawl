-- Composite index for the map layer's viewport (bbox) queries. The map's LOD
-- endpoint filters on `lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?` before
-- grid-bucketing; without this index every pan/zoom is a full table scan of the
-- cams table (a real D1 rows-read cost). Leading on `lat` lets SQLite seek the
-- latitude band, then range-filter longitude within it.
CREATE INDEX IF NOT EXISTS idx_cams_geo ON cams(lat, lon);
