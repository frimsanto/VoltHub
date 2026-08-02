/**
 * Sync manager — the single orchestrator for offline replay.
 *
 * Responsibilities:
 *  - Hold the reactive sync state the UI binds to (idle/syncing/offline/error,
 *    last sync time, last result).
 *  - Auto-sync: flush whenever connectivity returns, on startup, and when new
 *    work is queued while online.
 *  - Manual sync: `syncNow({ manual: true })` from the Sync Center button.
 *  - Backoff scheduling: after a flush, wake up again when the soonest
 *    backed-off item becomes due.
 *
 * It is the only module that *drives* `flushOfflineQueue`; everything else just
 * enqueues work or reads state. Pub/sub via `useSyncExternalStore`.
 */

import { flushOfflineQueue, type FlushResult } from "./sync";
import {
  subscribeConnectivity,
  getConnectivity,
  startConnectivityMonitoring,
} from "./connectivity";
import { subscribeQueue, getQueue, getReadyItems } from "./queue";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

export interface SyncState {
  status: SyncStatus;
  online: boolean;
  lastSyncAt?: string;
  lastError?: string;
  lastResult?: FlushResult;
}

let state: SyncState = {
  status: getConnectivity().online ? "idle" : "offline",
  online: getConnectivity().online,
};

const listeners = new Set<() => void>();
let started = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSync = false;

function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((cb) => cb());
}

/**
 * Run a flush. Coalesces concurrent callers and re-runs once if work arrived
 * mid-flush. `manual` only affects the resulting status messaging.
 */
export async function syncNow(opts: { manual?: boolean } = {}): Promise<FlushResult | null> {
  if (!getConnectivity().online) {
    setState({ status: "offline", online: false });
    return null;
  }
  if (state.status === "syncing") {
    pendingSync = true; // fold this request into the in-flight run
    return null;
  }
  if (!opts.manual && getReadyItems().length === 0) {
    // Nothing actionable right now — keep current status, just (re)arm backoff.
    scheduleNextRetry();
    return null;
  }

  setState({ status: "syncing", online: true });
  let result: FlushResult | null = null;
  try {
    result = await flushOfflineQueue();
    setState({
      status: result.failed > 0 || result.conflicts > 0 ? "error" : "idle",
      lastSyncAt: new Date().toISOString(),
      lastError: undefined,
      lastResult: result,
    });
  } catch (e) {
    setState({ status: "error", lastError: e instanceof Error ? e.message : String(e) });
  } finally {
    scheduleNextRetry();
  }

  if (pendingSync) {
    pendingSync = false;
    return syncNow(opts);
  }
  return result;
}

/** Arm a timer for the soonest backed-off pending item (if any). */
function scheduleNextRetry() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const due = getQueue()
    .filter((i) => i.status === "pending" && i.nextAttemptAt)
    .map((i) => new Date(i.nextAttemptAt as string).getTime());
  if (due.length === 0) return;
  const soonest = Math.min(...due);
  const delay = Math.max(soonest - Date.now(), 1_000);
  retryTimer = setTimeout(() => {
    void syncNow();
  }, delay);
}

/** Wire connectivity + queue listeners and kick an initial sync. Idempotent. */
export function initSyncManager(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  startConnectivityMonitoring();

  subscribeConnectivity(() => {
    const online = getConnectivity().online;
    if (online) {
      setState({ online, status: state.status === "offline" ? "idle" : state.status });
      void syncNow();
    } else {
      setState({ online, status: "offline" });
    }
  });

  // When new work is queued while online, flush it promptly.
  subscribeQueue(() => {
    if (getConnectivity().online && getReadyItems().length > 0 && state.status !== "syncing") {
      void syncNow();
    }
  });

  // Initial catch-up for anything left from a previous session.
  void syncNow();
}

export function subscribeSyncState(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSyncState(): SyncState {
  return state;
}
