# Database Optimization — Production-Scale Performance Audit

> **Scope:** VoltHub backend (`BE/`), MySQL 8 + Prisma 5.
> **Goal:** prepare the read-heavy paths (dashboard, KPI, reporting, GIS,
> notifications) for production data volumes.
> **Constraint:** **no schema-breaking changes** — every change here is either a
> pure read-path query rewrite or an *additive* `CREATE INDEX`. No column or
> table is renamed, dropped, retyped, or made non-nullable.

---

## 1. Method

1. Read the full Prisma schema and every Prisma-touching file (`controllers/`,
   `services/`, `modules/**/**.repository.ts`).
2. Classified each query path: slow scans, missing indexes, N+1 fan-out,
   dashboard, reporting, notification.
3. Implemented the high-value fixes (one controller rewrite + 9 indexes).
4. Verified: `prisma validate` ✅, `prisma generate` ✅, `tsc --noEmit` ✅,
   `vitest run` → **137/137 pass** ✅.

### Audit scorecard

| Area | Verdict | Action |
|---|---|---|
| **Dashboard** (`dashboardController`) | 🔴 ~55 sequential round-trips, incl. a **dead** 14-query loop | **Rewritten** → ~11 queries, mostly parallel |
| **KPI** (`kpi.repository`) | 🟢 already single-pass raw `UNION ALL` aggregation | Now backed by new `createdAt` indexes |
| **GIS** (`gis.repository`) | 🟡 single-pass aggregation, but bbox range scan unindexed | Added `(latitude, longitude)` index |
| **Notifications** (`notification.repository`) | 🟡 well-structured, inbox list filesorts | Added `(userId, createdAt)` index |
| **Reporting/Rekap/History** | 🟡 parallelized, but sort columns unindexed | Added `createdAt` / `tanggalSelesai` indexes |
| **N+1 fan-out** | 🟢 none found | Verified: no `await` inside `.map`/loops anywhere in `src/` |

---

## 2. Indexes Added

Migration: [`BE/prisma/migrations/20260609230000_perf_audit_indexes_additive/migration.sql`](../BE/prisma/migrations/20260609230000_perf_audit_indexes_additive/migration.sql).
All additive — roll back by dropping the same indexes.

| # | Table | Index | Columns | Serves |
|---|---|---|---|---|
| 1 | `laporan_awal` | `idx_laporan_awal_created` | `(createdAt)` | dashboard today/trend, KPI monthly trend, history sort |
| 2 | `laporan_awal` | `idx_laporan_awal_status_created` | `(status, createdAt)` | history/rekap *filter-by-status then sort-by-date* |
| 3 | `laporan_akhir` | `idx_laporan_akhir_created` | `(createdAt)` | same as #1, akhir side |
| 4 | `laporan_akhir` | `idx_laporan_akhir_status_created` | `(status, createdAt)` | same as #2, akhir side |
| 5 | `laporan_akhir` | `idx_laporan_akhir_tanggal_selesai` | `(tanggalSelesai)` | rekap-akhir default `ORDER BY tanggalSelesai DESC` + range filter |
| 6 | `locations` | `idx_locations_geo` | `(latitude, longitude)` | GIS viewport bbox range scan |
| 7 | `notifications` | `idx_notification_user_created` | `(userId, createdAt)` | inbox list (filter + ordered page) |
| 8 | `tickets` | `idx_tickets_created` | `(createdAt)` | ticket list default `ORDER BY createdAt DESC` |

> **Why these and not more?** Equality-filter columns already on the hot path
> (`status`, `createdById`, `locationId`, `userId+readAt`, delivery
> `status+nextAttemptAt`, every FK) were **already indexed** in the baseline
> schema. The gap was exclusively **time-ordering / time-range** columns and the
> **geo range** — the eight above close it without over-indexing the write path.

### Deployment note
`CREATE INDEX` takes a metadata lock and builds the index. On already-populated
tables, run during a maintenance window, or online:
```sql
-- MySQL 8 online build (no write lock):
ALTER TABLE laporan_awal ADD INDEX idx_laporan_awal_created (createdAt), ALGORITHM=INPLACE, LOCK=NONE;
```

---

