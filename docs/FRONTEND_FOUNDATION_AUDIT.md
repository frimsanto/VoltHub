# VoltReport V2 — Frontend Foundation Audit (Phase 0)

Version: 1.0
Date: 2026-06-03
Scope: Phase 0 Foundation only. **No business pages implemented.**
Base: `FE/` (V1 app reused as foundation, side-by-side with V1 per approved Architecture Decision).

> Backend RELEASE READY & FROZEN — tidak ada perubahan schema / API contract / RBAC / backend. Phase 0 hanya menyiapkan fondasi frontend V2.

---

## 0. Hasil Verifikasi

| Gate | Hasil |
|------|-------|
| `npm run build` (regenerasi route tree + bundling) | ✅ built in ~20s, 3040 modules |
| `npm run typecheck` (`tsc --noEmit`) | ✅ exit 0, tanpa error |
| `npm run gen:api` (OpenAPI → types) | ✅ generated `src/lib/api/v2/types.gen.ts` (3489 baris) |
| V2 routes terdaftar di `routeTree.gen.ts` | ✅ `/v2` + `/v2/` |
| V1 app utuh (tidak diubah) | ✅ tidak ada file V1 dimodifikasi (kecuali `package.json` deps/script) |

---

## 1. Foundation Setup

**Dependencies ditambahkan (sesuai approval):**

| Paket | Tipe | Versi | Tujuan |
|-------|------|-------|--------|
| `@tanstack/react-table` | dependency | ^8.x | DataTable server-side (DESIGN_SYSTEM §3) |
| `openapi-typescript` | devDependency | 7.13.0 | Generate TS types dari `docs/openapi.yaml` |

**Script ditambahkan** di `FE/package.json`:
```json
"gen:api": "openapi-typescript ../docs/openapi.yaml -o src/lib/api/v2/types.gen.ts"
```

**Stack TDD §1 — status kelengkapan:** React19 ✅ · Vite ✅ · TanStack Router ✅ · TanStack Query ✅ · **TanStack Table ✅ (baru)** · Tailwind v4 ✅ · Shadcn ✅ · RHF ✅ · Zod ✅ · Axios ✅ · Zustand ✅ · Capacitor/PWA ✅ · **openapi-typescript ✅ (baru)**.

---

## 2. OpenAPI Type Generation

- **Source of truth:** `docs/openapi.yaml` (V2.0.0, server `/api/v1`).
- **Output:** `FE/src/lib/api/v2/types.gen.ts` (auto-generated, jangan diedit manual).
- **Alias konsumsi:** `FE/src/lib/api/v2/schemas.ts` memetakan `components["schemas"]` → nama flat (`Location`, `CreateLocation`, `Feeder`, `Asset`, `SimCard`, `CommunicationMedia`, `CreateInspection`, `CreateFinding`, `CreateHarReport`, `CreateHarDetail`, `GenerateInspectionReport`, dst).
- **Regenerasi:** `npm run gen:api` setiap kali contract berubah → mencegah drift manual.

---

## 3. API Client Alignment

**Keputusan:** V2 **reuse instance axios existing** (`lib/api/client.ts`), bukan instance baru. Semua interceptor terpakai otomatis: Bearer injection, single-flight refresh-token rotation, 401→refresh, 426 force-update gate, 403/5xx handling, Sentry capture.

- V1 baseURL `<host>/api` + prefix `/v1` ⇒ `<host>/api/v1/...` (cocok dengan OpenAPI server).
- Auth tetap di `/api/auth/*` (shared, tidak diubah).
- Envelope `{ success, message, data, meta }` identik V1 `ApiResponse<T>`.

**File:** `FE/src/lib/api/v2/`
| File | Isi |
|------|-----|
| `client.ts` | `v2Get/v2Post/v2Put/v2Patch/v2Delete` (unwrap `data`), `v2List` (rows + `PageMeta`), `v2Upload` (multipart + progress), `v2Download` (blob PDF), re-export `handleError`/`ApiResponse` |
| `types.gen.ts` | Types hasil generate (paths + schemas) |
| `schemas.ts` | Alias type ramah-pakai |
| `index.ts` | Barrel: `import { v2List, type Location } from "@/lib/api/v2"` |

> Resource client per-modul (locations.ts, feeders.ts, …) **belum dibuat** (itu Phase 2+). Phase 0 hanya core bertipe.

---

## 4. Layout Architecture

**Namespace `/v2`** — berdampingan dengan V1 (V1 tetap di `/_app/*`). V1 tidak dipensiunkan (sesuai approval; pensiun setelah UAT + Go Live V2).

| File | Peran |
|------|-------|
| `FE/src/routes/v2.tsx` | Layout route `/v2`, `beforeLoad: requireV2Auth`, render `<V2AppLayout><Outlet/></V2AppLayout>` |
| `FE/src/routes/v2.index.tsx` | Landing Phase 0 (smoke-test "Foundation Ready") — **bukan** business page; diganti Dashboard di Phase 1 |
| `FE/src/components/v2/V2AppLayout.tsx` | Shell: `V2Sidebar` + V2 topbar (theme toggle, user menu, logout, mobile menu) + `<main>` scrollable (DESIGN_SYSTEM §1) |

Struktur mengikuti pola `_app.tsx` V1 (sidebar fixed ≥lg + topbar sticky + content `max-w-[1600px]`).

---

## 5. Navigation Architecture

