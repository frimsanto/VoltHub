# VoltReport — Staging & Production Deployment Guide

> Operational runbook for deploying the VoltReport backend (Express + Prisma + MySQL)
> and frontend (React/Vite PWA) across **Development**, **Staging**, and **Production**.
> Pairs with [`ENVIRONMENTS.md`](./ENVIRONMENTS.md) (env-separation policy),
> [`BACKUP.md`](./BACKUP.md), and [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md).

---

## 0. Environment matrix

| | Development | Staging | Production |
|---|---|---|---|
| Host | local dev machine | `staging.voltreport.pln.co.id` | `voltreport.pln.co.id` |
| `NODE_ENV` | `development` | `production` | `production` |
| Database | local MySQL | `voltreport_staging` (own host) | `voltreport` (prod host) |
| BE env file | `BE/.env.example` | `BE/.env.staging.example` | `BE/.env.production.example` |
| FE env file | `FE/.env.example` | `FE/.env.staging.example` | `FE/.env.production.example` |
| Sentry env | off / `development` | `staging` | `production` |
| Trace sample | 0 | 0.2 | 0.1 |
| Backups | optional | nightly | nightly + off-site |
| Purpose | dev iteration | UAT, smoke, release rehearsal | live PLN operations |

**Golden rule:** Staging is a *production rehearsal*. It runs the exact same build
artifact and the same `NODE_ENV=production` code path as production — only the
DB, secrets, CORS origin, and Sentry environment differ. Never point staging at
the production database.

---

## 1. Server requirements

### 1.1 Backend application server (staging == production spec)
| Resource | Minimum (staging) | Recommended (production) |
|---|---|---|
| vCPU | 2 | 4 |
| RAM | 2 GB | 4–8 GB |
| Disk | 20 GB SSD | 50 GB+ SSD (uploads grow over time) |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Node.js | 20 LTS | 20 LTS |
| Process manager | pm2 or systemd | pm2 or systemd (with auto-restart) |
| Reverse proxy | Nginx (TLS termination) | Nginx (TLS termination) |

### 1.2 Database server
| Resource | Minimum | Recommended (production) |
|---|---|---|
| Engine | MySQL 8.0 | MySQL 8.0 |
| vCPU / RAM | 2 / 4 GB | 4 / 8 GB |
| Disk | 20 GB SSD | 100 GB+ SSD, with daily snapshot |
| User | least-privilege app user (no `GRANT`/`SUPER`) | same; separate read-only user for reporting |

> Production should run MySQL on a **separate host** from the app server so a
> compromised app process cannot read raw DB files, and so DB and app scale
> independently.

### 1.3 Recommended topology (production)

```
        Internet (HTTPS)
              │
        ┌─────▼─────┐
        │   Nginx   │  TLS, gzip, static FE (dist/), /uploads cache, reverse-proxy /api
        └─────┬─────┘
              │ proxy_pass http://127.0.0.1:3001
        ┌─────▼─────┐
        │  Node BE  │  pm2/systemd, NODE_ENV=production
        │ (Express) │  uploads/ on persistent volume
        └─────┬─────┘
              │ mysql://…@db-prod.internal:3306
        ┌─────▼─────┐
        │   MySQL   │  separate host, nightly backups → off-site
        └───────────┘
```

---

## 2. Environment variables

All variables are documented in the committed `*.example` templates. Real
`.env*` files are **gitignored** — never commit secrets. Prefer injecting via the
deploy pipeline / secret manager over a file on disk.

