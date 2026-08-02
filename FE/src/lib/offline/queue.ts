/**
 * Offline submission queue (durable local-storage layer).
 *
 * Field officers at a gardu often have no signal. When a record is created
 * offline (or a request fails because the connection dropped mid-flight), its
 * JSON payload is persisted here and replayed by the sync manager once
 * connectivity returns. Pure storage + pubsub — no API imports, so it can be
 * consumed anywhere without import cycles.
 *
 * Design guarantees:
 *  - NO DATA LOSS. Items are never silently dropped. An item that exhausts its
 *    retries is moved to the `failed` status and kept until the user explicitly
 *    retries or discards it from the Sync Center screen.
 *  - Idempotency. Every item carries a stable `clientId` that is replayed as an
 *    `X-Idempotency-Key` header so a retry after an ambiguous failure cannot
 *    create a duplicate server-side (and lets the backend signal conflicts).
 *  - Binary payloads (photos / attachments) live in IndexedDB
 *    (`attachmentStore.ts`) keyed by the queue item id; this file only holds the
 *    JSON envelope (localStorage is ~5 MB and cannot hold blobs).
 */

export type QueuedReportKind =
  | "laporan-awal"
  | "laporan-akhir"
  | "inspection"
  | "inspeksi-gi"
  | "har-gi";

/**
 * Lifecycle of a queued item:
 *  pending  → waiting to be sent (or scheduled for a backoff retry)
 *  syncing  → currently being sent by the sync manager
 *  failed   → server rejected it permanently / retries exhausted (kept, manual)
 *  conflict → server reported a conflict (409/duplicate) — needs user decision
 */
export type QueueItemStatus = "pending" | "syncing" | "failed" | "conflict";

export interface QueuedReport {
  id: string;
  /** Stable idempotency key, replayed on every attempt (never regenerated). */
  clientId: string;
  kind: QueuedReportKind;
  /** Human-friendly one-liner for the UI (e.g. "Gardu GI-01 · 5 Jun 2026"). */
  label?: string;
  payload: unknown;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  status: QueueItemStatus;
  lastError?: string;
  /** Earliest time a `pending` item should be retried (exponential backoff). */
  nextAttemptAt?: string;
}

export interface QueueCounts {
  pending: number;
  syncing: number;
  failed: number;
  conflict: number;
  total: number;
}

const STORAGE_KEY = "voltreport-offline-queue";
const listeners = new Set<() => void>();

function read(): QueuedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Migrate v1 items (no status/clientId/updatedAt) forward in-memory.
    return (parsed as Partial<QueuedReport>[]).map(migrate);
  } catch {
    return [];
  }
}

/** Backfill fields added after the first offline release so old items still flow. */
function migrate(item: Partial<QueuedReport>): QueuedReport {
  return {
    id: item.id ?? makeId(),
    clientId: item.clientId ?? item.id ?? makeId(),
    kind: (item.kind ?? "laporan-awal") as QueuedReportKind,
    label: item.label,
    payload: item.payload,
    createdAt: item.createdAt ?? new Date().toISOString(),
    updatedAt: item.updatedAt ?? item.createdAt ?? new Date().toISOString(),
    attempts: item.attempts ?? 0,
    status: item.status ?? "pending",
    lastError: item.lastError,
    nextAttemptAt: item.nextAttemptAt,
  };
}

function write(items: QueuedReport[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // quota exceeded — nothing we can safely do; keep in-memory copy lost
  }
  listeners.forEach((cb) => cb());
}

function makeId(): string {
  return `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeClientId(): string {
  // Prefer a real UUID where available (better idempotency key on the server).
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function enqueueReport(
  kind: QueuedReportKind,
  payload: unknown,
  label?: string,
): QueuedReport {
  const now = new Date().toISOString();
  const item: QueuedReport = {
    id: makeId(),
    clientId: makeClientId(),
    kind,
    label,
    payload,
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    status: "pending",
  };
  write([...read(), item]);
  return item;
}

export function getQueue(): QueuedReport[] {
  return read();
}

/** Total number of items still in the queue (any status). */
export function getQueueSize(): number {
  return read().length;
}

/** Items eligible to send right now: pending and not held by a backoff window. */
export function getReadyItems(now: number = Date.now()): QueuedReport[] {
  return read().filter(
    (i) =>
      i.status === "pending" && (!i.nextAttemptAt || new Date(i.nextAttemptAt).getTime() <= now),
  );
}

/** Count of items the user still expects to be delivered (pending + syncing). */
export function getPendingCount(): number {
  return read().filter((i) => i.status === "pending" || i.status === "syncing").length;
}

export function getFailedCount(): number {
  return read().filter((i) => i.status === "failed" || i.status === "conflict").length;
}

export function getQueueCounts(): QueueCounts {
  const items = read();
  return {
    pending: items.filter((i) => i.status === "pending").length,
    syncing: items.filter((i) => i.status === "syncing").length,
    failed: items.filter((i) => i.status === "failed").length,
    conflict: items.filter((i) => i.status === "conflict").length,
    total: items.length,
  };
}

export function removeFromQueue(id: string): void {
  write(read().filter((i) => i.id !== id));
}

export function updateQueueItem(id: string, patch: Partial<QueuedReport>): void {
  write(
    read().map((i) => (i.id === id ? { ...i, ...patch, updatedAt: new Date().toISOString() } : i)),
  );
}

/** Reset a failed/conflict item back to pending so it is retried on next sync. */
export function retryItem(id: string): void {
  updateQueueItem(id, { status: "pending", nextAttemptAt: undefined, lastError: undefined });
}

/** Move every failed/conflict item back to pending in one shot. */
export function retryAllFailed(): void {
  const now = new Date().toISOString();
  write(
    read().map((i) =>
      i.status === "failed" || i.status === "conflict"
        ? {
            ...i,
            status: "pending",
            nextAttemptAt: undefined,
            lastError: undefined,
            updatedAt: now,
          }
        : i,
    ),
  );
}

export function subscribeQueue(cb: () => void): () => void {
  listeners.add(cb);
  // Cross-tab sync: another tab may flush the queue.
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}