**Model deklaratif** `FE/src/lib/v2/nav.ts` (`V2_NAV`) sesuai sitemap TDD §6:
- Dashboard
- Master Data → Locations, Feeders, Assets, Communication Media
- Operations → Inspection, HAR, Documents
- Reports
- Import *(gate: `imports.run`)*
- AI Search
- Administration *(gate: `admin.access`)* → Users, Teams, RTUPP
- Profile

**Renderer** `FE/src/components/v2/V2Sidebar.tsx`:
- Collapsible group + active highlight + mobile `Sheet` (UX selaras V1 `Sidebar.tsx`).
- **RBAC-filtered**: item dengan `capability`/`roles` disembunyikan bila role tak memenuhi; group kosong otomatis hilang.
- `Link` TanStack dipakai; target route `/v2/*` diregistrasi Phase berikutnya (cast tipe terlokalisasi 1 titik, terdokumentasi).

---

## 6. RBAC UI Architecture

**Cermin backend, bukan enforcer.** Backend tetap satu-satunya penegak; UI hanya memutuskan tampil/aktif agar user tak menekan aksi yang akan 403.

**File `FE/src/lib/v2/rbac.ts`:**
- `V2Role = SUPERADMIN | ADMIN | ADMIN_RTUPP | USER` (TDD §5).
- `toV2Role(str)` — normalisasi role backend/V1 (`PETUGAS`/`USER`/lowercase) → kanonik, fallback least-privilege `USER`. **V1 `stores/auth.ts` tidak diubah.**
- **Capability matrix** ditranskrip langsung dari `openapi.yaml`:

| Capability | Roles | Sumber kontrak |
|-----------|-------|----------------|
| `locations.write` / `feeders.write` | SUPERADMIN, ADMIN | "roles: SUPERADMIN, ADMIN" |
| `assets.write` / `simCards.write` / `commMedia.write` | SUPERADMIN, ADMIN, ADMIN_RTUPP | "roles: …, ADMIN_RTUPP" |
| `inspections.create` / `har.create` / `documents.upload` | semua authenticated | "any authenticated role" |
| `har.detail.write` / `documents.delete` / `reports.generate` | SUPERADMIN, ADMIN, ADMIN_RTUPP | role notes |
| `imports.run` | SUPERADMIN, ADMIN, ADMIN_RTUPP | *(tak ber-anotasi di contract — default admin-tier di UI; backend tetap penegak)* |
| `admin.access` | SUPERADMIN, ADMIN, ADMIN_RTUPP | Administration section |

- API: `can(role, cap)`, `hasRole(role, allowed)`, hook `useV2Role()`, `useCan(cap)`.

**Komponen & guard:**
| File | Peran |
|------|-------|
| `FE/src/components/v2/RoleGate.tsx` | `<RoleGate capability="locations.write">` / `roles={[...]}` + `fallback` |
| `FE/src/lib/v2/route-guards.ts` | `requireV2Auth`, `requireV2Role`, `requireV2Capability` (forbidden → `/unauthorized`) |

⚠️ **Catatan untuk approval:** `imports.run` tidak ber-anotasi role di `openapi.yaml`. Default UI = admin-tier. Perlu konfirmasi apakah USER boleh menjalankan import (backend tetap final). Tidak ada perubahan backend dilakukan.

---

## 7. Daftar File Baru (Phase 0)

```
FE/package.json                          (+2 deps, +1 script)   [modified]
FE/src/lib/api/v2/types.gen.ts           (generated)
FE/src/lib/api/v2/schemas.ts
FE/src/lib/api/v2/client.ts
FE/src/lib/api/v2/index.ts
FE/src/lib/v2/rbac.ts
FE/src/lib/v2/nav.ts
FE/src/lib/v2/route-guards.ts
FE/src/components/v2/RoleGate.tsx
FE/src/components/v2/V2Sidebar.tsx
FE/src/components/v2/V2AppLayout.tsx
FE/src/routes/v2.tsx
FE/src/routes/v2.index.tsx
FE/src/routeTree.gen.ts                  (auto-regenerated)
docs/FRONTEND_FOUNDATION_AUDIT.md        (this file)
```

**Tidak ada file V1 yang diubah** selain `package.json` (deps/script) dan `routeTree.gen.ts` (auto). V1 berfungsi penuh.

---

## 8. Definition of Done — Phase 0

| Kriteria | Status |
|----------|--------|
| Dependencies terpasang (TanStack Table, openapi-typescript) | ✅ |
| Types ter-generate dari OpenAPI + script `gen:api` | ✅ |
| API client V2 selaras `/api/v1` + reuse interceptor | ✅ |
| Layout `/v2` mounted, auth-guarded, berdampingan V1 | ✅ |
| Navigation model + sidebar RBAC-filtered | ✅ |
| RBAC UI (role map, RoleGate, guards) mirror contract | ✅ |
| `typecheck` & `build` hijau | ✅ |
| Tidak ada business page diimplementasi | ✅ (sesuai instruksi) |

**FOUNDATION STATUS: 🟢 READY.**

---

## 9. Buka Untuk Approval Sebelum Phase 1

1. **`imports.run` role** — konfirmasi siapa yang boleh import (UI default admin-tier).
2. **Profile route** — V2 topbar saat ini mengarah ke `/profile` (V1). Konfirmasi: pakai ulang Profile V1 atau buat `/v2/profile` di Phase 1.
3. **Mulai Phase 1** (Auth state sudah ada · Layout · Navigation · Dashboard) — menunggu persetujuan.

> Berhenti di sini sesuai instruksi. Tidak melanjutkan ke implementasi halaman bisnis sebelum approval.
