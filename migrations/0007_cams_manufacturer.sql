-- Adds the camera manufacturer/brand (derived from Shodan's `product` banner)
-- so the explorer can surface and facet-filter cameras by vendor. Indexed like
-- the other facet columns (country/city/org) so the sidebar GROUP BY and the
-- IN-filter stay fast. Mirrored in `server/utils/exploreDb.ts` (SCHEMA +
-- COLUMN_BACKFILLS), which runs the same statements idempotently on first
-- access so a fresh / unmigrated DB self-heals.
--
-- Apply with: wrangler d1 migrations apply ipcrawl [--remote]

ALTER TABLE cams ADD COLUMN manufacturer TEXT;

CREATE INDEX IF NOT EXISTS idx_cams_manufacturer ON cams(manufacturer);
