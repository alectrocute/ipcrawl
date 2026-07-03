import type { H3Event } from 'h3'

// --- Minimal D1-compatible surface ------------------------------------------
//
// The /explore feature stores one relational row per camera in SQLite. In
// production that's a node:sqlite file on the VPS's SSD. In `npm run dev` it
// defaults to a repo-local dev file (`./.data/explore.sqlite`) — a dev server
// plugin seeds it with dummy data so the catalogue, map and stats all render
// offline.

export interface ExploreStatement {
  bind(...values: unknown[]): ExploreStatement
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>
  run(): Promise<{ success: boolean }>
  all<T = Record<string, unknown>>(): Promise<{ results: T[], success: boolean }>
}

export interface ExploreDb {
  prepare(query: string): ExploreStatement
  batch(statements: ExploreStatement[]): Promise<unknown[]>
}

// Schema lives here as the single source of truth and is mirrored in the
// migrations directory. We additionally run it (IF NOT EXISTS) on first access
// so a fresh dev DB self-heals instead of 500ing the explorer.
const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS cams (
    id              TEXT PRIMARY KEY,
    ip              TEXT NOT NULL,
    port            INTEGER NOT NULL,
    country         TEXT,
    city            TEXT,
    org             TEXT,
    module          TEXT,
    manufacturer    TEXT,
    lat             REAL,
    lon             REAL,
    screenshot_mime TEXT NOT NULL,
    screenshot_hash TEXT,
    live_path       TEXT,
    live_checked_at INTEGER,
    is_live         INTEGER NOT NULL DEFAULT 0,
    fav_count       INTEGER NOT NULL DEFAULT 0,
    first_seen_at   INTEGER NOT NULL,
    last_seen_at    INTEGER NOT NULL
  )`,
  'CREATE INDEX IF NOT EXISTS idx_cams_country  ON cams(country)',
  'CREATE INDEX IF NOT EXISTS idx_cams_city     ON cams(city)',
  'CREATE INDEX IF NOT EXISTS idx_cams_org      ON cams(org)',
  'CREATE INDEX IF NOT EXISTS idx_cams_manufacturer ON cams(manufacturer)',
  'CREATE INDEX IF NOT EXISTS idx_cams_live     ON cams(is_live)',
  'CREATE INDEX IF NOT EXISTS idx_cams_lastseen ON cams(last_seen_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_cams_geo      ON cams(lat, lon, is_live, id)',
  // Powers the public /api/ip existence probe (SELECT 1 ... WHERE ip = ?).
  'CREATE INDEX IF NOT EXISTS idx_cams_ip       ON cams(ip)',
  `CREATE TABLE IF NOT EXISTS cam_refresh_meta (
    id           TEXT PRIMARY KEY,
    refreshed_at TEXT NOT NULL,
    count        INTEGER NOT NULL,
    blocked      INTEGER NOT NULL DEFAULT 0,
    queries_json TEXT NOT NULL,
    errors_json  TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS cam_favorites (
    cam_id     TEXT NOT NULL,
    voter_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (cam_id, voter_hash)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_cam_favorites_voter ON cam_favorites(voter_hash)',
  `CREATE TABLE IF NOT EXISTS cam_count_snapshots (
    ts    INTEGER PRIMARY KEY,
    count INTEGER NOT NULL,
    live  INTEGER NOT NULL DEFAULT 0
  )`
]

const DEFAULT_DB_PATH = './.data/explore.sqlite'

/**
 * Where the SQLite file lives. Overridable via NUXT_SQLITE_PATH so production
 * can point at a persistent data volume (e.g. /srv/ipcrawl/data/explore.sqlite)
 * regardless of the process working directory. Defaults to the repo-local dev path.
 */
function resolveSqlitePath(proc: NodeProcess): string {
  return proc.env?.NUXT_SQLITE_PATH || DEFAULT_DB_PATH
}

// --- node:sqlite backend ----------------------------------------------------

interface NodeSqliteStatement {
  all(...params: unknown[]): Record<string, unknown>[]
  get(...params: unknown[]): Record<string, unknown> | undefined
  run(...params: unknown[]): { changes: number | bigint }
}
interface NodeSqliteDb {
  prepare(sql: string): NodeSqliteStatement
  exec(sql: string): void
}

interface NodeProcess {
  env?: Record<string, string | undefined>
  getBuiltinModule?: (id: string) => unknown
}

class NodeStatement implements ExploreStatement {
  constructor(
    private readonly db: NodeSqliteDb,
    private readonly sql: string,
    private readonly params: unknown[] = []
  ) {}

  bind(...values: unknown[]): ExploreStatement {
    return new NodeStatement(this.db, this.sql, values)
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params)
    if (!row) return null
    return (colName ? (row as Record<string, unknown>)[colName] : row) as T
  }

  async run(): Promise<{ success: boolean }> {
    this.db.prepare(this.sql).run(...this.params)
    return { success: true }
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[], success: boolean }> {
    const results = this.db.prepare(this.sql).all(...this.params) as T[]
    return { results, success: true }
  }
}

