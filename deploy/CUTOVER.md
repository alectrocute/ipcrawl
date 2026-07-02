# ipcrawl: Cloudflare → VPS cutover runbook

Moves ipcrawl off Cloudflare Workers/D1/R2/KV onto a single Ubuntu 24.04 VPS
running Nitro under systemd + nginx, still proxied behind the **free** Cloudflare
CDN (orange-cloud DNS only — no Workers). Fixed monthly cost = the VPS.

```
Browser → Cloudflare free CDN (proxy + cache + WAF) → nginx (TLS, real-IP) → Nitro :3000 → SQLite + SSD
```

## What maps to what

| Was (Cloudflare) | Now (VPS) |
| --- | --- |
| Worker (`cloudflare_module`) | Nitro `node-server` under systemd (`ipcrawl.service`) |
| D1 `ipcrawl` | `node:sqlite` file at `NUXT_SQLITE_PATH` (WAL) |
| R2 `stumbletv-screenshots` | `NUXT_DATA_DIR/screenshots` on SSD (unstorage `fs`) |
| KV `CAMS_KV` | `NUXT_DATA_DIR/cams` on SSD (unstorage `fs`) |
| Rate-limit bindings (6) | in-process sliding window (same budgets) |
| `caches.default` edge cache | Cloudflare Cache Rule on `/api/*` images |
| Cron `0 0 * * *` | Nitro `scheduledTasks` in the long-lived process |
| Worker custom domains | proxied A records → VPS IPv4 |
| `wrangler secret` / `vars` | `/srv/ipcrawl/env` (systemd `EnvironmentFile`) |

## Prerequisites

- A VPS: Ubuntu 24.04, a dedicated IPv4, root SSH. (2 vCPU / 4 GB / 40 GB+ SSD is
  comfortable; the daily refresh is the only heavy moment.)
- Local tooling: `pnpm`, `wrangler` (logged in), `rclone` with an R2 remote
  configured (`rclone config`; type `s3`, provider `Cloudflare`, using an R2 S3
  API token). Default remote name is `r2` (override with `R2_REMOTE`).
- A Cloudflare **Origin CA certificate** for `ipcrawl.com` +
  `ismycameraexposed.com` (dashboard → SSL/TLS → Origin Server).

## Steps

### 1. Provision the box
```bash
scp -r deploy root@YOUR_VPS:/root/ipcrawl-deploy
ssh root@YOUR_VPS 'bash /root/ipcrawl-deploy/setup-vps.sh'
```
Installs Node 22, nginx, sqlite3, rclone; creates the `ipcrawl` user and
`/srv/ipcrawl/{app,data,backups}`; locks ufw to SSH + Cloudflare-only 80/443;
generates `/etc/nginx/cloudflare-realip.conf`; installs the systemd unit, nginx
site, and nightly backup timer.

### 2. Env + origin cert on the VPS
```bash
# Fill in secrets locally from the template, then upload:
scp deploy/env.example root@YOUR_VPS:/srv/ipcrawl/env   # then edit on the box
ssh root@YOUR_VPS 'chmod 600 /srv/ipcrawl/env && chown ipcrawl:ipcrawl /srv/ipcrawl/env'

# Upload the Cloudflare origin cert + key:
scp origin.pem root@YOUR_VPS:/etc/ssl/cloudflare/ipcrawl-origin.pem
scp origin.key root@YOUR_VPS:/etc/ssl/cloudflare/ipcrawl-origin.key
ssh root@YOUR_VPS 'nginx -t && systemctl enable --now nginx'
```

### 3. Freeze production writes
Stops favorites/live-frame writes from landing in D1/R2 after the export:
```bash
VPS_SSH=root@YOUR_VPS ./deploy/migrate-data.sh --freeze
```
Viewers now get the friendly `/offline-for-now` page. Keep this window short.

