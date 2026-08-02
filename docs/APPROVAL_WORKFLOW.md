# Enterprise Approval Workflow

Complete report approval lifecycle for VoltHub. A generic, **entity-agnostic**
state machine with transition validation, role-based guards, and an immutable
audit trail. It is **additive and backward compatible** — no existing table,
column, or report behaviour changes.

- **Backend:** `BE/src/modules/workflow/`
- **Frontend:** `FE/src/lib/v2/workflow.ts`, `FE/src/features/v2/workflow/`, `FE/src/components/v2/{WorkflowStatusBadge,WorkflowTimeline,ApprovalPanel,RevisionPanel}.tsx`
- **Schema:** `workflow_instances`, `workflow_transitions` (migration `20260605000000_approval_workflow_additive`)
- **API base:** `/api/v1/workflow`

---

## 1. Lifecycle

```
 DRAFT ──submit──▶ SUBMITTED ──review──▶ REVIEWED ──approve──▶ APPROVED ──close──▶ CLOSED
                      │                      │                     │                  ▲
       request_revision│      request_revision│               reject│                  │
                      ▼                      ▼                     ▼            close   │
                REVISION_REQUIRED ◀──────────┘                 REJECTED ───────────────┘
                      │
                      └── submit (resubmit) ──▶ SUBMITTED
```

### States

| State | Meaning | Terminal |
|---|---|---|
| `DRAFT` | Being prepared by the author. Default for a new/implicit instance. | no |
| `SUBMITTED` | Submitted by PETUGAS; awaiting supervisor review. | no |
| `REVIEWED` | Reviewed by a supervisor; awaiting approval decision. | no |
| `REVISION_REQUIRED` | Sent back to the author with a reason. | no |
| `APPROVED` | Approved by ADMIN_UP3 / MANAGER. | no |
| `REJECTED` | Rejected with a reason. | no |
| `CLOSED` | Archived. **Terminal** — no further transitions. | **yes** |

### Actions & transitions (the only valid moves)

| Action | From → To | Allowed actors | Reason required |
|---|---|---|---|
| `SUBMIT` | `DRAFT`, `REVISION_REQUIRED` → `SUBMITTED` | PETUGAS | no |
| `REVIEW` | `SUBMITTED` → `REVIEWED` | SUPERVISOR | no |
| `REQUEST_REVISION` | `SUBMITTED`, `REVIEWED` → `REVISION_REQUIRED` | SUPERVISOR, ADMIN_UP3 | **yes** |
| `APPROVE` | `REVIEWED` → `APPROVED` | ADMIN_UP3, MANAGER | no (comment optional) |
| `REJECT` | `SUBMITTED`, `REVIEWED` → `REJECTED` | ADMIN_UP3, MANAGER | **yes** |
| `CLOSE` | `APPROVED`, `REJECTED` → `CLOSED` | ADMIN_UP3, MANAGER | no |

Any (action, fromState) pair **not** in this table is rejected as
`INVALID_TRANSITION`. The single source of truth is
[`workflow.config.ts`](../BE/src/modules/workflow/workflow.config.ts); the
frontend mirror in [`lib/v2/workflow.ts`](../FE/src/lib/v2/workflow.ts) is kept
identical so the UI never offers an action the server would refuse.

---

## 2. Actors & role mapping

The workflow models four enterprise actors:

`PETUGAS` · `SUPERVISOR` · `ADMIN_UP3` · `MANAGER`

The deployed auth system uses the canonical **3-role** set
(`SUPER_ADMIN`, `ADMIN`, `PETUGAS`; legacy `ADMIN_RTUPP`/`SUPERADMIN` normalize
into it — see [`BE/src/auth/roles.ts`](../BE/src/auth/roles.ts)). The four
enterprise actors are resolved from canonical roles via `ACTOR_CANONICAL_ROLES`:

