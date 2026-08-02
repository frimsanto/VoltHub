/**
 * Unified connectivity source.
 *
 * On the web we rely on the browser's `navigator.onLine` + online/offline
 * events. Inside the Capacitor native shell those events are unreliable (the
 * WebView can report `onLine` while the device radio is actually down), so we
 * prefer the `@capacitor/network` plugin, which reflects the real OS network
 * state and also tells us the connection *type* (wifi / cellular / none).
 *
 * Everything funnels through one observable so the rest of the app has a single
 * `useSyncExternalStore`-friendly source of truth (see `useOnlineStatus`,
 * `syncManager`). The plugin is imported lazily and guarded, so the web build
 * has zero hard dependency on a native runtime.
 */

import { Capacitor } from "@capacitor/core";

export type ConnectionType = "wifi" | "cellular" | "none" | "unknown";

export interface ConnectivityState {
  online: boolean;
  type: ConnectionType;
}

let state: ConnectivityState = {
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  type: "unknown",
};

const listeners = new Set<() => void>();
let started = false;

function emit() {
  listeners.forEach((cb) => cb());
}

function setState(next: ConnectivityState) {
  if (next.online === state.online && next.type === state.type) return;
  state = next;
  emit();
}

/** Begin listening for connectivity changes. Idempotent. */
export function startConnectivityMonitoring(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  // Browser events — always wired (also the web fallback).
  const onOnline = () => setState({ ...state, online: true });
  const onOffline = () => setState({ online: false, type: "none" });
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);

  // Native: subscribe to the OS network status for accurate radio state.
  if (Capacitor.isNativePlatform()) {
    void (async () => {
      try {
        const { Network } = await import("@capacitor/network");
        const status = await Network.getStatus();
        setState({ online: status.connected, type: normalize(status.connectionType) });
        await Network.addListener("networkStatusChange", (s) => {
          setState({ online: s.connected, type: normalize(s.connectionType) });
        });
      } catch {
        // plugin missing — browser events above remain the source of truth
      }
    })();
  }
}

function normalize(t: string | undefined): ConnectionType {
  if (t === "wifi" || t === "cellular" || t === "none") return t;
  return "unknown";
}

export function subscribeConnectivity(cb: () => void): () => void {
  startConnectivityMonitoring();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getConnectivity(): ConnectivityState {
  return state;
}

/** Synchronous best-effort online check (used by the sync engine guards). */
export function isOnline(): boolean {
  return state.online;
}
