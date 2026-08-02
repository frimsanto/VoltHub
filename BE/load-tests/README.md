# VoltReport — Load Testing (k6)

Load/stress tests with [k6](https://k6.io). Validates the API under 50, 100 and
200 concurrent users and enforces latency/error SLOs.

## Files
| File | Purpose |
|------|---------|
| [`lib.js`](./lib.js)   | Shared helpers (login, auth headers, base URL) |
| [`load.js`](./load.js) | Main test — read-heavy mix + periodic XLSX export, parameterised by `VUS` |
| [`run-all.sh`](./run-all.sh) | Runs all three scenarios and exports JSON summaries |

## Install k6
```bash
# macOS:    brew install k6
# Windows:  choco install k6      (or: winget install k6 --source winget)
# Linux:    https://k6.io/docs/get-started/installation/
# Docker:   docker run --rm -i grafana/k6 run - < load.js
```

## Prerequisites
- API running and reachable (`BASE_URL`, default `http://localhost:3001/api`).
- DB seeded (`npm run seed`) so the login account exists.
- Use a **test/staging** environment — these tests create real read load and
  some exports. Override the account with `LOAD_EMAIL` / `LOAD_PASSWORD`.

> Note: the per-IP `authLimiter` (20 auth/15 min) and account lockout apply.
> Each VU logs in once in `setup`, so login volume stays low. For very high VU
> counts against a hardened env, raise `RATE_LIMIT_MAX_REQUESTS` for the test
> window or whitelist the load generator's IP.

## Run

### Scenarios (concurrent users)
```bash
VUS=50  k6 run load.js        # Scenario 1
VUS=100 k6 run load.js        # Scenario 2
VUS=200 k6 run load.js        # Scenario 3

# all three + JSON summaries:
bash run-all.sh
```
Tunables: `VUS`, `DURATION` (default `1m`), `RAMP` (default `20s`), `BASE_URL`.

## Metrics

### Measured by k6 (client side)
- **Response time** — `http_req_duration` (avg / p95 / p99). SLO: p95 < 800ms, p99 < 1.5s.
- **Error rate** — `http_req_failed` (< 1%) + `failed_checks` (< 2%).
- **Throughput** — `http_reqs` / s, iterations/s.

The process exits non-zero if any threshold is breached (CI-friendly).

### Measured separately (server side — k6 can't see these)
Run one of these alongside the test and record peaks:
```bash
# Dockerised backend:
docker stats voltreport-backend           # CPU %, MEM usage live

# Bare host / pm2:
top -p "$(pgrep -f 'node dist/index.js')"
pidstat -p <pid> 1                         # CPU/mem per second (sysstat)

# MySQL pressure:
mysqladmin -u root -p extended-status | grep -E 'Threads_connected|Slow_queries'
```
Also watch **Sentry → Performance** for slow transactions and DB spans.

## Recording results
Capture for each scenario into [`BENCHMARK.md`](./BENCHMARK.md):

| Scenario | VUs | p95 (ms) | p99 (ms) | Error % | Req/s | Server CPU % | Server MEM | Result |
|----------|-----|----------|----------|---------|-------|--------------|------------|--------|
| 1 | 50  |  |  |  |  |  |  | ✅ / ❌ |
| 2 | 100 |  |  |  |  |  |  | ✅ / ❌ |
| 3 | 200 |  |  |  |  |  |  | ✅ / ❌ |

## Interpreting bottlenecks
- **p95 climbs with VUs but CPU low** → DB-bound. Check slow queries / add
  indexes (e.g. `LaporanAwal.status`, `createdById`, `tanggal`), connection pool.
- **CPU pegged at 100%** → app-bound (JSON serialization, XLSX export). Scale
  horizontally (more instances behind Nginx) or offload export to a worker.
- **Memory grows unbounded** → leak; capture a heap snapshot.
- **Errors spike at a VU threshold** → connection pool / `max_connections`
  exhausted, or rate limiter — tune for the test window.
