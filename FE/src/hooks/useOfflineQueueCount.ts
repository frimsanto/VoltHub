import { useSyncExternalStore } from "react";
import {
  getPendingCount,
  getFailedCount,
  getQueueCounts,
  subscribeQueue,
  type QueueCounts,
} from "@/lib/offline/queue";

/** Reactive count of reports still waiting to be synced (pending + syncing). */
export function useOfflineQueueCount(): number {
  return useSyncExternalStore(subscribeQueue, getPendingCount, () => 0);
}

/** Reactive count of items that failed or hit a conflict (need attention). */
export function useFailedSyncCount(): number {
  return useSyncExternalStore(subscribeQueue, getFailedCount, () => 0);
}

const EMPTY_COUNTS: QueueCounts = { pending: 0, syncing: 0, failed: 0, conflict: 0, total: 0 };

/** Reactive breakdown of the queue by status. */
export function useQueueCounts(): QueueCounts {
  return useSyncExternalStore(subscribeQueue, getQueueCounts, () => EMPTY_COUNTS);
}
