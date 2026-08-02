# VoltReport — Load Test Benchmark Results

Record results here after each run (`bash run-all.sh`). k6 metrics come from the
console summary / `results/summary-<vu>vu.json`; server CPU/MEM from a parallel
`docker stats` / `top` (see [README.md](./README.md)).

## Environment
- Date: _____
- Backend: _____ (host spec: vCPU / RAM)
- DB: MySQL _____ (host spec)
- Build/commit: _____
- BASE_URL: _____

## Results

| Scenario | VUs | Req/s | p95 (ms) | p99 (ms) | Error % | Server CPU % | Server MEM | Result |
|----------|-----|-------|----------|----------|---------|--------------|------------|--------|
| 1 | 50  |  |  |  |  |  |  | ☐ |
| 2 | 100 |  |  |  |  |  |  | ☐ |
| 3 | 200 |  |  |  |  |  |  | ☐ |

SLO targets (thresholds enforced by the script): **p95 < 800ms**, **p99 < 1.5s**,
**error rate < 1%**.

## Observations / bottlenecks
- _e.g. p95 acceptable to 100 VUs; at 200 VUs DB connection pool saturates and
  p99 spikes — increase Prisma pool + MySQL `max_connections`._

## Action items
- [ ] ...

---
> Not yet run in this environment: executing the benchmark requires a live API +
> seeded MySQL and the `k6` binary. The scripts and thresholds are ready; fill in
> the tables from a staging run.
