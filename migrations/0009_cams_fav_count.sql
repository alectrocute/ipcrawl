-- Denormalized public favorite tally on `cams`.
--
-- The /explore grid sorts by popularity (`ORDER BY fav_count DESC, ...`). That
-- count used to come from a correlated `(SELECT COUNT(*) FROM cam_favorites
-- WHERE cam_id = cams.id)` subquery evaluated for EVERY row, paired with a
-- `COUNT(*) OVER ()` window — so a single 24-item page scanned the whole `cams`
-- table plus `cam_favorites` per row. It was the #1 D1 rows-read cost (≈57k rows
-- read per page; billions/day under load).
--
-- Folding the tally into a real column lets the sort walk an index and stop at
-- the page boundary. `setFavorite` keeps the column authoritative on each vote
-- (single-cam recompute), and `pruneCams` drops favorites for pruned cams so a
-- reappearing cam starts clean. Mirrored in server/utils/exploreDb.ts
-- (SCHEMA + COLUMN_BACKFILLS + POST_BACKFILL_INDEXES) for dev/self-heal.
--
-- Schema is also bootstrapped at runtime (see server/utils/exploreDb.ts).

ALTER TABLE cams ADD COLUMN fav_count INTEGER NOT NULL DEFAULT 0;

-- One-time backfill from existing votes. (New isolates' COLUMN_BACKFILLS only
-- adds the column at DEFAULT 0; this sets the real tallies for current rows.)
UPDATE cams SET fav_count = (
  SELECT COUNT(*) FROM cam_favorites f WHERE f.cam_id = cams.id
);

-- Default grid sort: ORDER BY fav_count DESC, last_seen_at DESC, id. The
-- descending composite lets SQLite walk rows already ordered and stop at
-- LIMIT/OFFSET instead of scanning + filesorting the whole table.
CREATE INDEX IF NOT EXISTS idx_cams_fav
  ON cams(fav_count DESC, last_seen_at DESC, id);

-- Same sort behind the `source=live` filter (the second-hottest grid shape).
-- Leading on is_live so the live grid seeks the live rows and walks them in
-- popularity order, rather than reading every live row and filesorting.
CREATE INDEX IF NOT EXISTS idx_cams_live_fav
  ON cams(is_live, fav_count DESC, last_seen_at DESC, id);