### 4. Migrate the data
```bash
VPS_SSH=root@YOUR_VPS ./deploy/migrate-data.sh   # d1 + r2 + kv + verify
```
- D1 → `sqlite3` import into `/srv/ipcrawl/data/explore.sqlite`
- R2 → `rclone` sync → rsync to `/srv/ipcrawl/data/screenshots`
- KV `refresh:runs` → `/srv/ipcrawl/data/cams/refresh/runs`
- `verify` prints D1-vs-VPS row counts per table + screenshot count. Expect
  exact matches on the tables (a few fewer screenshot files than `cams` rows is
  normal — not every cam has a stored still).

### 5. Deploy the app + start it
```bash
VPS_SSH=root@YOUR_VPS ./deploy/deploy.sh
```
Builds `node-server`, rsyncs `.output/` to `/srv/ipcrawl/app`, restarts
`ipcrawl.service`, and health-checks `http://127.0.0.1:3000/api/status`.

### 6. Smoke-test the origin (before touching DNS)
Hit the VPS directly, bypassing Cloudflare, using a Host override:
```bash
curl -k --resolve ipcrawl.com:443:YOUR_VPS_IP https://ipcrawl.com/api/status
curl -k --resolve ipcrawl.com:443:YOUR_VPS_IP https://ipcrawl.com/ -I
```
Confirm `/api/status` shows the migrated `runs` history and a non-zero `count`.

### 7. Flip DNS + Cloudflare settings
1. **Remove the Worker routes/custom domains** (`wrangler.jsonc` `routes`):
   dashboard → the Worker → Settings → Domains & Routes → remove
   `ipcrawl.com`, `ismycameraexposed.com`, `www.ismycameraexposed.com`.
2. **Add proxied A records** (orange cloud) for all three hostnames →
   `YOUR_VPS_IP`.
3. **SSL/TLS mode → Full (strict)** (matches the Origin CA cert).
4. **Cache Rule** (free plan) to replace the old `caches.default` shield:
   - If URI path matches `/api/explore/thumb/*` **or** `/api/live/*`
   - Then: *Eligible for cache*, *Respect origin* cache-control/TTL.
   (Both endpoints already emit long `cache-control` + `ETag`, so Cloudflare
   will fan out viewer traffic to one origin read per image/window.)

### 8. Verify live, then unfreeze is automatic
Because DNS now points at the VPS (where `NUXT_OFFLINE_FOR_NOW=false` in
`/srv/ipcrawl/env`), the site is live as soon as it resolves — the frozen
Worker no longer receives traffic. Check:
```bash
curl -sI https://ipcrawl.com/api/explore/thumb/SOME_ID   # expect cf-cache-status
curl -s  https://ipcrawl.com/api/status | jq .count       # non-zero
```
- Grid loads with thumbnails; second load shows `cf-cache-status: HIT`.
- A live cam probe returns a frame (Node `fetch` path; no `cloudflare:sockets`).
- Favoriting works and persists.
- Rate limiting bites: `for i in $(seq 1 40); do curl -s -o /dev/null -w '%{http_code}\n' https://ipcrawl.com/api/explore/facets/search?q=x; done` should start returning `429`.
- `ismycameraexposed.com` root redirects to `/imce`.

## Post-cutover

- **Backups are now yours.** `ipcrawl-backup.timer` snapshots
  `/srv/ipcrawl/data` nightly to `/srv/ipcrawl/backups`. Add an off-box copy
  (rclone the tarball to R2/B2/elsewhere) for real durability.
- **Logs:** `journalctl -u ipcrawl -f`.
- **Redeploys:** just `./deploy/deploy.sh` again.
- **Daily refresh:** runs in-process at 00:00 UTC. Confirm the next day via
  `/api/status` (`refreshedAt` advances, a new `runs` entry appears).
- **Decommission (optional, later):** once stable for a few days, you can delete
  the Worker, D1 database, R2 bucket, and KV namespace in the Cloudflare
  dashboard. Keep them until you're confident — they're cheap while idle.

## Rollback

DNS is the switch. If something's wrong after step 7, re-add the Worker custom
domains (or point DNS back) and redeploy the Worker without the freeze var:
`npm run cf:deploy`. Data written on the VPS during the window would need manual
reconciliation, so decide before re-enabling writes on either side.
