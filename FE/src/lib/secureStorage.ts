import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import type { StateStorage } from "zustand/middleware";

const isNative = Capacitor.isNativePlatform();

/**
 * Persistence backend for the auth store.
 *
 * - **Native (Android/iOS):** Capacitor Preferences, which is backed by the
 *   platform secure/app storage instead of a JS-readable DOM store — tokens are
 *   not exposed to web-context XSS.
 * - **Web:** plain localStorage, kept SYNCHRONOUS so rehydration still happens
 *   before first paint (no login flash on refresh).
 */
export const secureStorage: StateStorage = {
  getItem: (name) => {
    if (!isNative) return localStorage.getItem(name);
    return Preferences.get({ key: name }).then((r) => r.value ?? null);
  },
  setItem: (name, value) => {
    if (!isNative) {
      localStorage.setItem(name, value);
      return;
    }
    return Preferences.set({ key: name, value }).then(() => undefined);
  },
  removeItem: (name) => {
    if (!isNative) {
      localStorage.removeItem(name);
      return;
    }
    return Preferences.remove({ key: name }).then(() => undefined);
  },
};
