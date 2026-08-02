# Enterprise KPI Dashboard

Executive & operational KPI dashboard for VoltHub. It surfaces **10 widgets**
computed entirely from **existing field‑report data** — no new tables, no mock
data, and no schema changes.

> **What is a "Pekerjaan"?** A *work job* is a field report. In the live data
> model a job is captured across **two** existing tables — `laporan_awal`
> (work start / JSA) and `laporan_akhir` (work completion) — both keyed off the
> shared canonical `ReportStatus` enum (`DRAFT · PENDING · APPROVED · REJECTED ·
> REVISED`). Every KPI aggregates **both** tables.

---

## 1. Widgets & definitions

| # | Widget | Definition (over `laporan_awal` ∪ `laporan_akhir`) |
|---|--------|----------------------------------------------------|
| 1 | **Total Pekerjaan** | All reports in scope |
| 2 | **Pekerjaan Selesai** | `status = APPROVED` |
| 3 | **Pekerjaan Berjalan** | `status ∈ {DRAFT, PENDING, REVISED}` (in progress) |
| 4 | **Pending Approval** | `status = PENDING` |
| 5 | **Rejected** | `status = REJECTED` |
| 6 | **Team Performance** | Per‑team `total` / `selesai` / `completionRate`, grouped via the report author's `users.teamId → teams` |
| 7 | **Monthly Trend** | `total` & `selesai` per calendar month (zero‑filled window, default 6 months) |
| 8 | **Top Team** | The team with the most completed jobs (first row of Team Performance) |
| 9 | **Top Petugas** | `PETUGAS` leaderboard by reports authored (default top 5) |
| 10 | **SLA Completion Rate** | % of approved jobs approved within the SLA window (`approvedAt − submittedAt ≤ slaHours`, default 48h) + average approval turnaround |

---

## 2. Architecture

Built as a self‑contained modular backend domain plus a frontend feature, both
reusing existing infrastructure (auth, RBAC, Prisma client, response envelope,
shared axios client, dashboard widget/chart primitives).

### Backend — `BE/src/modules/kpi/`

| File | Responsibility |
|------|----------------|
| `kpi.dto.ts` | Response contract (`KpiDashboard`, `KpiSummary`, `KpiSla`, …) |
| `kpi.validation.ts` | Zod query schema (`months`, `slaHours`, `topLimit`) with bounded defaults |
| `kpi.repository.ts` | **Only** Prisma layer — one aggregation query per widget |
| `kpi.service.ts` | RBAC scope resolution, rate math, trend zero‑fill, `Promise.all` fan‑in |
| `kpi.controller.ts` | Thin HTTP glue (`next(err)` to the global error handler) |
| `kpi.routes.ts` | Router, `authenticate` + `authorize(...ADMIN_ROLES)` |

Mounted in `BE/src/routes/index.ts` under the V2 base path → **`/api/v1/kpi`**.

### Frontend — `FE/src/features/v2/kpi/`

| File | Responsibility |
|------|----------------|
| `api.ts` | `useKpiDashboard()` TanStack Query hook (single `v2Get('/kpi/dashboard')`) + types |
| `KpiDashboard.tsx` | All 10 widgets: summary cards, charts, leaderboards, SLA gauge |

Route `FE/src/routes/_app.kpi.tsx` (`/kpi`, guarded `OPS_ROLES`) and a sidebar
entry in `FE/src/lib/v2/nav.ts`. Charts and stat cards **reuse** the existing
`features/v2/dashboard/{widgets,charts}` primitives (`StatCard`, `SectionCard`,
`TrendChart`, `BarMini`) — no duplicate components.

---

## 3. API

All endpoints require a Bearer JWT and the management roles (`SUPER_ADMIN`,
`ADMIN`). Responses use the shared envelope `{ success, message, data, meta }`.

| Method & path | Description |
|---------------|-------------|
| `GET /api/v1/kpi/dashboard` | **Primary** — all 10 widgets in one round trip |
| `GET /api/v1/kpi/summary` | Widgets 1–5 + completion rate |
| `GET /api/v1/kpi/team-performance` | Per‑team rows (Top Team = first) |
| `GET /api/v1/kpi/monthly-trend` | Zero‑filled monthly trend |

**Query params** (all optional, applied by Zod with defaults):

