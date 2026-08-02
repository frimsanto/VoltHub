# VoltHub — Production Deployment Checklist

Consolidated go-live checklist for the VoltHub backend (Express + Prisma/MySQL)
and frontend (React/Vite + Capacitor). Targets a **single VPS now** with a clean
**scale-out** path later. Cross-references the detailed docs rather than
duplicating them.

See also: [`PRODUCTION_READINESS_AUDIT.md`](./PRODUCTION_READINESS_AUDIT.md) ·
[`GO_LIVE_CHECKLIST.md`](./GO_LIVE_CHECKLIST.md) · [`BACKUP.md`](./BACKUP.md) ·
[`DISASTER_RECOVERY.md`](./DISASTER_RECOVERY.md) ·
[`ENVIRONMENTS.md`](./ENVIRONMENTS.md) · [`ANDROID_RELEASE.md`](./ANDROID_RELEASE.md).

## 0. Readiness audit (2026-06-18)

| Area | State | Source |
|------|-------|--------|
| Health check | ✅ liveness at `GET /health` and `GET /api/health` | `BE/src/index.ts` |
| Env config | ✅ centralised + typed with prod defaults | `BE/src/config/env.ts` |
| Secrets | ✅ all via env (JWT, DB, signature keys, Sentry, Anthropic) | `env.ts` |
| Build | ✅ BE `tsc` → `dist/`, `node dist/index.js`; FE `vite build` → `dist/` | `package.json` |
| DB backup | ✅ `scripts/backup.sh` (mysqldump) | `BE/scripts/backup.sh` |
| DB restore | ✅ `scripts/restore.sh` | `BE/scripts/restore.sh` |
| Storage | ✅ local `UPLOAD_DIR` (configurable) | `env.ts` |
| Logging | ✅ `LOG_LEVEL`; Sentry error/trace capture | `env.ts` |
| Monitoring | ✅ Sentry (DSN, env, release, traces sample rate) | `env.ts` |
| Rate limiting | ✅ per-user limiter (window + max) | `env.ts`, `index.ts` |
| Force-update gate | ✅ `APP_MIN_VERSION` / `APP_LATEST_VERSION` (HTTP 426) | `env.ts` |
| Readiness (DB ping) | ⚠️ add `GET /readyz` that pings Prisma before marking ready | recommendation below |

## 1. Pre-deploy (must pass)

- [ ] Set **all** production env vars; rotate the defaults that ship as
  `*-change-in-production` (`JWT_SECRET`, `JWT_REFRESH_SECRET`).
- [ ] `DATABASE_URL` points at the production MySQL; user has least privilege.
- [ ] `CORS_ORIGIN` = the production web origin (no wildcard).
- [ ] Generate signature keys (`SIGNATURE_PRIVATE_KEY/PUBLIC_KEY`) — see [`DIGITAL_SIGNATURE.md`](./DIGITAL_SIGNATURE.md).
- [ ] `SENTRY_DSN` set; `SENTRY_TRACES_SAMPLE_RATE` tuned (e.g. 0.1).
- [ ] Quality gate green: `typecheck`, `lint`, `test` (BE), `build` (FE+BE), Playwright (see [`docs`](./PRODUCTION_READINESS_AUDIT.md)).
- [ ] `npx prisma migrate deploy` run against production DB.

## 2. Single-VPS topology (now)

```
            ┌──────────────────────── VPS ────────────────────────┐
  Internet ─┤ Nginx (TLS, gzip)                                    │
            │   ├── /            → static FE (dist/, immutable)    │
            │   └── /api         → Node (pm2) :3001 (proxy_pass)   │
            │ MySQL 8 (local socket)                               │
            │ uploads/ (UPLOAD_DIR, on a backed-up volume)         │
            │ cron: scripts/backup.sh nightly → off-VPS copy       │
            └──────────────────────────────────────────────────────┘
```

- [ ] Nginx terminates TLS (Let's Encrypt/certbot, auto-renew); HTTP→HTTPS redirect.
- [ ] Node runs under **pm2** (or systemd) with `--max-restarts`, log rotation, boot persistence.
- [ ] Serve FE `dist/` directly from Nginx with long-cache + `index.html` no-cache.
- [ ] `uploads/` on a separate, backed-up volume; not under the web root.
- [ ] `scripts/backup.sh` via nightly cron; ship dumps **off-VPS** (object storage); test `restore.sh` quarterly.
- [ ] Firewall: only 80/443 public; MySQL bound to localhost.
- [ ] Set up uptime ping against `/health`; alert to Sentry/on-call.

## 3. Recommended: readiness endpoint

`/health` is liveness only. Add a readiness probe that fails when the DB is
unreachable so a load balancer never routes to a broken instance:

```ts
app.get('/readyz', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'unavailable' });
  }
});
```

## 4. Scale-out path (future)

When one VPS is no longer enough, the app already factors cleanly:

- **Stateless API** → run N Node instances behind a load balancer. Required
  changes: move `uploads/` to shared object storage (S3-compatible) and serve via
  signed URLs/CDN; ensure rate-limit + idempotency state is shared (move the
  in-process rate limiter and `IdempotencyKey` checks to Redis).
- **Database** → managed MySQL with read replicas; point reporting/KPI reads at a
  replica (the dashboard already uses a single aggregate endpoint — see
  [`DATABASE_OPTIMIZATION.md`](./DATABASE_OPTIMIZATION.md)).
- **Static FE / CDN** → push `dist/` to a CDN; API stays on the LB.
- **Background work** → the notification retry queue is in-process today; promote
  to a durable queue (BullMQ/Redis) when running multiple instances.
- **Sessions** → JWT is already stateless; only refresh-token storage needs to be
  shared (already DB-backed).

## 5. Post-deploy smoke

- [ ] `GET /health` 200 from the public URL over HTTPS.
- [ ] Login → dashboard loads (each role: MASTER/MANAGER/ADMIN/PETUGAS).
- [ ] Create a report (PETUGAS) → appears in ADMIN validation queue.
- [ ] File upload + attachment preview work; download a generated PDF.
- [ ] Sentry receives a test event; backup cron produced a dump off-VPS.