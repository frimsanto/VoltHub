# Enterprise Workflow Engine — Completion Report

**Status:** ✅ Engine feature-complete and verified · ⚠️ Engine not yet wired to any domain entity (orphaned)
**Date:** 2026-06-09
**Scope:** `BE/src/modules/workflow/`, `FE/src/lib/v2/workflow.ts`, `FE/src/features/v2/workflow/`, `FE/src/components/v2/{WorkflowStatusBadge,WorkflowTimeline,ApprovalPanel,RevisionPanel}.tsx`
**Related:** [`APPROVAL_WORKFLOW.md`](APPROVAL_WORKFLOW.md) (design spec), [`NOTIFICATION_SYSTEM.md`](NOTIFICATION_SYSTEM.md)

This document closes out the "Complete Enterprise Workflow Engine" task. The
engine was delivered on 2026-06-05 as a generic, **additive** subsystem. This
pass **verifies** every required capability against the implementation, **audits
the codebase for modules that bypass the workflow rules**, and records the
backward-compatibility guarantees.

> **Bottom line:** every required state, guard, and UI surface already exists and
> the unit suite is green. Nothing was missing in the engine itself. The one
> genuine gap is *adoption*: no domain entity (reports, tickets, inspections,
> HAR, assets) currently routes through the engine — each keeps its own status
> lifecycle. That is intentional and backward-compatible; the migration path is
> documented in §4.

---

## 1. Required states — verification

The requested seven-state lifecycle is implemented verbatim. Single source of
truth: [`workflow.config.ts`](../BE/src/modules/workflow/workflow.config.ts);
Prisma enum `WorkflowState` (schema.prisma); FE mirror
[`lib/v2/workflow.ts`](../FE/src/lib/v2/workflow.ts).

| Required state | Present (BE enum + config) | Present (Prisma) | Present (FE mirror) |
|---|:--:|:--:|:--:|
| `DRAFT` | ✅ | ✅ | ✅ |
| `SUBMITTED` | ✅ | ✅ | ✅ |
| `REVIEWED` | ✅ | ✅ | ✅ |
| `REVISION_REQUIRED` | ✅ | ✅ | ✅ |
| `APPROVED` | ✅ | ✅ | ✅ |
| `REJECTED` | ✅ | ✅ | ✅ |
| `CLOSED` (terminal) | ✅ | ✅ | ✅ |

### Lifecycle

```
 DRAFT ──submit──▶ SUBMITTED ──review──▶ REVIEWED ──approve──▶ APPROVED ──close──▶ CLOSED
                      │                      │                     │                  ▲
       request_revision│      request_revision│               reject│                  │
                      ▼                      ▼                     ▼            close   │
                REVISION_REQUIRED ◀──────────┘                 REJECTED ───────────────┘
                      │
                      └── submit (resubmit) ──▶ SUBMITTED
```

---

## 2. Required capabilities — verification

### Backend

| Requirement | Implementation | Status |
|---|---|---|
| State machine | [`workflow.config.ts`](../BE/src/modules/workflow/workflow.config.ts) — `WORKFLOW_STATES`, `WORKFLOW_ACTIONS`, `TRANSITIONS` table, actor↔role map. Pure data, single source of truth. | ✅ |
| Transition validation | [`workflow.guards.ts`](../BE/src/modules/workflow/workflow.guards.ts) — `evaluateTransition()` enforces, in order: **terminal** → **invalid-transition** → **forbidden-role (403)** → **reason-required (422)**. | ✅ |
| Workflow history | `workflow_transitions` append-only log (one row per transition, with actor, role, from/to, timestamp). Atomic with the state update via `repository.applyTransition()` (single Prisma `$transaction`). Read via `GET /:entityType/:entityId/history` and the admin feed `GET /transitions`. | ✅ |
| Approval comments | `WorkflowTransition.comment` (`@db.Text`); optional on every action. Validated `max(2000)` in [`workflow.validation.ts`](../BE/src/modules/workflow/workflow.validation.ts). | ✅ |
| Revision comments | `REQUEST_REVISION` carries `reason` (**required** via `reasonRequired`) plus optional `comment`. | ✅ |
| Reject reasons | `REJECT` carries `reason` (**required**); guard returns `REASON_REQUIRED` (422) when blank. | ✅ |

