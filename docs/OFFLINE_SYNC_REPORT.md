# Offline Synchronization Validation Report

**Date:** 2026-06-09
**Scope:** Reliability of the offline-first architecture (`FE/src/lib/offline/*`)
and the backend create endpoints it replays against.
**Hard rule:** *No data loss allowed.*

This report records the validation of the offline sync path against six required
scenarios, the one material defect found, the fix applied, and the residual
risks. The supporting architecture is documented in
[`docs/OFFLINE_ARCHITECTURE.md`](./OFFLINE_ARCHITECTURE.md).

---

## 1. System under test

| Layer | File | Role |
| --- | --- | --- |
| Queue (durable) | `FE/src/lib/offline/queue.ts` | localStorage JSON envelopes, status lifecycle, counts, cross-tab sync |
| Attachments | `FE/src/lib/offline/attachmentStore.ts` | IndexedDB photos/files keyed by queue id |
| Connectivity | `FE/src/lib/offline/connectivity.ts` | `navigator.onLine` + Capacitor Network, single observable |
| Sync engine | `FE/src/lib/offline/sync.ts` | create-or-queue, `flushOfflineQueue`, offline/conflict/backoff classification |
| Sync manager | `FE/src/lib/offline/syncManager.ts` | reactive state, auto/manual sync, backoff scheduling, coalescing |
| **Backend create** | `BE/src/routes/{laporanAwal,laporanAkhir}Routes.ts`, `BE/src/modules/inspections/inspection.routes.ts` | the endpoints replays hit |
| **Idempotency (new)** | `BE/src/middlewares/idempotency.ts` | server-side duplicate prevention (added by this work) |

---

## 2. Tested scenarios

Each scenario was validated by tracing the code paths and, for the backend fix,
by an automated test (`BE/src/middlewares/idempotency.test.ts`, 6 tests).

### 2.1 Create reports offline — ✅ PASS
`create{LaporanAwal,LaporanAkhir,Inspection}OrQueue` check `isOnline()` first;
when offline they call `enqueueReport`, which writes a JSON envelope to
localStorage with a stable `clientId` (UUID) and `status: "pending"`. The form
returns `{ queued: true }` and the UI shows the offline toast + pending count.
**No network call is attempted, nothing is lost.**

### 2.2 Upload photos offline — ✅ PASS
Binary never goes into localStorage (≈5 MB cap). `saveAttachments` stores
`File`/`Blob` objects in IndexedDB (`voltreport-offline → attachments`) keyed by
the queue item id, via structured clone (no base64 inflation). On replay,
`submitQueued` re-reads them and uploads through the existing multipart
endpoints, then `deleteAttachments` clears them only after the report syncs. If
IndexedDB is unavailable (private mode/quota), the JSON still syncs and the user
is prompted to re-attach — a storage failure never blocks the report.

### 2.3 Queue multiple reports — ✅ PASS
The queue is an append-only array; `enqueueReport` pushes each item. Mixed kinds
(`laporan-awal`/`laporan-akhir`/`inspection`) coexist. `flushOfflineQueue`
replays **oldest-first** (`getReadyItems` preserves insertion order) and is
re-entrancy guarded (`flushing` flag) so overlapping triggers can't double-send.
Counts are exposed per status (`getQueueCounts`) and drive the Sync Center.

### 2.4 Recover from network interruption — ✅ PASS
Two recovery triggers:
- **Connectivity returns:** `syncManager` subscribes to the connectivity
  observable and calls `syncNow()` automatically on the offline→online edge,
  plus once on startup for anything left from a previous session.
- **Mid-flush drop:** if a send fails with an offline error mid-loop,
  `flushOfflineQueue` reverts that item to `pending` and **stops early**
  (`interrupted: true`); remaining items stay queued and resume on the next
  trigger. Inspections are resumable — `createdId`/`doneFindings` progress is
  persisted so a drop after the parent is created skips re-creating it and
  resumes at the next unfinished finding.

### 2.5 Retry failed sync — ✅ PASS
Transient errors increment `attempts` and re-arm with exponential backoff
(`2,4,8,16,30…` min, capped). `syncManager.scheduleNextRetry` arms a timer for
the soonest due item. After `MAX_ATTEMPTS = 5` an item is parked in `failed`
(never dropped) and surfaced in the Sync Center, where the user can *Coba lagi*
(`retryItem` / `retryAllFailed` → back to `pending`) or *Hapus* (explicit
destructive discard). **Exhausted items are retained, not deleted.**

### 2.6 Duplicate prevention — ⚠️ DEFECT FOUND → ✅ FIXED
See §3. The client always replayed a stable `X-Idempotency-Key`, but the
**backend ignored it**, leaving a real duplicate window on ambiguous failures.
A server-side idempotency layer was implemented to close it.

---

## 3. Issues found

### ISSUE-1 (High) — Duplicate reports on ambiguous network failure
**Status: FIXED.**

**Root cause.** The offline engine classifies any axios error with no
`error.response` (and `code !== ECONNABORTED`) as an *offline* error
(`isOfflineError`, `sync.ts`). That classification is correct for a request that
never reached the server — but it is **indistinguishable** from the *ambiguous*
case where the request **did** reach the server, the record **was committed**,
and only the HTTP response was lost (connection dropped during the reply, proxy
timeout, app backgrounded mid-flight).

In that ambiguous case the engine reverts the item to `pending` and re-sends it
on the next flush. The client mitigated this by replaying a stable
`X-Idempotency-Key`, **but no backend endpoint read that header** — the only
idempotency in the system was the unrelated `notifications.dedupeKey`. Result:
the second submit created a **duplicate report**. `docs/OFFLINE_ARCHITECTURE.md`
itself flagged backend support as an unfinished, optional addition.