### 2.1 Backend (required) — see [`BE/.env.production.example`](../BE/.env.production.example)
| Variable | Purpose | Notes |
|---|---|---|
| `NODE_ENV` | `production` on staging & prod | Gates `validateProductionEnv()` |
| `PORT` | listen port (default 3001) | proxied by Nginx |
| `DATABASE_URL` | MySQL DSN | least-privilege user |
| `JWT_SECRET` | access-token signing | ≥ 32 chars, `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | refresh-token signing | ≥ 32 chars, **must differ** from `JWT_SECRET` |
| `JWT_EXPIRES_IN` | access TTL | prod `1d`, staging `7d` |
| `JWT_REFRESH_EXPIRES_IN` | refresh TTL | `30d` |
| `CORS_ORIGIN` | exact FE origin | must **not** be `*` |
| `MAX_FILE_SIZE` / `MAX_FILES_PER_UPLOAD` | upload guards | 25 MB / 20 files |
| `UPLOAD_DIR` | uploads path | persistent volume |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | throttling | tune to traffic |
| `APP_MIN_VERSION` / `APP_LATEST_VERSION` | force-update gate | bump to lock out old native clients |
| `FCM_SERVER_KEY` | push (FCM) | empty = push disabled (safe) |
| `SENTRY_DSN` / `SENTRY_ENVIRONMENT` / `SENTRY_TRACES_SAMPLE_RATE` | observability | per-env DSN |
| `BACKUP_ROOT` / `RETAIN_DAILY` / `RETAIN_WEEKLY` / `RETAIN_MONTHLY` | backup retention | read by `scripts/backup.sh` |

> **Boot guard:** in production the server runs `validateProductionEnv()` and
> **refuses to start** on weak/identical JWT secrets, missing `DATABASE_URL`, or
> `CORS_ORIGIN=*` ([`BE/src/config/env.ts`](../BE/src/config/env.ts)).

### 2.2 Frontend (build-time `VITE_*`) — see [`FE/.env.production.example`](../FE/.env.production.example)
| Variable | Purpose |
|---|---|
| `VITE_API_URL` | backend API base, e.g. `https://voltreport.pln.co.id/api` |
| `VITE_API_TIMEOUT` | request timeout ms |
| `VITE_SENTRY_DSN` / `VITE_SENTRY_RELEASE` | FE error tracking |

> `VITE_*` are **public** (shipped to the browser) — never put secrets there.
> They are read at **build time**, so a config change requires a rebuild + redeploy
> of `dist/`.

### 2.3 Secrets management
- Generate secrets with `openssl rand -base64 48`; store in the org secret manager (Vault / cloud secret store / CI secrets), not in the repo.
- Rotate JWT secrets on suspected compromise — note this invalidates all sessions (forces re-login), which is the intended effect, now backed by the [refresh-token revocation](#) store (see `REFRESH_TOKEN.md` if present / Phase G4).
- Keep **separate** secrets per environment so a staging leak cannot touch production tokens.

---

## 3. Prisma migrations

Migrations live in [`BE/prisma/migrations/`](../BE/prisma/migrations/) and are the
**single source of truth** for schema. Never hand-edit the production schema.

| Command | When |
|---|---|
| `npx prisma migrate dev` | **development only** — creates new migrations |
| `npx prisma migrate deploy` | **staging & production** — applies pending migrations, no prompts, no drift-reset |
| `npx prisma migrate status` | pre-deploy check: confirms DB is up to date |
| `npx prisma generate` | regenerate client after `npm ci` (also part of build) |

**Deploy procedure (staging/prod):**
```bash
cd BE
npx prisma migrate status      # 1. inspect pending migrations
# (DB backup happens here — see step 4 of the deployment steps)
npx prisma migrate deploy      # 2. apply forward-only
```
- `migrate deploy` is **forward-only and non-destructive** — it never drops or
  resets. If a migration would lose data, review it on staging first.
- The repo has a `migration_lock.toml` pinning the provider to `mysql`.

---

## 4. Build process

### 4.1 Backend
```bash
cd BE
npm ci                 # clean, lockfile-exact install
npx prisma generate    # generate Prisma client
npm run typecheck      # tsc --noEmit (gate)
npm run test           # vitest (gate) — 105 tests
npm run build          # tsc → dist/
NODE_ENV=production npm start   # node dist/index.js
```

### 4.2 Frontend
```bash
cd FE
npm ci
npm run typecheck      # gate
npm run build          # vite build → dist/  (reads VITE_* at build time)
# deploy dist/ behind Nginx (or any static host / CDN)
```

> CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) already runs
> lint + typecheck + test (BE) and typecheck + build (FE) on every push to
> `main`/`master`/`develop`. Treat a green CI run as the gate before promoting an
> artifact to staging, and the **same artifact** from staging to production.

---

## 5. Upload storage

- Uploads are written to `UPLOAD_DIR` (default `uploads/`), with subdirs
  `laporan-awal/`, `laporan-akhir/`, `temp/` auto-created on boot
  ([`BE/src/index.ts`](../BE/src/index.ts)).