| Param | Default | Range | Affects |
|-------|---------|-------|---------|
| `months` | `6` | 1–24 | Monthly Trend window |
| `slaHours` | `48` | 1–720 | SLA window |
| `topLimit` | `5` | 1–20 | Top Petugas size |

### Example

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/v1/kpi/dashboard?months=6&slaHours=48&topLimit=5"
```

```jsonc
{
  "success": true,
  "message": "KPI dashboard retrieved successfully",
  "data": {
    "summary": { "totalPekerjaan": 1240, "pekerjaanSelesai": 980,
                 "pekerjaanBerjalan": 210, "pendingApproval": 150,
                 "rejected": 50, "completionRate": 79.0 },
    "sla": { "finalized": 980, "withinSla": 905, "slaCompletionRate": 92.3,
             "avgApprovalHours": 11.4, "slaWindowHours": 48 },
    "teamPerformance": [ { "teamId": "…", "teamName": "Tim A", "teamCode": "TA-01",
                           "total": 320, "selesai": 290, "completionRate": 90.6 } ],
    "monthlyTrend": [ { "month": "2026-01", "label": "Jan 2026",
                        "total": 180, "selesai": 150 } ],
    "topTeam": { "teamId": "…", "teamName": "Tim A", "completionRate": 90.6 },
    "topPetugas": [ { "userId": "…", "name": "Budi", "total": 142, "selesai": 130 } ],
    "scope": { "level": "GLOBAL", "rtuppId": null },
    "generatedAt": "2026-06-05T09:00:00.000Z"
  }
}
```

Endpoints are documented in Swagger UI at **`/api/docs`** under the **KPI** tag.

---

## 4. RBAC & data scope

Resolved server‑side in `kpi.service.resolveScope()` — the client cannot widen
its own scope.

| Role | Access | Scope |
|------|--------|-------|
| `SUPER_ADMIN` | ✅ | **GLOBAL** — all RTUPPs |
| `ADMIN` | ✅ | **Own RTUPP** only (must be assigned to one, else `403`) |
| `PETUGAS` | ❌ | Not granted these aggregate cross‑team views (keeps its own operational dashboard) |

Legacy DB roles are normalized via `src/auth/roles.ts` (`SUPERADMIN → SUPER_ADMIN`,
`ADMIN_RTUPP → ADMIN`), so existing JWTs work unchanged. Scope is injected into
each query as a parameterized SQL fragment (`AND u.rtuppId = ?`).

---

## 5. Performance

The dashboard is optimized for **fast load** and **no duplicate queries**:

- **One HTTP request** for the whole dashboard (`/kpi/dashboard`); the frontend
  does **not** fan out one request per card.
- **One aggregation query per widget** — 5 queries total — all run concurrently
  with `Promise.all` (no sequential waterfall).
- All counting/grouping happens **in MySQL** (`COUNT`, `SUM(bool)`,
  `DATE_FORMAT`, `TIMESTAMPDIFF`); the service only assembles pre‑aggregated
  rows — no per‑row or N+1 fetching.
- Both report tables are combined with `UNION ALL` inside a single subquery, so
  a job spanning `laporan_awal` + `laporan_akhir` is counted in one pass.
- Queries lean on existing indexes (`idx_*_status`, `idx_user_rtupp`,
  `idx_user_team`, `createdById`).
- Client caches the result for 60s (`staleTime`), with a manual **Refresh**.

---

## 6. States (frontend)

- **Loading** — skeletons in every card / chart slot (`Skeleton`).
- **Error** — dedicated panel with a **Muat ulang** (retry → `refetch()`).
- **Empty** — per‑widget "Belum ada data…" messaging (no blank charts).
- **Responsive** — summary grid `2 → 3 → 5` columns; chart/leaderboard rows
  collapse to a single column on small screens (`grid-cols-1 lg:grid-cols-3`).

---

## 7. Files changed / added

**Backend (new):** `BE/src/modules/kpi/{kpi.dto,kpi.validation,kpi.repository,kpi.service,kpi.controller,kpi.routes}.ts`
**Backend (edited):** `BE/src/routes/index.ts` (mount `/v1/kpi`), `BE/src/config/swagger.ts` (KPI tag + 4 paths)
**Frontend (new):** `FE/src/features/v2/kpi/{api.ts,KpiDashboard.tsx}`, `FE/src/routes/_app.kpi.tsx`
**Frontend (edited):** `FE/src/lib/v2/nav.ts` (sidebar entry)