| Enterprise actor | Canonical roles that may act as it |
|---|---|
| `PETUGAS` | PETUGAS, ADMIN, SUPER_ADMIN |
| `SUPERVISOR` | ADMIN, SUPER_ADMIN |
| `ADMIN_UP3` | ADMIN, SUPER_ADMIN |
| `MANAGER` | ADMIN, SUPER_ADMIN |

This is the only place that knows about the org hierarchy. When the
authorization system later splits `ADMIN` into distinct reviewer roles, **only
this map changes** — the state machine, guards, services and UI are untouched.

---

## 3. Backend design

```
workflow.config.ts      State machine: states, actions, actors, transition table,
                        actor↔role mapping. Pure data + helpers. Single source of truth.
workflow.guards.ts      evaluateTransition(): pure validation → ok | {code, message}.
workflow.validation.ts  Zod schemas for the HTTP edge.
workflow.repository.ts   Prisma access; applyTransition() = state update + log row in ONE tx.
workflow.audit.ts        Mirrors each transition into the canonical audit_logs table.
workflow.service.ts     Orchestration: ensureInstance, getStatus, performAction, history.
workflow.controller.ts  Thin Express handlers (shared { success, message, data, meta } envelope).
workflow.routes.ts      Routes mounted at /api/v1/workflow.
workflow.guards.test.ts  11 unit tests covering the state machine + guards.
```

### Transition guard (requirement 2, 7)

`evaluateTransition({ action, fromState, role, reason })` enforces, in order:

1. **Terminal** — no transitions out of `CLOSED` → `TERMINAL`.
2. **Valid transition** — `(action, fromState)` must exist → else `INVALID_TRANSITION`.
3. **Role** — caller's canonical role must map to a permitted actor → else `FORBIDDEN_ROLE`.
4. **Reason** — `REJECT`/`REQUEST_REVISION` require non-empty `reason` → else `REASON_REQUIRED`.

The service maps `FORBIDDEN_ROLE` → HTTP **403**, the rest → HTTP **422**.

### Audit trail (requirements 3, 8)

Every transition writes an **append-only** `workflow_transitions` row capturing
**user, role, action, from-state, to-state, comment, reason, timestamp**. The
state update and the log row are written in a **single transaction**
(`applyTransition`), so an instance can never advance without its trail (or vice
versa). Each transition is additionally mirrored into the canonical
`audit_logs` table (`entityType = "Workflow:<EntityType>"`, action
`STATUS_CHANGE`) for the central audit view.

`workflow_transitions` is never updated or deleted by application code
(immutable by policy, consistent with BR-018).

### Comments & reasons (requirements 4, 5, 6)

- `comment` — optional contextual note attached to any action (e.g. an approval note).
- `reason` — mandatory free-text for `REJECT` and `REQUEST_REVISION` (the
  rejection reason / revision request), surfaced to the author in the Revision Panel.

---

## 4. API

All routes require authentication (`Bearer` token). The HTTP layer is
deliberately permissive; the **transition guard is the real authorizer**.

| Method | Path | Purpose | Access |
|---|---|---|---|
| `GET` | `/api/v1/workflow/definition` | State machine (states, actors, transitions) | any auth |
| `GET` | `/api/v1/workflow/transitions` | Cross-entity transition audit feed (paginated) | ADMIN, SUPER_ADMIN |
| `POST` | `/api/v1/workflow/instances` | Create/seed an instance (optional; actions auto-create) | any auth |
| `GET` | `/api/v1/workflow/:entityType/:entityId` | Current state + actions for caller + history | any auth |
| `GET` | `/api/v1/workflow/:entityType/:entityId/history` | Full transition log | any auth |
| `POST` | `/api/v1/workflow/:entityType/:entityId/transition` | Perform an action | any auth (guarded) |

### Perform a transition

```http
POST /api/v1/workflow/LaporanAwal/9d1f.../transition
Authorization: Bearer <token>
Content-Type: application/json

{ "action": "REQUEST_REVISION", "reason": "Data tegangan nominal tidak sesuai" }
```

