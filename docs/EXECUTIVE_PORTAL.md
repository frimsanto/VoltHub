# Executive Portal

A read-only management dashboard for VoltHub leadership. It surfaces national,
regional and team KPIs, monthly trends, approval statistics and asset statistics
by **consuming the existing VoltHub V2 backend APIs** — no business logic is
duplicated and no new backend endpoints were added.

> Built on the existing **`portal/`** project (TanStack Start + React 19 +
> TanStack Query + shadcn/ui + recharts), reachable at **`/executive`**.

---

## 1. Audience & access

| Persona | Backend role | Data scope | Portal view |
|---|---|---|---|
| Director / Regional Head | `SUPER_ADMIN` | All UP3 (GLOBAL) | **National** rollup |
| UP3 Head / Manager | `ADMIN` | Own RTUPP | **Regional** rollup |
| Field officer | `PETUGAS` | — | **Blocked** (403 + "not authorized" notice) |

The audience label and the National/Regional framing are derived from the **data
scope the server actually applied** (`kpi.scope.level`), not from a client guess —
so the heading always matches what is on screen.

---

## 2. Features → API mapping

Every widget is a verbatim consumer of an existing endpoint. The portal never
recomputes a KPI.

| Feature | Source endpoint | Notes |
|---|---|---|
| **National / Regional KPI** | `GET /api/v1/kpi/dashboard` → `summary` | Total / Selesai / Berjalan / Pending / Rejected + completion rate |
| **Team KPI** | `GET /api/v1/kpi/dashboard` → `teamPerformance` | Per-team completion-rate bars |
| **Monthly trends** | `GET /api/v1/kpi/dashboard` → `monthlyTrend` | Zero-filled window (`months` filter) |
| **Approval statistics** | `GET /api/v1/kpi/dashboard` → `sla` | SLA completion %, within-SLA, avg turnaround |
| **Approval activity** | `GET /api/v1/workflow/transitions` | Recent workflow transition feed (admin scope) |
| **Asset statistics** | `GET /api/v1/assets?status=…&limit=1` | Counts by lifecycle status via `meta.total` (4 buckets) |
| **Operational overview** | `GET /api/v1/gis/layers` | Live Gardu / Penyulang / Asset / Work-order counts |
| **Network performance** | `GET /api/v1/performance/summary` | Success rate, avg score, data points |
| **Auth** | `POST /api/auth/login`, `GET /api/auth/profile` | Only write call the portal makes |

All responses use the shared envelope `{ success, message, data, meta }`, which
the client unwraps in `lib/executive/api.ts`.

---

## 3. Dashboard

### Executive widgets
- **Headline KPI** — five stat cards (Total Pekerjaan, Selesai, Berjalan, Pending
  Approval, Ditolak) with completion-rate hint.
- **Ikhtisar Operasional** — Gardu / Penyulang / Asset / Work-order live counts.
- **Statistik Approval** — SLA completion gauge + finalized / within-SLA / avg
  turnaround.
- **Statistik Asset** — status distribution (Aktif / Peringatan / Rusak / Pensiun).
- **Kinerja Jaringan** — performance summary cards.
- **Aktivitas Approval Terbaru** — workflow transition feed.

### Charts (recharts, theme-aware)
- **Monthly trend** — stacked area (total vs. selesai).
- **Team KPI** — horizontal completion-rate bars.
- **Asset statistics** — donut by status.

Chart colours read from the oklch theme tokens (`--color-primary`,
`--color-success`, …) so they follow light/dark mode automatically.

### Filters
- **Tren bulanan** — 3 / 6 / 12 / 24 months (`months` query param).
- **Window SLA** — 24 / 48 / 72 / 168 hours (`slaHours` query param).
- **Muat ulang** — manual refetch; shows the server `generatedAt` timestamp.

Filters only shape the **request**; aggregation stays server-side.

---

## 4. Security