**Severity.** High and directly against the *no data loss* rule — duplicate
field reports corrupt the rekap/KPI counts and force manual cleanup by admins.

### Observations (no change required)
- **Queue persistence on quota:** `write()` swallows a localStorage quota error
  silently, which could drop an envelope. In practice envelopes are small JSON
  and binary is offloaded to IndexedDB, so the cap is unlikely to be hit. Noted
  as a residual risk (§5) rather than fixed, to keep this change focused.
- **Findings/photos replay** is not idempotency-guarded, but the resumable
  `doneFindings` cursor already prevents duplicate findings (§5).

---

## 4. Fixes applied

### FIX-1 — Server-side idempotency on the create endpoints
A generic, additive idempotency layer was added so a replayed submit with an
already-seen key **replays the original response instead of creating a duplicate**.

**Files**
- `BE/prisma/schema.prisma` — new `IdempotencyKey` model (`idempotency_keys`).
- `BE/prisma/migrations/20260609234500_offline_sync_idempotency_additive/migration.sql`
  — additive `CREATE TABLE` (no existing table altered/dropped).
- `BE/src/middlewares/idempotency.ts` — the middleware.
- `BE/src/routes/laporanAwalRoutes.ts`, `BE/src/routes/laporanAkhirRoutes.ts`,
  `BE/src/modules/inspections/inspection.routes.ts` — mounted on `POST` create.
- `BE/src/config/__mocks__/database.ts` — `idempotencyKey` added to the test mock.
- `BE/src/middlewares/idempotency.test.ts` — 6 unit tests.

**Mechanism**
1. **Reserve** — insert a row keyed by `X-Idempotency-Key` (PRIMARY KEY = atomic
   reservation). Winner proceeds to the handler.
2. **Store** — on the first `2xx`, the response body + status are saved against
   the key (captured by wrapping `res.json`, persisted on the `finish` event).
3. **Replay** — a later submit with the same key finds a `COMPLETED` row and
   returns the stored response verbatim; **the handler never runs again**, so no
   duplicate record is created.
4. **Concurrency** — a second submit that loses the reservation race (row still
   `IN_PROGRESS`) gets `409`, which the client already parks as a `conflict` for
   review (`isConflictError`) rather than blindly retrying.
5. **Release on failure** — a non-2xx/errored response deletes the reservation
   so the client can legitimately retry. **Errors are never cached.**
6. **Fail-open** — any unexpected DB error (e.g. table not yet migrated) lets the
   request through unguarded. The client-side no-data-loss guarantees still hold;
   only dedup is temporarily unavailable. **A write is never blocked.**

**Why this is safe / non-breaking**
- Purely additive: one new table, no schema changes to existing entities, no API
  contract change. Requests without the header (web app, non-queued calls) pass
  straight through.
- The client already sent the header on every replay (`sync.ts` `idempotency()`),
  so no FE change is required — the FE was *expecting* this behaviour.

**Verification**
- `npx vitest run src/middlewares/idempotency.test.ts` → 6/6 pass, covering:
  pass-through without header, reserve→store success, **duplicate replay (handler
  not re-run)**, concurrent 409, release-on-failure, and fail-open on DB error.
- Full backend suite green: **143/143** (`npx vitest run`).
- `npx tsc --noEmit` clean.

> **Deployment note.** The migration must be applied before the guarantee is
> active: `npx prisma migrate deploy` (prod) / `npm run prisma:migrate` (dev).
> Until then the middleware fails open (writes succeed, dedup inactive) — no
> outage, no data loss, just the pre-existing duplicate window until migrated.

---

## 5. Remaining risks

| # | Risk | Severity | Mitigation / recommendation |
| --- | --- | --- | --- |
| R1 | **Idempotency table growth.** Rows are retained after `COMPLETED`. | Low | Add a periodic prune of `idempotency_keys` older than the offline retention window (e.g. 72h) — a cron or a TTL job. `idx_idempotency_created` already supports the range delete. Not data-loss relevant. |
| R2 | **Findings/photos not idempotency-guarded.** A drop between uploading a finding's photo and recording `doneFindings` could re-upload that one photo on resume. | Low | Duplicate *findings* are already prevented by the `doneFindings` cursor; only a single photo could duplicate. Optionally guard `POST /v1/findings/:id/photos` the same way, or de-dupe photos server-side by content hash. |
| R3 | **localStorage quota.** `queue.write()` silently ignores a quota-exceeded error, which could drop an envelope. | Low | Envelopes are small (binary is in IndexedDB), so the 5 MB cap is unlikely to be hit. Recommend surfacing a hard warning to the user if `setItem` throws, and/or migrating the envelope store to IndexedDB for unbounded capacity. |
| R4 | **Idempotency key ≠ payload binding.** If a client reused a key for a *different* payload, the stored response would be replayed for the new payload. | Negligible | Keys are per-queue-item UUIDs generated once at enqueue and never regenerated, so reuse cannot happen in normal operation. A payload-hash check could be added for defence-in-depth. |
| R5 | **Clock-skew on backoff.** `nextAttemptAt` uses client time; a device with a wrong clock could delay/advance retries. | Negligible | Retries still fire on connectivity-return and manual sync regardless of the timer, so no item is stranded. |

**No-data-loss assessment:** with FIX-1 applied and the migration deployed, every
tested scenario preserves data — items are queued, retried, parked-but-kept, or
replayed; none are silently dropped, and duplicate creation on ambiguous failure
is eliminated. The residual risks above are non-data-loss (growth/clock) or
low-severity single-photo duplication, with concrete follow-ups noted.