Success `200`:

```json
{
  "success": true,
  "message": "Workflow REVISION_REQUIRED",
  "data": { "fromState": "SUBMITTED", "toState": "REVISION_REQUIRED",
            "instance": { "...": "..." }, "transition": { "...": "..." } }
}
```

Guard failures: `403` (`FORBIDDEN_ROLE`) or `422`
(`INVALID_TRANSITION` / `REASON_REQUIRED` / `TERMINAL`).

### Status response (drives the UI)

`GET /api/v1/workflow/:entityType/:entityId` returns `currentState`,
`isTerminal`, `availableActions` (already filtered to the caller's role), and
the full `history` — so the frontend renders exactly the buttons the user may
click.

---

## 5. Frontend

| Piece | File | Role |
|---|---|---|
| Status badge | `components/v2/WorkflowStatusBadge.tsx` | Coloured badge per state |
| Workflow timeline | `components/v2/WorkflowTimeline.tsx` | Renders the transition log (actor, role, reason, comment) |
| Approval panel | `components/v2/ApprovalPanel.tsx` | Reviewer surface — shows only permitted actions; reason/comment inputs |
| Revision panel | `components/v2/RevisionPanel.tsx` | Author surface — shows latest reviewer reason + "Ajukan Ulang" (resubmit) |
| State machine mirror | `lib/v2/workflow.ts` | States/actions/actors/labels/styles + `allowedActionsFor` |
| API hooks | `features/v2/workflow/resource.ts` | `useWorkflowStatus`, `useWorkflowTransition` |

Drop-in usage on any report/inspection/HAR detail page:

```tsx
<WorkflowStatusBadge state={status.currentState} />
<ApprovalPanel entityType="LaporanAwal" entityId={report.id} />
<RevisionPanel entityType="LaporanAwal" entityId={report.id} />
<WorkflowTimeline transitions={status.history} />
```

Both panels self-fetch via `useWorkflowStatus` and invalidate the cache on a
successful transition, so badge/timeline/panels stay in sync.

---

## 6. Backward compatibility

- **No existing table or column is altered or dropped.** The workflow lives in
  two new tables keyed by `(entityType, entityId)`.
- The legacy `ReportStatus` columns on `laporan_awal` / `laporan_akhir`
  (`DRAFT/PENDING/APPROVED/REJECTED/REVISED`) and the V1 validate flow
  (`validateLaporanAwal`) **continue to work untouched**. Adopting the workflow
  for those reports is opt-in and incremental.
- A report with **no** workflow instance is treated as implicit `DRAFT`; the
  first `transition` (or `POST /instances`) lazily creates the instance, so
  existing reports need no backfill.
- The enterprise workflow is generic and can be attached to any V2 entity
  (reports, inspections, HAR, tickets) by passing its `entityType`/`entityId`.

---

## 7. Data model

```
workflow_instances
  id, entityType, entityId, currentState (enum), createdBy, createdAt, updatedAt
  UNIQUE (entityType, entityId)

workflow_transitions  (append-only)
  id, instanceId → workflow_instances.id (cascade),
  entityType, entityId, action,
  fromState (enum, nullable), toState (enum),
  performedBy → users.id (set null), performedByRole,
  comment, reason, performedAt
```

Migration: `BE/prisma/migrations/20260605000000_approval_workflow_additive/migration.sql`
(additive `CREATE TABLE` only). Apply with `npm run prisma:migrate` (or
`prisma migrate deploy` in production).

---

## 8. Tests

`BE/src/modules/workflow/workflow.guards.test.ts` — 11 passing unit tests:
actor↔role mapping, the happy path, resubmit, close-from-approved/rejected,
invalid transitions, forbidden role, terminal lock, mandatory reasons, and the
`availableActions` the UI consumes.

```bash
cd BE && npx vitest run src/modules/workflow
```
