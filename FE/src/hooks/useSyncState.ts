import { useSyncExternalStore } from "react";
import { getQueue, subscribeQueue, type QueuedReport } from "@/lib/offline/queue";
import { getSyncState, subscribeSyncState, type SyncState } from "@/lib/offline/syncManager";

/** Reactive sync-manager state (status, last sync time, last result). */
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSyncState, getSyncState, getSyncState);
}

const EMPTY: QueuedReport[] = [];

/** Reactive snapshot of the full offline queue (for the Sync Center screen). */
export function useOfflineQueue(): QueuedReport[] {
  return useSyncExternalStore(subscribeQueue, getQueue, () => EMPTY);
}