## 3. Query Optimization — Dashboard Rewrite

[`BE/src/controllers/dashboardController.ts`](../BE/src/controllers/dashboardController.ts)
was the single worst path. It is called on every dashboard load by every role.

### Before — query inventory (per request)

| Block | Pattern | Queries |
|---|---|---|
| Laporan Awal status counts | 4 × `count()` (total, pending, approved, draft), **sequential `await`** | 4 |
| Laporan Akhir status counts | 3 × `count()`, sequential | 3 |
| "Today" | 2 × `count()` | 2 |
| "Rejected" | 2 × `count()`, sequential | 2 |
| Recent activities | 1 × `findMany` | 1 |
| **7-day `trend` loop** | 7 × (`Promise.all` of 2 counts) — **result never added to payload** | **14** |
| Recent reports | 2 × `findMany`, sequential | 2 |
| **14-day `trendReports` loop** | 14 × (`Promise.all` of 2 counts) | **28** |
| Job statistics | 2 × `groupBy` | 2 |
| ADMIN scope | 1 × user lookup | 1 |
| **Total** | | **≈ 59** |

Two structural problems:
- **Dead work:** the 7-day `trend` array was computed (**14 queries**) and never
  placed in the response — pure waste on every call.
- **Loop-of-counts:** the trend loops issued **2 queries per day**. The 14-day
  trend alone was 28 round-trips that a single `GROUP BY DATE(...)` answers.
- Most counts were **sequentially `await`-ed**, so latency was the *sum* of all
  round-trips, not the max.

### After — query inventory (per request)

| Block | Pattern | Queries |
|---|---|---|
| Status tallies | 2 × `groupBy(['status'])` (one/table) → replaces 9 counts | 2 |
| "Today" | 2 × `count()` (uses new `createdAt` index) | 2 |
| Recent activities | 1 × `findMany` | 1 |
| Recent reports | 2 × `findMany` | 2 |
| 14-day trend | 2 × grouped raw `GROUP BY DATE_FORMAT(createdAt)` → replaces 28 | 2 |
| Job statistics | 2 × `groupBy` | 2 |
| ADMIN scope | 1 × user lookup (ADMIN only) | 0–1 |
| **Total** | **all in ONE `Promise.all` batch** | **≈ 11** |

Key changes:
- **Removed the dead 7-day trend loop entirely** (−14 queries, zero behaviour change — it was never in the payload).
- Collapsed 9 status `count()`s into **2 `groupBy` queries**; derive
  total/pending/approved/rejected/draft in JS.
- Replaced the 28-query 14-day loop with **2 grouped queries** keyed by day,
  reassembled into the same `trendReports` shape (same `id-ID` date labels).
- Resolve the role **scope once** and run **every widget in a single
  `Promise.all`**, so request latency ≈ the slowest query, not the sum.
- Removed ~40 lines of per-block `try/catch` + verbose `console.log` noise
  (one outer guard still returns the fallback payload on error).

**Response shape is unchanged** — `totalToday`, `totalReports`,
`pendingReports`, `approvedReports`, `rejectedReports`, `draftReports`,
`recentActivities`, `recentReports`, `trendReports`, `statusDistribution`,
`deviceConditions`, `jobStatistics` are all preserved. No frontend change
required.

#### Before (excerpt)
```ts
// 14-day trend — 28 round-trips, sequential days
for (let i = 13; i >= 0; i--) {
  const date = new Date(); date.setDate(date.getDate() - i); date.setHours(0,0,0,0);
  const next = new Date(date); next.setDate(next.getDate() + 1);
  const [awalCount, akhirCount] = await Promise.all([
    prisma.laporanAwal.count({ where: { ...scopeWhere, createdAt: { gte: date, lt: next } } }),
    prisma.laporanAkhir.count({ where: { ...scopeWhere, createdAt: { gte: date, lt: next } } }),
  ]);
  dashboardPayload.trendReports.push({ date: /*...*/, awal: awalCount, akhir: akhirCount });
}
```

