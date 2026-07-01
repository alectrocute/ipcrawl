import type { H3Event } from 'h3'

// --- Minimal D1-compatible surface ------------------------------------------
//
// The /explore feature stores one relational row per camera. In production
// that's a Cloudflare D1 database (SQLite at the edge). In `npm run dev`
// (node-server, no Cloudflare bindings), we default to a LOCAL node:sqlite file
// — `npm run dev` must never reach across to the production D1, and a dev
// server plugin seeds the local file with dummy data so the catalogue, map and
// stats all have something to render offline. Browsing the real remote rows is
// opt-in via `NUXT_DEV_REMOTE_D1=1` (runs queries through `wrangler d1 execute
// --remote`). All three ends are reached through this tiny interface, which is a
// structural subset of the real `D1Database` type — the live binding satisfies
// it directly with zero adapters.

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

// Schema lives here as the single source of truth and is mirrored verbatim in
// `migrations/0001_explore_init.sql` for the canonical `wrangler d1 migrations
// apply` workflow. We additionally run it (IF NOT EXISTS) on first access per
// isolate so a fresh dev DB — or a Worker whose migration hasn't been applied
// yet — self-heals instead of 500ing the explorer.
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
  // Map viewport (bbox) queries seek a latitude band, then range-filter lon.
  // Covering (is_live, id folded in) so the LOD cluster aggregation runs
  // index-only — no per-row table lookup — and the `source=live` map filter
  // resolves in-index. See migrations/0010_cams_geo_covering.sql.
  'CREATE INDEX IF NOT EXISTS idx_cams_geo      ON cams(lat, lon, is_live, id)',
  `CREATE TABLE IF NOT EXISTS cam_refresh_meta (
    id           TEXT PRIMARY KEY,
    refreshed_at TEXT NOT NULL,
    count        INTEGER NOT NULL,
    blocked      INTEGER NOT NULL DEFAULT 0,
    queries_json TEXT NOT NULL,
    errors_json  TEXT NOT NULL
  )`,
  // Public favorite tally. One row per (cam, anonymized voter): the PK is the
  // anti-cheat — re-favoriting from the same IP is an idempotent no-op. The PK
  // is also the covering index for per-cam counts.
  `CREATE TABLE IF NOT EXISTS cam_favorites (
    cam_id     TEXT NOT NULL,
    voter_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (cam_id, voter_hash)
  )`,
  'CREATE INDEX IF NOT EXISTS idx_cam_favorites_voter ON cam_favorites(voter_hash)',
  // One row per refresh, capturing the total catalogue size at that moment.
  // Feeds the 12-month rolling "cameras over time" chart on /stats. `cams`
  // itself hard-deletes after 60d (pruneCams), so this is the only durable
  // history. Mirrored in migrations/0008_cam_count_snapshots.sql.
  `CREATE TABLE IF NOT EXISTS cam_count_snapshots (
    ts    INTEGER PRIMARY KEY,
    count INTEGER NOT NULL,
    live  INTEGER NOT NULL DEFAULT 0
  )`
]

const DEV_DB_PATH = './.data/explore.sqlite'
const DEV_REMOTE_D1_NAME = 'ipcrawl'

interface CloudflareEnv { EXPLORE_DB?: ExploreDb }

/**
 * Resolve the D1 binding from whichever Cloudflare context is in scope.
 *
 * - Request handlers: Nitro's CF preset spreads `_platform` onto
 *   `event.context`, exposing `event.context.cloudflare.env`.
 * - Scheduled tasks / any entrypoint: the module handler also stashes the env
 *   on `globalThis.__env__`, so the cron-driven ingest reaches D1 without an
 *   H3 event.
 *
 * Returns `null` under the plain node-server (dev / `build:node`), where we use
 * the SQLite fallback instead.
 */
function resolveBinding(event?: H3Event): ExploreDb | null {
  const ctx = event?.context as {
    cloudflare?: { env?: CloudflareEnv }
    _platform?: { cloudflare?: { env?: CloudflareEnv } }
  } | undefined
  const env: CloudflareEnv | undefined
    = ctx?.cloudflare?.env
      ?? ctx?._platform?.cloudflare?.env
      ?? (globalThis as { __env__?: CloudflareEnv }).__env__
  return env?.EXPLORE_DB ?? null
}