- Served read-only at `/uploads` with `Content-Disposition: attachment` +
  `X-Content-Type-Options: nosniff` (no inline render/execute — stored-XSS defence).
- **Production:** mount `UPLOAD_DIR` on a **persistent, backed-up volume**
  separate from the app deploy directory, so a redeploy (or container replace)
  never wipes uploaded photos. Include uploads in backups (`backup.sh --with-uploads`).
- Size guards: 25 MB/file, 20 files/upload, MIME/extension validation
  ([`BE/src/utils/uploadSecurity.ts`](../BE/src/utils/uploadSecurity.ts)).

---

## 6. Database connection

- One DSN per environment via `DATABASE_URL`. Staging and production point at
  **different DB hosts**.
- Use a **least-privilege** MySQL user: `SELECT, INSERT, UPDATE, DELETE` on the
  app schema only — no `DROP`/`GRANT`/`SUPER`. Schema changes are applied by
  `migrate deploy`, which only needs DDL on its own schema (run as a migration
  user during deploy if you separate roles).
- Connection pooling is handled by Prisma; tune `connection_limit` in the DSN
  query string for production load if needed.

---

## 7. Backup integration

Backups are wired via [`BE/scripts/backup.sh`](../BE/scripts/backup.sh) (tiered
daily/weekly/monthly `mysqldump`) and restored via
[`BE/scripts/restore.sh`](../BE/scripts/restore.sh). Full procedures:
[`BACKUP.md`](./BACKUP.md) and [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md).

**Production cron (nightly 02:00, with uploads):**
```cron
0 2 * * *  /opt/voltreport/BE/scripts/backup.sh --with-uploads >> /var/log/voltreport-backup.log 2>&1
```
- Reads `DATABASE_URL` / `DB_*` and `BACKUP_ROOT` from `BE/.env`.
- Point `BACKUP_ROOT` at an off-server / replicated volume; sync the latest
  daily to off-site storage for production.
- **Test restores monthly** on staging — an untested backup is not a backup.

---

## 8. Deployment steps (staging & production)

```bash
# ── 0. Pre-flight (local / CI) ────────────────────────────────────────────────
#   green CI: lint · typecheck · test (BE) + typecheck · build (FE)

# ── 1. Prepare the host (first time only) ─────────────────────────────────────
#   install Node 20, MySQL 8, Nginx; create app user; create uploads volume

# ── 2. Pull the release artifact ──────────────────────────────────────────────
cd /opt/voltreport && git fetch && git checkout <release-tag>

# ── 3. Configure env ──────────────────────────────────────────────────────────
cp BE/.env.production.example BE/.env   # then fill <…> (or inject from secret mgr)
cp FE/.env.production.example FE/.env

# ── 4. BACK UP THE DATABASE (before any migration) ────────────────────────────
./BE/scripts/backup.sh --with-uploads

# ── 5. Backend: install, migrate, build, (re)start ────────────────────────────
cd BE
npm ci && npx prisma generate
npx prisma migrate status        # review pending
npx prisma migrate deploy        # apply forward-only
npm run build
pm2 reload voltreport-api        # zero-downtime reload (or: systemctl restart)

# ── 6. Frontend: build & publish ──────────────────────────────────────────────
cd ../FE
npm ci && npm run build
rsync -a --delete dist/ /var/www/voltreport/   # Nginx docroot

# ── 7. Reload proxy ───────────────────────────────────────────────────────────
sudo nginx -t && sudo systemctl reload nginx

# ── 8. Smoke test (section 10) ────────────────────────────────────────────────
```

Promote the **same commit/tag** staging validated — do not rebuild differently
for production.

---

## 9. Rollback steps

Rollback has two independent axes: **application** and **database**.

### 9.1 Application rollback (fast, safe)
```bash
cd /opt/voltreport
git checkout <previous-release-tag>
cd BE && npm ci && npx prisma generate && npm run build && pm2 reload voltreport-api
cd ../FE && npm ci && npm run build && rsync -a --delete dist/ /var/www/voltreport/
sudo systemctl reload nginx
```
If the new code is incompatible with an **already-applied** migration, you must
also roll the DB back (9.2) or hot-fix forward.

### 9.2 Database rollback
Prisma migrations are forward-only; there is no `migrate down`. To revert schema:
1. **Preferred:** restore from the pre-deploy backup taken in step 4:
   ```bash
   ./BE/scripts/restore.sh /var/backups/voltreport/daily/<timestamp>.sql.gz
   ```
   (full procedure in [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md))