class NodeDb implements ExploreDb {
  constructor(private readonly db: NodeSqliteDb) {}

  prepare(query: string): ExploreStatement {
    return new NodeStatement(this.db, query)
  }

  async batch(statements: ExploreStatement[]): Promise<unknown[]> {
    this.db.exec('BEGIN')
    try {
      const out: unknown[] = []
      for (const stmt of statements) out.push(await stmt.run())
      this.db.exec('COMMIT')
      return out
    } catch (err) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        // Ignore rollback failures; the original error is more useful.
      }
      throw err
    }
  }
}

let cachedDb: ExploreDb | null = null

function getNodeProcess(): NodeProcess {
  return (globalThis as { process?: NodeProcess }).process ?? {}
}

function getDb(): ExploreDb {
  if (cachedDb) return cachedDb
  const proc = getNodeProcess()
  if (typeof proc?.getBuiltinModule !== 'function') {
    throw new Error('node:sqlite is unavailable — Node 22.3+ required.')
  }

  const fs = proc.getBuiltinModule('node:fs') as {
    mkdirSync(path: string, opts: { recursive: boolean }): void
  }
  const path = proc.getBuiltinModule('node:path') as {
    dirname(p: string): string
  }
  const sqlite = proc.getBuiltinModule('node:sqlite') as {
    DatabaseSync: new (path: string) => NodeSqliteDb
  }
  const dbPath = resolveSqlitePath(proc)
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new sqlite.DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = NORMAL')
  db.exec('PRAGMA busy_timeout = 5000')
  cachedDb = new NodeDb(db)
  return cachedDb
}

// --- Schema bootstrap -------------------------------------------------------

const COLUMN_BACKFILLS: string[] = [
  'ALTER TABLE cams ADD COLUMN screenshot_hash TEXT',
  'ALTER TABLE cams ADD COLUMN manufacturer TEXT',
  'ALTER TABLE cams ADD COLUMN fav_count INTEGER NOT NULL DEFAULT 0'
]

const POST_BACKFILL_INDEXES: string[] = [
  'CREATE INDEX IF NOT EXISTS idx_cams_fav ON cams(fav_count DESC, last_seen_at DESC, id)',
  'CREATE INDEX IF NOT EXISTS idx_cams_live_fav ON cams(is_live, fav_count DESC, last_seen_at DESC, id)'
]

const schemaReady = new WeakMap<ExploreDb, Promise<void>>()

async function ensureSchema(db: ExploreDb): Promise<void> {
  let ready = schemaReady.get(db)
  if (!ready) {
    ready = (async () => {
      await db.batch(SCHEMA.map(stmt => db.prepare(stmt)))
      for (const stmt of COLUMN_BACKFILLS) {
        try {
          await db.prepare(stmt).run()
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (!/duplicate column/i.test(msg)) throw err
        }
      }
      for (const stmt of POST_BACKFILL_INDEXES) {
        await db.prepare(stmt).run()
      }
    })().catch((err) => {
      schemaReady.delete(db)
      throw err
    })
    schemaReady.set(db, ready)
  }
  await ready
}

/**
 * Get the explore database (node:sqlite), guaranteeing the schema exists.
 * Cheap after the first call.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function getExploreDb(event?: H3Event): Promise<ExploreDb> {
  const db = getDb()
  await ensureSchema(db)
  return db
}