// --- node-server dev backends -----------------------------------------------
// Loaded via `process.getBuiltinModule` (Node 22.3+) rather than a static
// import so the Cloudflare/rollup bundle never tries to resolve Node builtins,
// which don't exist in Workers. These branches only run under node-server.

interface NodeSqliteStatement {
  all(...params: unknown[]): Record<string, unknown>[]
  get(...params: unknown[]): Record<string, unknown> | undefined
  run(...params: unknown[]): { changes: number | bigint }
}
interface NodeSqliteDb {
  prepare(sql: string): NodeSqliteStatement
  exec(sql: string): void
}

type ExecFile = (
  file: string,
  args: string[],
  opts: { timeout: number, maxBuffer: number },
  cb: (err: Error | null, stdout: string, stderr: string) => void
) => void

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

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cannot bind non-finite number to D1: ${value}`)
    return String(value)
  }
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${String(value).replaceAll('\'', '\'\'')}'`
}

function bindSql(sql: string, params: unknown[]): string {
  let i = 0
  const bound = sql.replaceAll('?', () => {
    if (i >= params.length) throw new Error('Missing SQL bind parameter.')
    return sqlLiteral(params[i++])
  })
  if (i !== params.length) throw new Error('Too many SQL bind parameters.')
  return bound
}

interface WranglerD1Result {
  results?: Record<string, unknown>[]
  success?: boolean
}

class RemoteD1Statement implements ExploreStatement {
  constructor(
    private readonly dbName: string,
    private readonly execFile: ExecFile,
    private readonly sql: string,
    private readonly params: unknown[] = []
  ) {}

  bind(...values: unknown[]): ExploreStatement {
    return new RemoteD1Statement(this.dbName, this.execFile, this.sql, values)
  }

  private async execute(): Promise<WranglerD1Result> {
    const command = bindSql(this.sql, this.params)
    const stdout = await new Promise<string>((resolve, reject) => {
      this.execFile(
        'npx',
        ['wrangler', 'd1', 'execute', this.dbName, '--remote', '--json', '--command', command],
        { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 },
        (err, out, stderr) => {
          if (err) {
            const msg = stderr.trim() || out.trim() || err.message
            reject(new Error(`Remote D1 query failed: ${msg}`))
          } else {
            resolve(out)
          }
        }
      )
    })

    const parsed = JSON.parse(stdout) as WranglerD1Result[] | WranglerD1Result
    const result = Array.isArray(parsed) ? parsed[0] : parsed
    if (!result?.success) throw new Error('Remote D1 query did not succeed.')
    return result
  }

  async first<T = Record<string, unknown>>(colName?: string): Promise<T | null> {
    const rows = (await this.execute()).results ?? []
    const row = rows[0]
    if (!row) return null
    return (colName ? row[colName] : row) as T
  }

  async run(): Promise<{ success: boolean }> {
    await this.execute()
    return { success: true }
  }

  async all<T = Record<string, unknown>>(): Promise<{ results: T[], success: boolean }> {
    const result = await this.execute()
    return { results: (result.results ?? []) as T[], success: true }
  }
}

class RemoteD1Db implements ExploreDb {
  constructor(
    private readonly dbName: string,
    private readonly execFile: ExecFile
  ) {}

  prepare(query: string): ExploreStatement {
    return new RemoteD1Statement(this.dbName, this.execFile, query)
  }

  async batch(statements: ExploreStatement[]): Promise<unknown[]> {
    const out: unknown[] = []
    for (const stmt of statements) out.push(await stmt.run())
    return out
  }
}

class NodeDb implements ExploreDb {
  constructor(private readonly db: NodeSqliteDb) {}

  prepare(query: string): ExploreStatement {
    return new NodeStatement(this.db, query)
  }

