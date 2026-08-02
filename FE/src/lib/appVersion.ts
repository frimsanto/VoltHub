import { Capacitor } from "@capacitor/core";

/**
 * Client app version. Bump this on every release and keep it in sync with the
 * native build (Android versionName / iOS CFBundleShortVersionString) and with
 * the backend's APP_MIN_VERSION / APP_LATEST_VERSION.
 */
export const APP_VERSION = "1.0.0";

/** "android" | "ios" | "web" — sent to the backend for update links/telemetry. */
export function getPlatform(): string {
  return Capacitor.getPlatform();
}
