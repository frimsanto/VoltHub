# Audit Trail Coverage

**Goal:** every business-critical action is traceable. For each audited action the
trail records **who** (user), **their role**, **what** (action), **when**
(timestamp), **which entity**, and **what changed** (before/after).

This document is the authoritative map of audit coverage across the eight
business-critical modules and explains the gaps that were closed.

---

## 1. Audit infrastructure

The platform has **two append-only (immutable) trails**. Both are written
exclusively through helper functions — services never `INSERT` audit rows
directly — which keeps the write format consistent and the tables append-only
(BR-018).

| Trail | Table / model | Helper | Scope |
|-------|---------------|--------|-------|
| **Canonical (V2)** | `audit_logs` / `AuditLog` | `recordAuditLog()` — [`src/utils/auditLog.ts`](../BE/src/utils/auditLog.ts) | Gardu-centric V2 domain (assets, documents, imports, reports, workflow, taxonomy, org) |
| **Activity (V1)** | `activity_logs` / `ActivityLog` | `recordAudit()` — [`src/utils/audit.ts`](../BE/src/utils/audit.ts) | Legacy reporting domain (users, teams, laporan awal/akhir, auth) |

Both helpers accept an optional Prisma transaction client so the audit write can
be made **atomic** with the audited mutation; without one the write is
best-effort and swallows errors so audit logging can never break a successful
request.

### The six required fields, by trail

| Required field | `audit_logs` (canonical) | `activity_logs` (legacy) |
|----------------|--------------------------|--------------------------|
| **User**       | `performedBy` (FK → `users.id`) | `userId` (FK → `users.id`) |
| **Role**       | resolved via `performer.role` join¹ | resolved via `user.role` join |
| **Action**     | `action` (`CREATE` / `UPDATE` / `DELETE` / `STATUS_CHANGE`) | `action` (`CREATE` … `LOGIN` / `LOGOUT` / `DOWNLOAD` …) |
| **Timestamp**  | `performedAt` (`@default(now())`) | `createdAt` (`@default(now())`) |
| **Entity**     | `entityType` + `entityId` | `entityType` + `entityId` (+ `laporanAwalId` / `laporanAkhirId`) |
| **Changes**    | `oldValue` + `newValue` (JSON snapshots) | `details` (JSON) |

¹ **Role** is not stored as a column; it is derived through the performer/user
foreign key at read time. The audit read APIs include it in the projection:
- Legacy: [`auditController`](../BE/src/controllers/auditController.ts) selects `user.role`.
- Canonical: [`audit-log.repository`](../BE/src/modules/audit-logs/audit-log.repository.ts) now selects `performer.role` (added as part of this work).

For status changes the **role-at-time** is additionally frozen into the
`newValue.role` snapshot (see workflow), giving a historical record independent
of later role changes.

---

## 2. Coverage matrix

| # | Module | Action(s) | Trail | Status |
|---|--------|-----------|-------|--------|
| 1 | **User** | create / update / delete / login / logout | `activity_logs` | ✅ pre-existing |
| 2 | **Team** | create / update / delete | `activity_logs` | ✅ pre-existing |
| 3 | **Reports — laporan (V1)** | create / submit / validate / reject | `activity_logs` | ✅ pre-existing |
| 3 | **Reports — generator (V2)** | generate (PDF/Excel) | `audit_logs` | 🟢 **added** |
| 4 | **Approval (workflow)** | every state transition | `audit_logs` (+ `workflow_transitions`) | ✅ pre-existing |
| 5 | **Assets** | create / update / delete (incl. asset move) | `audit_logs` | 🟢 **added** |
| 6 | **Documents** | create / delete | `audit_logs` | 🟢 **added** |
| 7 | **Import** | job completion (per job) | `audit_logs` | 🟢 **added** |
| 8 | **Notifications** | event dispatch | `notifications` table (self-logging) | ✅ by design — see §4 |

Supporting V2 modules already audited via `recordAuditLog` and unchanged:
asset categories, asset types, organizations, UP3s, tickets.

---

## 3. Changes implemented to close the gaps

