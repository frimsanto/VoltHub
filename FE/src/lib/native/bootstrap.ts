/**
 * Native shell bootstrap — StatusBar, SplashScreen and Keyboard wiring for the
 * Capacitor Android/iOS builds. Everything here is a strict no-op on the web:
 * each plugin is imported lazily and only after `Capacitor.isNativePlatform()`
 * passes, so the web bundle has zero hard dependency on a native runtime and
 * tree-shakes the plugin code away.
 *
 * This module owns *presentation* concerns only (status-bar colour, splash
 * dismissal, keyboard behaviour). It deliberately touches no business logic.
 */

import { Capacitor } from "@capacitor/core";
import { registerBackButton } from "./backButton";

/** Whether we are running inside the native (Android/iOS) Capacitor shell. */
export const isNative = (): boolean => Capacitor.isNativePlatform();

/** The active native platform, or "web" on the browser build. */
export function nativePlatform(): "ios" | "android" | "web" {
  const p = Capacitor.getPlatform();
  return p === "ios" || p === "android" ? p : "web";
}

/**
 * Sync the native status bar to the current colour scheme.
 *
 * iOS (HIG) and Android (Material) both expect the status-bar icon colour to
 * contrast with the content behind it: dark icons on a light UI, light icons on
 * a dark UI. We overlay the WebView so our own safe-area padding (see
 * styles.css) draws under a transparent bar — the Apple/Material edge-to-edge
 * convention.
 */
export async function applyStatusBarTheme(dark: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Light content (white icons) over a dark UI; dark content over a light UI.
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (nativePlatform() === "android") {
      // Android lets us colour the bar background; keep it transparent so the
      // app's own safe-area header shows through (edge-to-edge).
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.setBackgroundColor({ color: "#00000000" });
    }
  } catch {
    /* plugin absent / older OS — non-fatal */
  }
}

/**
 * Configure the soft keyboard. We use `resize: none` and manage the inset
 * ourselves (see useKeyboardInset) so the layout lifts sticky elements (bottom
 * nav, form footers) smoothly without the WebView abruptly resizing — the
 * native-feeling behaviour on both platforms.
 */
async function configureKeyboard(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
    await Keyboard.setResizeMode({ mode: KeyboardResize.None });
    // iOS: don't let the OS scroll the WebView; we handle focus scrolling.
    if (nativePlatform() === "ios") {
      await Keyboard.setScroll({ isDisabled: true });
    }
  } catch {
    /* plugin absent — useKeyboardInset still falls back to visualViewport */
  }
}

/** Hide the launch splash once the web app has mounted and painted. */
async function hideSplash(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* no splash plugin — nothing to hide */
  }
}

let booted = false;

/**
 * One-time native initialisation, called from main.tsx. Idempotent and safe on
 * web (returns immediately). `dark` seeds the initial status-bar style; later
 * theme changes are pushed via applyStatusBarTheme from the theme boot effect.
 */
export async function initNativeShell(dark: boolean): Promise<void> {
  if (booted || !isNative()) return;
  booted = true;
  await Promise.allSettled([
    applyStatusBarTheme(dark),
    configureKeyboard(),
    hideSplash(),
    registerBackButton(),
  ]);
}