Additional, beyond the brief: every transition is mirrored into the canonical
`audit_logs` table ([`workflow.audit.ts`](../BE/src/modules/workflow/workflow.audit.ts),
best-effort, non-blocking) and fires lifecycle notifications via the
notification dispatcher.

### Transition table (the only valid moves)

| Action | From → To | Allowed actors | Reason required |
|---|---|---|---|
| `SUBMIT` | `DRAFT`, `REVISION_REQUIRED` → `SUBMITTED` | PETUGAS | no |
| `REVIEW` | `SUBMITTED` → `REVIEWED` | SUPERVISOR | no |
| `REQUEST_REVISION` | `SUBMITTED`, `REVIEWED` → `REVISION_REQUIRED` | SUPERVISOR, ADMIN_UP3 | **yes** |
| `APPROVE` | `REVIEWED` → `APPROVED` | ADMIN_UP3, MANAGER | no (comment optional) |
| `REJECT` | `SUBMITTED`, `REVIEWED` → `REJECTED` | ADMIN_UP3, MANAGER | **yes** |
| `CLOSE` | `APPROVED`, `REJECTED` → `CLOSED` | ADMIN_UP3, MANAGER | no |

Enterprise actors (`PETUGAS`/`SUPERVISOR`/`ADMIN_UP3`/`MANAGER`) resolve onto the
deployed canonical 3-role auth set via `ACTOR_CANONICAL_ROLES` — the only place
that knows the org hierarchy. `availableActions` in the status response is
pre-filtered to the caller's role, so the UI only ever shows permitted buttons.

### Frontend

| Requirement | Implementation | Status |
|---|---|---|
| Timeline | [`WorkflowTimeline.tsx`](../FE/src/components/v2/WorkflowTimeline.tsx) — renders the immutable transition log with per-action icons, from→to labels, actor, reason and comment. | ✅ |
| Workflow status | [`WorkflowStatusBadge.tsx`](../FE/src/components/v2/WorkflowStatusBadge.tsx) + `useWorkflowStatus` hook ([`resource.ts`](../FE/src/features/v2/workflow/resource.ts)); palette in `STATE_STYLES`. | ✅ |
| Approval panel | [`ApprovalPanel.tsx`](../FE/src/components/v2/ApprovalPanel.tsx) — reviewer surface; renders only allowed actions, reveals a mandatory note for reason-required actions, optional comment otherwise. | ✅ |
| Revision panel | [`RevisionPanel.tsx`](../FE/src/components/v2/RevisionPanel.tsx) — author surface; surfaces the latest revision/reject reason and a one-click resubmit from `REVISION_REQUIRED`. | ✅ |

### API surface (mounted at `/api/v1/workflow`)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/definition` | Static state-machine description. |
| `GET` | `/transitions` | Cross-entity audit feed (**admin/super-admin only**). |
| `POST` | `/instances` | Explicitly seed an instance (optional — actions auto-create one). |
| `GET` | `/:entityType/:entityId` | Current state + caller's available actions + history. |
| `GET` | `/:entityType/:entityId/history` | Full transition log. |
| `POST` | `/:entityType/:entityId/transition` | Perform an action (guard-enforced). |

### Tests

`workflow.guards.test.ts` — **11 unit tests, passing** (`npx vitest run` → exit 0).
Covers actor↔role mapping, the happy path, terminal-state rejection,
invalid-transition rejection, forbidden-role (403) and reason-required (422)
guard ordering.

---

## 3. Audit — modules bypassing workflow rules

