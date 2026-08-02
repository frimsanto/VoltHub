# VoltHub (VoltReport V2) — Phase 1 Frontend Audit

Version: 1.0
Date: 2026-06-03
Scope: Phase 1 — Dashboard + **Master Data** (Locations, Feeders, Assets, Communication Media).
Base: `FE/` (V1 reused as foundation; V2 namespaced under `/v2`, side-by-side with V1).

> Backend RELEASE READY & FROZEN. No schema / API contract / RBAC / backend changes. Validation mirrors `docs/openapi.yaml`. Inspection, HAR, Documents, Reports, Import, AI Search intentionally **not** implemented (deferred).

---

## 0. Verification

| Gate | Result |
|------|--------|
| `npm run build` (route tree regen + bundle) | ✅ built ~10s |
| `npm run typecheck` (`tsc --noEmit`) | ✅ exit 0 |
| V2 routes registered (`routeTree.gen.ts`) | ✅ 4 list + 4 detail + dashboard |
| Approved decisions applied | ✅ Import RBAC, Profile reuse, VoltHub rebrand |

---

## 1. Approved Decisions Applied

1. **Import RBAC** — `imports.run` capability = `SUPERADMIN, ADMIN, ADMIN_RTUPP` (USER excluded). Nav item `Import` is gated by `capability: "imports.run"` so USER cannot see or reach it. Enforced via the existing `RoleGate` + capability matrix (`lib/v2/rbac.ts`).
2. **Profile** — reuses V1 `/profile`. No `/v2/profile` created; V2 topbar user-menu links to `/profile`.
3. **Rebranding → VoltHub** — UI layer only (`src/lib/brand.ts`): `BRAND_NAME = "VoltHub"`, `BRAND_SUBTITLE = "Telecommunication Asset Management System"`. Applied to:
   - Login page (`routes/login.tsx`) — logo title/subtitle + browser title.
   - Sidebar header (`components/v2/V2Sidebar.tsx`).
   - Dashboard header (`routes/v2.index.tsx`).
   - Browser title (`index.html` + per-route `head`).
   - Repo / folder / `package.json` name / backend artifacts **unchanged** (as instructed).

---

## 2. Architecture (as required)

| Requirement | Implementation |
|-------------|----------------|
| TanStack Query | `createResource` factory + nested SIM hooks; `keepPreviousData` for paging |
| TanStack Table | `components/v2/DataTable.tsx` (manual/server pagination) |
| OpenAPI generated types | All request/response typed from `lib/api/v2/types.gen.ts` via `schemas.ts` aliases |
| Existing API client | V2 calls go through shared axios (`/api/v1` prefix) — interceptors reused |
| Existing auth system | `stores/auth.ts` untouched; V2 reads role via `toV2Role` |
| Existing RBAC system | `RoleGate` + capability matrix gate every create/edit/delete + nav |
| Existing shadcn components | Dialog, AlertDialog, Select, Input, Textarea, Switch, Table, Card, Badge, Separator, Button |

Flow honored: **Page → Feature (form/hooks) → API client (v2) → Backend** (no direct fetch in pages).

---

## 3. Modules Delivered (List / Create / Edit / Detail / Delete)

| Module | List | Create | Edit | Detail | Delete (soft) | Filters |
|--------|------|--------|------|--------|---------------|---------|
| **Locations** | ✅ | ✅ modal | ✅ modal | ✅ + feeders section | ✅ confirm | search, type (GI/GH/GARDU) |
| **Feeders** | ✅ | ✅ | ✅ | ✅ + assets section | ✅ | search, location |
| **Assets** | ✅ | ✅ (2-col, sections) | ✅ (loads full detail) | ✅ + hierarchy + SIM + media | ✅ | search, location, type, status |
| **Communication Media** | ✅ | ✅ | ✅ | ✅ | ✅ | search, location, media type |
| **Dashboard** | n/a | — | — | counts (Loc/Feeder/Asset/Media) | — | — |

**Cross-references:** Location→Feeders, Feeder→Assets (client-narrowed by feederId), Asset→child assets + SIM cards (full CRUD) + location media. All linked via typed detail routes.