- **Read-only access.** The client exposes only authenticated `GET` helpers plus
  the single `POST /auth/login`. There is no create/update/delete surface in the
  portal.
- **Server-enforced RBAC.** `/kpi/*` requires `SUPER_ADMIN`/`ADMIN`; data scope
  (GLOBAL vs. own-RTUPP) is resolved server-side in `kpi.service.resolveScope()`
  and **cannot be widened by the client**. A `PETUGAS` token receives `403`.
- **Role-based visibility.** `lib/executive/rbac.ts` maps the canonical role to an
  audience and chooses the widget set. It can only ever *hide* what the server
  already permits — it never grants access. Non-management users hitting
  `/executive` get a friendly "Akses tidak diizinkan" notice.
- **Token handling.** The access token is stored in `localStorage`
  (`vh-exec-token`) and sent as a `Bearer` header; the session is validated on
  load via `/auth/profile` and cleared on logout or any `401`.

---

## 5. Architecture

```
portal/src/
├─ lib/executive/
│  ├─ api.ts        # fetch wrapper, envelope unwrap, token, login/profile
│  ├─ types.ts      # response contracts (mirror BE DTOs, read-only subset)
│  ├─ auth.tsx      # ExecutiveAuthProvider + useExecutiveAuth
│  ├─ rbac.ts       # role → audience → visible widgets
│  └─ queries.ts    # TanStack Query hooks (one per endpoint)
├─ components/executive/
│  ├─ ui.tsx        # StatCard, SectionCard, ProgressBar, Empty/Error states
│  ├─ charts.tsx    # MonthlyTrendChart, TeamBarChart, DonutChart (recharts)
│  ├─ Filters.tsx   # window controls + refresh
│  ├─ LoginGate.tsx # sign-in card + not-authorized notice
│  └─ ExecutiveDashboard.tsx  # composes all widgets
└─ routes/executive.tsx       # /executive route (AppShell + gate + dashboard)
```

Reuses the portal's existing infrastructure: `AppShell` (header/footer/theme),
shadcn/ui primitives, TanStack Query client (from `__root.tsx`), and the oklch
design tokens in `styles.css`. No new heavy dependencies were introduced
(recharts and lucide-react were already in `package.json`).

### Data flow
1. `ExecutiveAuthProvider` restores/validates the session.
2. `LoginGate` renders sign-in, a 403 notice, or the dashboard.
3. `ExecutiveDashboard` runs the query hooks (each cached 60s, `Promise.all`-style
   parallel fetches), derives the audience from `kpi.scope.level`, and lays out
   the widgets.

---

## 6. Configuration

| Env var | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3001/api` | Backend API base (no trailing slash) |

Set it in `portal/.env`:

```dotenv
VITE_API_BASE_URL=https://api.voltreport.id/api
```

Run locally:

```bash
cd portal
bun install      # or npm install
bun run dev      # http://localhost:8080/executive
```

> CORS: the backend must allow the portal origin (`CORS_ORIGIN` in `BE/.env`).

---

## 7. States & UX

- **Loading** — skeletons in every stat card and chart slot.
- **Error** — per-widget panel with a **Muat ulang** retry (`refetch()`); a failed
  KPI fetch does not blank the whole page.
- **Empty** — per-widget "Belum ada data…" messaging (no blank charts).
- **Responsive** — KPI grid collapses `5 → 3 → 2 → 1`; chart rows stack on small
  screens. Dark/light mode via the shared `AppShell` theme toggle.

---

## 8. Constraints honoured

- ✅ **Consume existing backend APIs** — only existing `/kpi`, `/workflow`,
  `/assets`, `/performance`, `/gis`, `/up3s`, `/auth` endpoints are called.
- ✅ **Do not duplicate business logic** — all aggregation, RBAC scoping and rate
  math run server-side; the client only fetches, labels and charts.
- ✅ **Read-only** — no write surface beyond authentication.
- ✅ **Built on the existing portal project** — extends `portal/`, no new app.