**Method:** searched the entire repo for any caller of `workflowService`,
`performAction`, `ensureInstance`, or the `/api/v1/workflow` HTTP surface, and
inventoried every entity that mutates a status/state field directly.

**Result:** the engine is **correct but unadopted**. Outside its own module the
only references are the four FE components — and *those components are not yet
mounted on any route*. No backend domain service drives the engine.

### 3.1 The engine itself — ✅ no rule bypass internally

All state changes inside the module flow through `evaluateTransition()` before
`applyTransition()`, in a single transaction with the audit-log row. There is no
code path that writes `currentState` or appends a transition without passing the
guard. HTTP routes are intentionally permissive (any authenticated user); the
*real* authorization is the per-action transition guard, which returns 403/422.
This is by design and is safe.

### 3.2 Entities that maintain their own lifecycle outside the engine

These are not "illegal" bypasses of the engine's internal rules — the engine has
no jurisdiction over them today. They are listed because they are the entities
an enterprise approval lifecycle would be expected to govern, and they currently
do **not**:

| Module | Status field / enum | How it transitions | Routed through workflow? |
|---|---|---|---|
| **Laporan Awal** ([`laporanAwalService.ts`](../BE/src/services/laporanAwalService.ts)) | `ReportStatus` (`DRAFT`/`PENDING`/`APPROVED`/`REJECTED`/`REVISED`) | `validateLaporanAwal()` writes `status` directly; `validationActionToStatus()` maps the action. Detail page [`_app.laporan-awal.$id.tsx`](../FE/src/routes/_app.laporan-awal.$id.tsx) calls the legacy `validate()` endpoint. | ❌ **No** |
| **Laporan Akhir** ([`laporanAkhirService.ts`](../BE/src/services/laporanAkhirService.ts)) | `ReportStatus` | `validateLaporanAkhir()` — same pattern. | ❌ **No** |
| **Tickets** ([`ticket.service.ts`](../BE/src/modules/tickets/ticket.service.ts)) | `TicketStatus` (`OPEN`/`ASSIGNED`/`CLOSED`/…) | Service sets `status` directly on create/assign/close. | ❌ **No** |
| **Inspections** (`inspections/`) | `InspectionStatus` | Domain-specific, set on its own endpoints. | ❌ **No** |
| **HAR** (`har/`) | `HarStatus` | Domain-specific. | ❌ **No** |
| **Assets** ([`asset.service.ts`](../BE/src/modules/assets/asset.service.ts)) | `AssetStatus` (`ACTIVE`/…) | Lifecycle, not an approval flow. | ❌ **No** (out of scope) |

**Status-mutation note (already-mitigated, not a workflow bypass):** the legacy
report `update`/`delete` paths deliberately refuse to copy `status` from the
request body — the only status change allowed through `update` is the
`DRAFT → PENDING` submit (see the `BUG-01` comments in both services). So the
legacy flow is itself guarded; it simply uses a *different*, parallel state
machine from the enterprise engine.

### 3.3 Read-only consumers (not bypasses)

`dashboardController`, `rekapController`, `rekapAkhirController`,
`exportController`, `historyController`, and the `kpi`/`gis` modules only
**read/aggregate** status. They mutate nothing and are correctly out of scope.

### 3.4 Conclusion of the audit

- **Inside the engine:** zero rule bypasses. Every transition is guarded and
  audited atomically. ✅
- **Across the app:** the engine has **zero adopters**. Every approval-bearing
  entity runs its own status lifecycle. This is the intended additive posture
  (it is *why* nothing broke when the engine landed), but it means the
  enterprise lifecycle is not yet *enforced* on any real record. See §4.

---

## 4. Backward compatibility & recommended adoption path

### Guarantees (verified)

- The engine is **purely additive**: it owns its own tables
  (`workflow_instances`, `workflow_transitions`) and the new `WorkflowState`
  enum. **No existing table, column, enum value, route, or service was changed.**