#### After (excerpt)
```ts
// One grouped query per table over the 14-day window, served by idx_laporan_*_created
async function dailyCounts(table, scope, since) {
  const rows = await prisma.$queryRaw`
    SELECT DATE_FORMAT(t.createdAt, '%Y-%m-%d') AS d, COUNT(*) AS c
    FROM ${Prisma.raw(table)} t ${join}
    WHERE t.createdAt >= ${since} ${where}
    GROUP BY d`;
  return new Map(rows.map(r => [r.d, num(r.c)]));
}
// ...then assemble the 14-day skeleton in JS from the two maps (0 extra queries)
```

---

## 4. Aggregation Improvements

| Path | Improvement |
|---|---|
| Dashboard status counts | 9 `COUNT(*)` → **2 `GROUP BY status`** aggregations |
| Dashboard daily trend | 28 windowed `COUNT(*)` → **2 `GROUP BY DATE_FORMAT(createdAt)`** |
| KPI (already optimal) | confirmed: status/SLA/trend/team/petugas each a **single raw `UNION ALL`** aggregation, now index-backed on `createdAt` (was a full scan on the `createdAt >= since` predicate) |
| GIS sites/heatmap/clusters | confirmed single-pass `LEFT JOIN + conditional COUNT`; bbox predicate now an **index range scan** instead of full `locations` scan |

---

## 5. Estimated Performance Gains

> Order-of-magnitude estimates. Absolute numbers depend on data volume,
> hardware, and connection RTT; the **round-trip reduction is exact** (counted
> from code), and round-trips dominate latency for a remote DB.

### Dashboard endpoint (`GET /api/dashboard/stats`)
| Metric | Before | After | Gain |
|---|---|---|---|
| DB round-trips / request | **≈ 59** | **≈ 11** | **−81%** |
| Wasted (dead-loop) queries | 14 | 0 | eliminated |
| Sequential await chain | long (most counts serial) | 1 parallel batch | latency ≈ sum → ≈ max |
| Est. latency @ ~3 ms RTT, 50k reports | ~400–700 ms | **~60–120 ms** | **~5–8× faster** |

### KPI monthly trend (`createdAt >= since`)
| Data volume | Before (full scan) | After (`idx_*_created` range) | Gain |
|---|---|---|---|
| 100k reports | full table scan | index range scan | **~10–50×** fewer rows examined |

### GIS viewport (`findSites` / `heatPoints` bbox)
| Data volume | Before | After (`idx_locations_geo`) | Gain |
|---|---|---|---|
| 100k locations, zoomed-in viewport | scan all 100k | range-scan only on-screen rows | **10–100×** depending on zoom |

### Reporting / history / rekap & notification inbox
| Path | Before | After | Gain |
|---|---|---|---|
| History `WHERE status ORDER BY createdAt` | full scan + filesort | `idx_*_status_created` covers both | **filesort eliminated** |
| Rekap-akhir `ORDER BY tanggalSelesai` | filesort | `idx_laporan_akhir_tanggal_selesai` | filesort eliminated |
| Notification inbox page | filesort per page | `idx_notification_user_created` | filesort eliminated |
| Ticket list | filesort | `idx_tickets_created` | filesort eliminated |

---

## 6. What Was *Not* Changed (and why)

- **KPI / GIS / notification / performance repositories** — already follow the
  "one aggregation per widget, no N+1" contract. Left as-is; only the underlying
  indexes were added.
- **`groupBy(['pekerjaan'])`** (dashboard job stats) — groups on a `TEXT`
  column (un-indexable in MySQL without a prefix index), but is bounded by the
  role scope and already minimal (2 queries). Left as-is. A future
  normalization of `pekerjaan` into a lookup table would let this be indexed.
- **`approvedAt` range in rekap summary** — narrow (status=APPROVED subset);
  not worth a dedicated composite given the write-amplification trade-off.
- **No PostgreSQL-specific features** (partitioning, partial indexes) — the
  ERD defers those to the eventual PG migration; everything here is MySQL-8 safe.

---

## 7. Apply

```bash
cd BE
npx prisma migrate deploy      # applies 20260609230000_perf_audit_indexes_additive
npx prisma generate            # client already matches; no-op if up to date
```
All changes are additive and backward-compatible; no application redeploy is
*required* for the indexes, but deploy the rewritten `dashboardController` to
realise the round-trip reduction.
