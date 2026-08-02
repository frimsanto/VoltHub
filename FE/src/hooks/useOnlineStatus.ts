import { useSyncExternalStore } from "react";
import {
  subscribeConnectivity,
  getConnectivity,
  type ConnectivityState,
} from "@/lib/offline/connectivity";

/**
 * Reactive network status. `true` when the device reports connectivity.
 *
 * Backed by the unified connectivity source (Capacitor Network on native,
 * navigator.onLine + online/offline events on web).
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeConnectivity,
    () => getConnectivity().online,
    () => true,
  );
}

/** Full connectivity state including the connection type (wifi/cellular/none). */
export function useConnectivity(): ConnectivityState {
  return useSyncExternalStore(subscribeConnectivity, getConnectivity, () => getConnectivity());
}
