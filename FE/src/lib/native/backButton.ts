/**
 * Android hardware back-button handling.
 *
 * Default Capacitor behaviour exits the app whenever web history is empty, which
 * on a SPA can drop the user out unexpectedly. We make it predictable and
 * native-feeling:
 *   • if the WebView can go back in history → navigate back;
 *   • otherwise (at a root screen) → minimise the app (Android home), which is
 *     what users expect from the system back gesture rather than a hard exit.
 *
 * No-op on web and iOS (no hardware back button). Plugin imported lazily so the
 * web bundle keeps zero native dependency.
 */
import { Capacitor } from "@capacitor/core";

let registered = false;

export async function registerBackButton(): Promise<void> {
  if (registered || !Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  registered = true;
  try {
    const { App } = await import("@capacitor/app");
    await App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack || window.history.length > 1) {
        window.history.back();
      } else {
        // At a root screen: minimise instead of killing the process.
        void App.minimizeApp();
      }
    });
  } catch {
    /* @capacitor/app absent — fall back to Capacitor's default handling */
  }
}