- The legacy `ReportStatus` lifecycle and `validateLaporanAwal` /
  `validateLaporanAkhir` continue to function unchanged. **Existing reports keep
  working exactly as before.**
- Migration `20260605000000_approval_workflow_additive` adds tables only — no
  data migration, no destructive change.

### Why the entities still bypass the engine (intentional)

Routing reports through the engine today would create a **dual source of truth**:
the workflow's `currentState` and the report's legacy `status` could diverge
because a workflow `APPROVE` does not write `LaporanAwal.status`. Wiring a
divergent or auto-mirroring approval surface onto the legacy report page in this
pass would risk the existing, working validation flow — which the task forbids.
The engine was therefore left additive and the legacy flow untouched.

### Recommended next step (non-breaking) — out of scope for this completion

When the org is ready to make the enterprise lifecycle authoritative for reports,
do it as a deliberate, separately-tested change:

1. **Mount the UI** (`ApprovalPanel` / `RevisionPanel` / `WorkflowTimeline`) on
   the V2 report detail pages with `entityType = "LAPORAN_AWAL" | "LAPORAN_AKHIR"`
   and `entityId = report.id`. The components are generic and self-contained.
2. **Bridge the state** with a single, well-tested adapter that, on each workflow
   transition for a report entity, maps `WorkflowState → ReportStatus`
   (`APPROVED→APPROVED`, `REJECTED→REJECTED`, `REVISION_REQUIRED→REVISED`,
   `SUBMITTED→PENDING`) so the legacy `status` stays the single displayed truth.
   Implement the bridge inside `workflowService.performAction` behind an
   entity-type allowlist so non-report entities are unaffected.
3. **Retire the legacy `validate()` buttons** only after the bridge is verified
   end-to-end, keeping the legacy endpoint as a fallback during transition.

Doing it in that order preserves backward compatibility at every step and avoids
the divergence problem.

---

## 5. File inventory

**Backend** (`BE/src/modules/workflow/`)
- `workflow.config.ts` — state machine (single source of truth)
- `workflow.guards.ts` — `evaluateTransition()` pure validation
- `workflow.validation.ts` — Zod schemas for the HTTP edge
- `workflow.repository.ts` — Prisma access; `applyTransition()` = state + log in one tx
- `workflow.audit.ts` — mirrors transitions to canonical `audit_logs`
- `workflow.service.ts` — orchestration (`ensureInstance`, `getStatus`, `performAction`, history) + notification dispatch
- `workflow.controller.ts` — thin Express handlers
- `workflow.routes.ts` — routes (mounted `/api/v1/workflow` in `routes/index.ts`)
- `workflow.guards.test.ts` — 11 passing unit tests

**Schema** — `WorkflowState` enum + `workflow_instances` / `workflow_transitions`
(migration `20260605000000_approval_workflow_additive`).

**Frontend**
- `FE/src/lib/v2/workflow.ts` — config mirror (states, transitions, labels, styles, role mapping)
- `FE/src/features/v2/workflow/resource.ts` — `useWorkflowStatus`, `useWorkflowTransition`
- `FE/src/components/v2/WorkflowStatusBadge.tsx`
- `FE/src/components/v2/WorkflowTimeline.tsx`
- `FE/src/components/v2/ApprovalPanel.tsx`
- `FE/src/components/v2/RevisionPanel.tsx`

---

## 6. Sign-off checklist

- [x] All 7 required states present (BE enum, Prisma, FE mirror)
- [x] State machine + transition validation (guard ordering verified)
- [x] Workflow history (append-only, atomic with state change)
- [x] Approval comments, revision comments, reject reasons
- [x] Timeline, status badge, approval panel, revision panel
- [x] Unit tests passing (11/11)
- [x] Audit completed — no internal rule bypass; adoption gap documented
- [x] Backward compatibility verified — existing reports unaffected
- [ ] **Adoption** (wiring entities through the engine) — recommended next step, §4, out of scope
