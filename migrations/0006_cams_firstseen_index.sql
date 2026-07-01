-- Backs the explorer's "recent" sort, which orders by `first_seen_at DESC, id`
-- (most recently discovered endpoints first). Without this the sort falls back
-- to a full scan + filesort on every page; the descending index lets SQLite walk
-- rows in order and stop at the page boundary.
CREATE INDEX IF NOT EXISTS idx_cams_firstseen ON cams(first_seen_at DESC);