2. **Or** write a new forward migration that undoes the change (preferred when
   data written after deploy must be kept).

### 9.3 Decision guide
| Situation | Action |
|---|---|
| Bad app build, schema unchanged | App rollback (9.1) only |
| Bad migration, no new data yet | Restore pre-deploy backup (9.2.1) + app rollback |
| Bad migration, new data written | Forward fix migration (9.2.2) — avoid data loss |
| Total outage | Follow [`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md) |

> Always keep the **pre-deploy backup** until the release has soaked for ≥ 24h.

---

## 10. Smoke testing

Run after every deploy (staging & production). Minimal critical-path check —
the full UAT script is [`UAT_CHECKLIST.md`](./UAT_CHECKLIST.md).

| # | Check | Expected |
|---|---|---|
| 1 | `GET /health` | `200`, `{ status: "OK" }` |
| 2 | `GET /api/...` without token | `401` (auth enforced) |
| 3 | Login as PETUGAS | `200`, returns access + refresh tokens |
| 4 | Token refresh (`POST /api/auth/refresh`) | `200`, new access token |
| 5 | Create Laporan Awal + upload a photo | persisted; file served at `/uploads/...` as attachment |
| 6 | Validator approve/reject | status transitions; owner notified (if FCM on) |
| 7 | Admin rekap + export | XLSX downloads |
| 8 | CORS from FE origin | allowed; other origins blocked |
| 9 | Wrong CORS / `*` in prod | server refused to boot (config guard) |
| 10 | Sentry test event | appears under the correct environment |

```bash
# quick health probe
curl -fsS https://staging.voltreport.pln.co.id/health | jq .
```

---

## 11. Audit findings — missing / recommended configuration

### ✅ Present and verified
- Three documented environments with separate `.env.*.example` templates (BE + FE).
- Production boot guard `validateProductionEnv()` (weak/identical JWT secrets, missing DB, `CORS_ORIGIN=*`).
- Helmet, CORS allow-list, rate limiting (global + auth), login lockout, hardened static `/uploads`.
- Prisma migrations (forward-only `migrate deploy` path), `migration_lock.toml`.
- Backup + restore scripts with tiered retention; backup/DR runbooks.
- CI pipeline (lint · typecheck · test · build) + E2E workflow.
- Sentry integration (per-env DSN, trace sampling).
- Health endpoint (`/health`).

### ⚠️ Gaps to close before go-live (config / infra, not code)
| Gap | Recommendation | Owner |
|---|---|---|
| No `android/` project committed | Run `npm run android:add` and commit; see [`ANDROID_RELEASE.md`](./ANDROID_RELEASE.md) | Mobile |
| No process-manager unit committed | Add a `pm2 ecosystem.config.js` or `systemd` unit with auto-restart + log rotation | DevOps |
| No Nginx config committed | Add a reference `nginx.conf` (TLS, gzip, `/api` proxy, `/uploads` cache, SPA fallback) | DevOps |
| No DB-side automated snapshot | Enable managed-MySQL daily snapshot in addition to `backup.sh` | DBA |
| Off-site backup sync not automated | Add a post-backup `rsync`/object-storage push for production | DevOps |
| `FCM_SERVER_KEY` (legacy) | Plan migration to FCM HTTP v1 (OAuth) — legacy key API is deprecated; see [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md) | Backend |
| Uptime / health monitoring | Add an external uptime check hitting `/health` + alerting | DevOps |
| Secret manager | Move from `.env` files to Vault / cloud secret store for prod | Security |

### Recommended server (production, single-region internal PLN)
- **App:** 1× Ubuntu 22.04, 4 vCPU / 8 GB RAM / 50 GB SSD, Node 20, pm2, Nginx (TLS).
- **DB:** 1× MySQL 8.0, 4 vCPU / 8 GB RAM / 100 GB SSD, daily managed snapshot + `backup.sh`.
- **Uploads:** persistent 50 GB+ volume mounted at `UPLOAD_DIR`, included in backups.
- **Staging:** half-size mirror (2 vCPU / 4 GB) of the same topology.
- Place both behind the PLN internal network / VPN; expose only Nginx :443.
```
