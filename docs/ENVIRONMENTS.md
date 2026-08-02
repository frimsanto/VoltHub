# VoltReport — Environment Separation

Three isolated environments. Each has its **own** database, secrets, CORS origin,
and Sentry environment so they never interfere.

| | Development | Staging | Production |
|---|---|---|---|
| `NODE_ENV` | `development` | `production` | `production` |
| Database | local MySQL | `voltreport_staging` (separate host) | `voltreport` (prod host) |
| JWT secrets | dev defaults OK | strong, distinct | strong, distinct (boot-enforced) |
| CORS origin | `http://localhost:5173` | `https://staging.voltreport.pln.co.id` | `https://voltreport.pln.co.id` |
| Sentry env | `development` (usually off) | `staging` | `production` |
| Trace sample | 0 | 0.2 | 0.1 |
| Backups | optional | nightly | nightly + off-site |

## Template files
| Scope | Dev | Staging | Production |
|-------|-----|---------|------------|
| Backend | [`BE/.env.example`](../BE/.env.example) | [`BE/.env.staging.example`](../BE/.env.staging.example) | [`BE/.env.production.example`](../BE/.env.production.example) |
| Frontend | [`FE/.env.example`](../FE/.env.example) | [`FE/.env.staging.example`](../FE/.env.staging.example) | [`FE/.env.production.example`](../FE/.env.production.example) |

## How to use
1. Copy the right template to `.env` on the target host (or inject via the
   deploy pipeline / secret manager — preferred for staging & production):
   ```bash
   cp BE/.env.production.example BE/.env   # then fill in <…> values
   cp FE/.env.production.example FE/.env
   ```
2. Generate strong backend secrets:
   ```bash
   openssl rand -base64 48   # JWT_SECRET
   openssl rand -base64 48   # JWT_REFRESH_SECRET (must differ)
   ```
3. Build/run:
   ```bash
   # Backend
   cd BE && npm ci && npm run build && npm start
   # Frontend (VITE_* are read at build time)
   cd FE && npm ci && npm run build     # deploy dist/
   ```

## Guard rails
- Real `.env*` files are **gitignored**; only `*.example` templates are committed.
- Production boot runs `validateProductionEnv()` and refuses to start on weak
  JWT secrets, identical secrets, missing `DATABASE_URL`, or `CORS_ORIGIN=*`.
- Frontend `VITE_*` vars are **public** (shipped to the browser) — never put
  secrets there. Source-map upload tokens are build-host env vars (CI secrets),
  not `VITE_*`.
- Keep each environment's Sentry DSN/release separate so errors are attributable.