  // node:sqlite is synchronous; emulate D1's atomic batch with a transaction.
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

let devDb: ExploreDb | null = null

function getNodeProcess(): NodeProcess {
  return (globalThis as { process?: NodeProcess }).process ?? {}
}

function isTruthyFlag(value: string | undefined): boolean {
  return value === '1' || value === 'true'
}

function shouldUseLocalDevDb(proc: NodeProcess): boolean {
  return isTruthyFlag(proc.env?.NUXT_DEV_LOCAL_D1)
}

function shouldUseRemoteDevDb(proc: NodeProcess): boolean {
  return isTruthyFlag(proc.env?.NUXT_DEV_REMOTE_D1)
}

function tryGetRemoteDevDb(proc: NodeProcess): ExploreDb | null {
  // Default to local: `npm run dev` must not run queries against the production
  // D1. Talking to the real remote rows is an explicit opt-in (NUXT_DEV_REMOTE_D1);
  // the legacy NUXT_DEV_LOCAL_D1 force-local flag still wins if both are set.
  if (shouldUseLocalDevDb(proc)) return null
  if (!shouldUseRemoteDevDb(proc)) return null
  const execFile = proc.getBuiltinModule?.('node:child_process') as { execFile?: ExecFile } | undefined
  if (!execFile?.execFile) return null
  const dbName = proc.env?.NUXT_DEV_D1_DATABASE || DEV_REMOTE_D1_NAME
  return new RemoteD1Db(dbName, execFile.execFile)
}

function getDevDb(): ExploreDb {
  if (devDb) return devDb
  const proc = getNodeProcess()
  if (typeof proc?.getBuiltinModule !== 'function') {
    throw new Error('No EXPLORE_DB binding and node:sqlite is unavailable.')
  }
  const remote = tryGetRemoteDevDb(proc)
  if (remote) {
    devDb = remote
    return devDb
  }

  const fs = proc.getBuiltinModule('node:fs') as {
    mkdirSync(path: string, opts: { recursive: boolean }): void
  }
  const sqlite = proc.getBuiltinModule('node:sqlite') as {
    DatabaseSync: new (path: string) => NodeSqliteDb
  }
  fs.mkdirSync('./.data', { recursive: true })
  devDb = new NodeDb(new sqlite.DatabaseSync(DEV_DB_PATH))
  return devDb
}

// --- Schema bootstrap -------------------------------------------------------

// Column additions to pre-existing tables. CREATE TABLE IF NOT EXISTS only
// covers fresh databases; a table created before the column was introduced
// needs the ALTER. Each runs individually (outside the batch) with
// "duplicate column" errors swallowed, so it's idempotent like the rest of
// the bootstrap. Mirrored in the canonical migrations dir.
const COLUMN_BACKFILLS: string[] = [
  'ALTER TABLE cams ADD COLUMN screenshot_hash TEXT',
  'ALTER TABLE cams ADD COLUMN manufacturer TEXT',
  // Denormalized favorite tally — see migrations/0009_cams_fav_count.sql. The
  // ALTER only seeds DEFAULT 0; the migration backfills real counts in prod and
  // setFavorite keeps it current thereafter.
  'ALTER TABLE cams ADD COLUMN fav_count INTEGER NOT NULL DEFAULT 0'
]

// Indexes whose columns are added by COLUMN_BACKFILLS. They MUST be created
// after the backfill runs: on a table that predates the column (added by ALTER,
// not CREATE TABLE) an index in the main SCHEMA batch would reference a column
// that doesn't exist yet and wedge bootstrap. IF NOT EXISTS keeps them
// idempotent across isolates. Mirrored in migrations/0009_cams_fav_count.sql.
const POST_BACKFILL_INDEXES: string[] = [
  // Default grid sort: ORDER BY fav_count DESC, last_seen_at DESC, id.
  'CREATE INDEX IF NOT EXISTS idx_cams_fav ON cams(fav_count DESC, last_seen_at DESC, id)',
  // Same sort behind the `source=live` filter — leads on is_live so the live
  // grid walks the index in popularity order instead of filesorting every
  // live row.
  'CREATE INDEX IF NOT EXISTS idx_cams_live_fav ON cams(is_live, fav_count DESC, last_seen_at DESC, id)'
]

const schemaReady = new WeakMap<ExploreDb, Promise<void>>()

async function ensureSchema(db: ExploreDb): Promise<void> {
  let ready = schemaReady.get(db)
  if (!ready) {
    // One round trip instead of nine: D1's `batch` runs the whole DDL set as a
    // single transaction, so a cold isolate's first query no longer pays a
    // serial CREATE-per-statement tax before it can read. Drop the memo on
    // failure so a transient error doesn't permanently wedge bootstrap for
    // this handle (the old per-statement loop cached failures too).
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
      // After the columns above exist (fresh CREATE TABLE or the ALTERs).
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
 * Get the explore database (D1 in prod, node:sqlite in dev), guaranteeing the
 * schema exists. Cheap after the first call per isolate.
 */
export async function getExploreDb(event?: H3Event): Promise<ExploreDb> {
  const db = resolveBinding(event) ?? getDevDb()
  await ensureSchema(db)
  return db
}