**Notable correctness handling:**
- **Asset edit loads full detail first** (`AssetEditModal`) because `PUT /assets/{id}` replaces the whole resource (`UpdateAsset = CreateAsset`) and the list row only carries a subset — prevents nulling unshown fields.
- **Optional relation selects** (asset feeder/parent) use a `NONE` sentinel (Radix `Select` can't hold empty value), normalized to `null` on submit.
- **Soft delete** flows through `ConfirmDeleteDialog`; copy states data is deactivated and recoverable by admin.

---

## 4. Validation (mirrors OpenAPI contract)

Zod schemas transcribed from `components.schemas.Create*`:

| Entity | Required | Enums (from contract) |
|--------|----------|-----------------------|
| Location | code, name, locationType, status | locationType: GI/GH/GARDU |
| Feeder | locationId, feederCode, feederName | — |
| Asset | locationId, assetType, assetCode, assetName | assetType: RTU/FDI/RECTIFIER/BATTERY_BANK/ROUTER/MODEM/RADIO; status: ACTIVE/WARNING/DAMAGED/RETIRED |
| SIM Card | simSlot | — |
| Comm Media | locationId, mediaType, status | mediaType: GSM_4G/GSM_2G/RADIO_DATA/FO/ICON_GSM/ICON_IPVPN |

Enum single-source: `lib/v2/enums.ts`. Server `409/422` surfaced via toast (`handleError`).

---

## 5. RBAC Matrix (UI mirror of contract)

| Action | Roles |
|--------|-------|
| Locations / Feeders write | SUPERADMIN, ADMIN |
| Assets / SIM / Comm Media write | SUPERADMIN, ADMIN, ADMIN_RTUPP |
| Import (nav visibility) | SUPERADMIN, ADMIN, ADMIN_RTUPP |
| Read (all lists/details) | all authenticated |

USER sees lists/details but no create/edit/delete buttons (RoleGate) and guards block forbidden writes; backend remains the enforcer.

---

## 6. Files Added (Phase 1)

```
src/lib/brand.ts
src/lib/v2/enums.ts
src/features/v2/createResource.ts
src/features/v2/lookups.ts
src/features/v2/locations/{resource.ts,LocationForm.tsx}
src/features/v2/feeders/{resource.ts,FeederForm.tsx}
src/features/v2/assets/{resource.ts,AssetForm.tsx,AssetEditModal.tsx,simcards.ts,SimCardForm.tsx}
src/features/v2/communication-media/{resource.ts,CommMediaForm.tsx}
src/components/v2/{DataTable,PageHeader,ListToolbar,RowActions,EntityFormModal,ConfirmDeleteDialog,StatusBadge,InfoGrid,fields}.tsx
src/routes/v2.index.tsx                         (dashboard — replaced placeholder)
src/routes/v2.locations.tsx, v2.locations.$id.tsx
src/routes/v2.feeders.tsx, v2.feeders.$id.tsx
src/routes/v2.assets.tsx, v2.assets.$id.tsx
src/routes/v2.communication-media.tsx, v2.communication-media.$id.tsx
```
Modified: `src/lib/api/v2/schemas.ts` (+Update* aliases), `index.html`, `routes/login.tsx`, `components/v2/{V2Sidebar,V2AppLayout}.tsx` (brand). V1 domain code untouched.

---

## 7. Deferred (not in Phase 1, by instruction)

Inspection · HAR · Documents · Reports · Import · AI Search — UI not built. Nav entries exist (gated) and route to be implemented in later phases per `docs/FRONTEND_IMPLEMENTATION_PLAN.md`. Asset detail shows SIM + location media; Inspection/HAR/Document history tabs are intentionally omitted until those modules land.

---

## 8. Known Notes / For Next Phase

- **Bundle size** > 500 kB single chunk (pre-existing). Code-splitting/manualChunks is a later optimization, not a Phase 1 blocker.
- **Server-side sort** not in contract — DataTable sorting omitted deliberately; search + filters + pagination are server-driven.
- **Detail GET shape** unspecified in contract; assumed to return the full entity. Verify against live backend during integration testing.
- Lookups fetch first 100 options for selects — swap to async-search combobox if option counts grow.

**PHASE 1 STATUS: 🟢 COMPLETE** — Master Data fully implemented, build + typecheck green.