All new logging follows the established service-layer pattern (audit immediately
after the successful repository mutation, `performedBy = userId` threaded from
the controller's `req.user.userId`).

### 3.1 Assets — [`asset.service.ts`](../BE/src/modules/assets/asset.service.ts)
- `create` → `CREATE` (`newValue` = created asset).
- `update` → `UPDATE` (`oldValue`/`newValue` snapshots). This satisfies
  **BR-008 (asset move must be audited)**: a location/feeder change is captured
  in the before/after snapshot.
- `remove` → `DELETE` (`oldValue` = the asset before soft-delete).
- `entityType: 'Asset'`.

### 3.2 Documents — [`document.service.ts`](../BE/src/modules/documents/document.service.ts)
- `create` → `CREATE` (`newValue` = created document, incl. `fileUrl`).
- `remove` → `DELETE` (`oldValue` = document before soft-delete).
- `entityType: 'Document'`.

### 3.3 Import — [`import.service.ts`](../BE/src/modules/imports/import.service.ts)
- One audit row **per import job** (`entityType: 'ImportJob'`, `action: CREATE`)
  written from the shared `runImport` runner, on both the normal-completion and
  parse-failure paths. `newValue` summarises `{ importType, fileName, totalRows,
  successRows, failedRows, status }`.
- **No per-row duplication:** entities created during the run (assets via
  `assetService.create`, gardu via `locationService.create`) are audited by
  *their own* services. The job-level row records the bulk operation; the
  per-entity rows record each resulting change. They are distinct
  `entityType`s, so there is no double-logging of the same action.

### 3.4 Reports generator (V2) — [`report.service.ts`](../BE/src/modules/reports/report.service.ts)
- `generate` → `CREATE` (`entityType: 'GeneratedReport'`), `newValue` =
  `{ reportNumber, sourceType, sourceId, format, version, title }`.
- Downloads are **not** logged to `audit_logs`: every download already inserts a
  `report_downloads` row (`downloadedBy`, `ipAddress`, timestamp) via
  `repo.recordDownload`, which is itself the download audit trail. Logging it
  again would be a duplicate.

### 3.5 Canonical read API — [`audit-log.repository.ts`](../BE/src/modules/audit-logs/audit-log.repository.ts)
- `performer` projection extended with `role`, so the **Role** field is present
  on every canonical audit record returned by `GET /api/v1/audit-logs`.

---

## 4. Self-logging modules (deliberately not double-audited)

Some modules are their own audit trail; mirroring them into `audit_logs` would
violate the "avoid duplicate logs / minimize performance impact" rules.

- **Notifications** — each dispatched event is persisted as a `notifications`
  row carrying recipient (`userId`), `type`, `entityType`/`entityId`, payload
  (`data`), and `createdAt`. The table *is* the event log. Read-state mutations
  (`markRead` / `markAllRead`) are low-value UI state and are not audited.
- **Approval workflow** — `workflow_transitions` is the primary immutable trail
  (actor, role, from/to state, comment, reason, timestamp). Transitions are
  *additionally* mirrored into `audit_logs` by
  [`workflow.audit.ts`](../BE/src/modules/workflow/workflow.audit.ts) so they
  appear in the central view — a deliberate, single mirror, not a duplicate of
  the same write.
- **Import errors** — per-row failures are captured in `import_errors`,
  complementing the job-level audit row.

---

## 5. Design rules honoured

**Avoid duplicate logs**
- Audit is written once, at the **service layer**, never in both controller and
  service.
- Each module uses a distinct `entityType`; bulk operations (import) log the
  job once and rely on the per-entity services for the individual changes.
- Already-logged flows (report downloads, notification dispatch, workflow
  transitions) are not re-logged into a second trail except for the single,
  intentional workflow→`audit_logs` mirror.

**Minimize performance impact**
- Audit writes reuse the in-request connection; no extra round-trips beyond a
  single `INSERT` per audited action.
- **Role** is derived via an existing FK join at read time — no extra column,
  no migration, no extra write.
- Standalone audit writes are best-effort and never block or fail the business
  request; transactional writes are used only where atomicity is required.
- Imports emit **one** summary row per job rather than a row per lifecycle step.

---

## 6. Verification

- `npx tsc --noEmit` passes for the backend after the changes.
- Manual check: each audited service call originates from a controller that
  threads `req.user.userId` into `performedBy`, so **User** is always populated;
  **Role** resolves via the performer join; **Timestamp** is DB-defaulted;
  **Entity** and **Changes** are set explicitly per call site above.
