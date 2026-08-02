# Offline‑First Mobile Architecture

> Field officers (PETUGAS) inspect gardu where there is often no cellular signal.
> VoltHub must let them capture **Laporan Awal**, **Laporan Akhir** and
> **Inspeksi** — including photos and attachments — entirely offline, then sync
> automatically and losslessly when connectivity returns.

This document describes the offline storage, synchronization, connectivity and
UI layers, and the three hard rules they uphold:

| Rule | How it is guaranteed |
| --- | --- |
| **No data loss** | Items are never silently dropped. Exhausted/rejected items move to `failed`/`conflict` and are kept until the user retries or explicitly discards them. Photos live in IndexedDB until their report is confirmed synced. |
| **Preserve existing APIs** | No backend endpoint or contract changed. Replays hit the same `/laporan-awal`, `/laporan-akhir`, `/v1/inspections`, `/v1/findings/:id/photos` endpoints. The only addition is an *optional* `X-Idempotency-Key` request header (ignored by servers that don't read it). |
| **Large photo uploads** | Binary lives in IndexedDB (not localStorage), survives reloads via structured clone, and uploads via the existing multipart endpoints one file/finding at a time so a single huge photo never blocks the rest. |

---

## 1. Layered overview

```
        ┌──────────────────────────── UI ────────────────────────────┐
        │ OfflineIndicator (banner + sync pill)   Sync Center screen  │
        │ SyncStatusBadge                         (/sync)             │
        └───────▲───────────────────────────────────────▲────────────┘
                │ hooks                                   │ hooks
   useOnlineStatus / useConnectivity   useSyncState / useOfflineQueue
   useOfflineQueueCount / useFailedSyncCount / useQueueCounts
                │                                         │
        ┌───────┴─────────────────── Sync Manager ───────┴───────────┐
        │ syncManager.ts  — reactive state, auto/manual sync, backoff │
        └───────▲────────────────────────────▲──────────────────────┘
                │                              │
       connectivity.ts                     sync.ts (engine)
   (Capacitor Network +              create*OrQueue · flushOfflineQueue
    navigator.onLine)                conflict/offline classification
                                            │            │
                              ┌─────────────┘            └───────────┐
                         queue.ts                            attachmentStore.ts
                  (localStorage: JSON envelopes)        (IndexedDB: photos/files)
```

Every reactive source is exposed through `useSyncExternalStore`, so the UI never
polls — it re‑renders only on real state transitions, and stays consistent
across browser tabs (the queue listens to the `storage` event).

---

## 2. Local storage layer

### 2.1 Queue — `src/lib/offline/queue.ts`

The durable list of work, persisted in **localStorage** under
`voltreport-offline-queue`. Holds only JSON envelopes (no binary).

```ts
interface QueuedReport {
  id: string;            // local queue id (also the IndexedDB attachment key)
  clientId: string;      // stable idempotency key (UUID), never regenerated
  kind: "laporan-awal" | "laporan-akhir" | "inspection";
  label?: string;        // human one-liner for the UI
  payload: unknown;      // the create body (+ inspection replay progress)
  createdAt; updatedAt;  // ISO timestamps
  attempts: number;
  status: "pending" | "syncing" | "failed" | "conflict";
  lastError?: string;
  nextAttemptAt?: string; // backoff gate for pending items
}
```

Item lifecycle:

```
 enqueue ─▶ pending ──(send)──▶ syncing ──success──▶ removed
                ▲                   │
                │ backoff retry     ├─ offline ──▶ pending (resume later)
                └───────────────────┤
                                    ├─ transient err ─▶ pending (+attempts, backoff)
                                    │      …after MAX_ATTEMPTS ─▶ failed
                                    └─ 409 conflict ─────────────▶ conflict
 failed/conflict ──(user: retry)──▶ pending
 failed/conflict ──(user: discard)─▶ removed (+ attachments deleted)
```

**Forward migration:** `read()` runs every persisted item through `migrate()`,
so envelopes written by the original offline release (no `status`/`clientId`)
keep working after upgrade — they default to `pending` with a fresh client id.

### 2.2 Attachment store — `src/lib/offline/attachmentStore.ts`

Photos and attachments are stored in **IndexedDB** (`voltreport-offline` →
`attachments`), keyed by the queue item id. `File`/`Blob` survive IndexedDB's
structured clone, so there is **no base64 inflation** — large field photos are
stored as‑is.

```ts
interface QueuedAttachments {
  dokumentasi?: File[];                 // Laporan Awal (all-in-one bucket)
  logger?: File[]; sld?: File[];        // Laporan Akhir (categorized buckets)
  dokumentasiHasil?: File[];
  findings?: QueuedFinding[];           // Inspeksi: finding + optional photo each
}
```

If IndexedDB is unavailable (private mode / quota), the report still syncs; only
the photos are skipped and the officer is prompted to re‑attach — the JSON is
never blocked by a storage failure.

---

## 3. Connectivity monitoring — `src/lib/offline/connectivity.ts`

A single observable that the whole app treats as the source of truth.

- **Web:** `navigator.onLine` + `online`/`offline` window events.
- **Native (Capacitor):** the `@capacitor/network` plugin, which reflects the
  real OS radio state (the WebView's `onLine` is unreliable on device) and the
  connection **type** (`wifi` / `cellular` / `none`).

The plugin is imported lazily and guarded, so the web bundle has zero hard
dependency on a native runtime. Consumers use `useOnlineStatus()` /
`useConnectivity()`; the engine uses the synchronous `isOnline()`.

---

## 4. Synchronization

### 4.1 Sync engine — `src/lib/offline/sync.ts`

The engine does the actual work; it does **not** decide *when* to run (that is
the manager's job).

**Create‑or‑queue** (called by the forms):
`createLaporanAwalOrQueue`, `createLaporanAkhirOrQueue`, `createInspectionOrQueue`.
Each tries the live API when online and falls back to the queue when offline
**or** when the request fails with an offline error.

**`flushOfflineQueue(): FlushResult`** replays every *ready* item oldest‑first
and classifies each outcome:

| Outcome | Detection | Action |
| --- | --- | --- |
| success | 2xx | remove item, delete attachments |
| offline | no HTTP response / `navigator` offline | revert to `pending`, **stop early**, resume later |
| conflict | HTTP `409` | park in `conflict` (needs user decision) |
| transient | any other error | `attempts++`, exponential backoff (`2,4,8,16,30…` min); after `MAX_ATTEMPTS=5` park in `failed` |

It returns `{ synced, failed, conflicts, interrupted }` and is re‑entrancy
guarded.

**Conflict detection & idempotency.** Every replay carries
`X-Idempotency-Key: <clientId>`. Because the key is stable across retries, a
retry after an *ambiguous* failure (server processed the request but the
response was lost) cannot create a duplicate — a backend honouring the key
returns the original record or a `409`, which the engine surfaces as a
`conflict` for the user to review rather than blindly retrying.

**Resumable inspections (partial‑failure safety).** An inspection is multi‑step
(create inspection → add findings → upload each finding's photo). The queued
payload tracks progress (`createdId`, `doneFindings`). If the connection drops
after the inspection is created but before all photos upload, the next replay
**skips** the already‑created parent and resumes at the next unfinished finding —
no duplicate inspections, no lost findings.

### 4.2 Sync manager — `src/lib/offline/syncManager.ts`

The single orchestrator and the reactive state the UI binds to:

```ts
interface SyncState {
  status: "idle" | "syncing" | "offline" | "error";
  online: boolean;
  lastSyncAt?: string;
  lastError?: string;
  lastResult?: FlushResult;
}
```

- **Auto sync** — flushes on startup, whenever connectivity returns, and when
  new work is enqueued while online.
- **Manual sync** — `syncNow({ manual: true })` from the Sync Center button and
  the indicator pill.
- **Backoff scheduling** — after each flush it arms a timer for the soonest
  backed‑off item so transient failures retry on their own.
- **Coalescing** — concurrent requests fold into the in‑flight run; a request
  that arrives mid‑flush triggers exactly one follow‑up run.

`initSyncManager()` is idempotent and booted once from `OfflineIndicator`
(mounted in `__root`).

---

## 5. UI

| Surface | File | Behaviour |
| --- | --- | --- |
| **Offline indicator** | `components/OfflineIndicator.tsx` | Top banner when offline (with pending count); bottom‑left pill while syncing (tap to force sync); red "N data perlu perhatian" pill linking to the Sync Center when items fail; per‑run toasts. |
| **Sync status badge** | `components/SyncStatusBadge.tsx` | Per‑item chip: Menunggu / Menyinkronkan / Gagal / Konflik. |
| **Sync Center / Failed‑sync screen** | `routes/_app.sync.tsx` (`/sync`) | Online/offline + counts banner, "Sinkron sekarang", a **Perlu perhatian** list (failed/conflict with per‑item *Coba lagi* / *Hapus*) and an **Dalam antrean** list. Empty state when all clear. Linked from the sidebar for every role. |

### Hooks
`useOnlineStatus` / `useConnectivity` · `useSyncState` / `useOfflineQueue` ·
`useOfflineQueueCount` / `useFailedSyncCount` / `useQueueCounts`.

---

## 6. End‑to‑end flow (Inspeksi offline → online)

1. Officer opens **Inspeksi → Buat Inspeksi** in a dead zone and saves.
2. `createInspectionOrQueue` sees `isOnline() === false` → `enqueueReport`
   writes the JSON envelope to localStorage; findings/photos go to IndexedDB.
   Toast: *"Inspeksi disimpan offline"*. The bottom pill shows the pending count.
3. Signal returns → `connectivity` fires → `syncManager` runs `syncNow()`.
4. `flushOfflineQueue` replays with the idempotency header: creates the
   inspection, then each finding + photo, recording progress as it goes.
5. On success the item and its photos are removed; toast: *"1 data offline
   berhasil dikirim"*. On a `409` it lands in the Sync Center under **Konflik**;
   on repeated transient errors, under **Gagal** — always recoverable, never lost.

---

## 7. File map

```
FE/src/lib/offline/
  queue.ts            durable JSON queue (localStorage) + status lifecycle + counts
  attachmentStore.ts  IndexedDB photos/attachments (incl. inspection findings)
  connectivity.ts     Capacitor Network + navigator unified online source
  sync.ts             create-or-queue + flush engine (conflict/offline/backoff)
  syncManager.ts      orchestrator: reactive state, auto/manual sync, scheduling
FE/src/hooks/
  useOnlineStatus.ts      useOnlineStatus / useConnectivity
  useSyncState.ts         useSyncState / useOfflineQueue
  useOfflineQueueCount.ts useOfflineQueueCount / useFailedSyncCount / useQueueCounts
FE/src/components/
  OfflineIndicator.tsx    global banner + sync pill + toasts (boots the manager)
  SyncStatusBadge.tsx     per-item status chip
FE/src/routes/
  _app.sync.tsx           Sync Center / failed-sync screen (/sync)
```

Backend‑side idempotency (implemented — `BE/src/middlewares/idempotency.ts`):
the create endpoints (`/laporan-awal`, `/laporan-akhir`, `/v1/inspections`) now
honour `X-Idempotency-Key`. The key is reserved before the handler runs and the
success response is stored against it, so an ambiguous retry (server committed
but the response was lost) replays the stored response instead of creating a
duplicate. See `docs/OFFLINE_SYNC_REPORT.md` for the validation and the gap this
closed.
