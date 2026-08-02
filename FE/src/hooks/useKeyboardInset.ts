import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * Drives the global `--kb-inset` CSS variable with the on-screen keyboard
 * height so sticky UI (bottom tab bar, form footers, the AI FAB) can lift above
 * the keyboard via `.pb-safe-kb` / `calc(... + var(--kb-inset))`.
 *
 * Two sources, picked per platform:
 *   • Native (Capacitor): the `@capacitor/keyboard` plugin reports the exact
 *     keyboard height on `keyboardWillShow/Hide` — the reliable signal on iOS &
 *     Android (where `visualViewport` is unreliable inside the WebView).
 *   • Web / PWA: `window.visualViewport` resize gives the occluded height.
 *
 * Mount once, high in the tree (the app shell). No-op for SSR. Touches no
 * business logic — purely a layout signal.
 */
export function useKeyboardInset(): void {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    const set = (px: number) => root.style.setProperty("--kb-inset", `${Math.max(0, px)}px`);

    // ── Native path ──────────────────────────────────────────────────────────
    if (Capacitor.isNativePlatform()) {
      let cleanup: (() => void) | undefined;
      void (async () => {
        try {
          const { Keyboard } = await import("@capacitor/keyboard");
          const showSub = await Keyboard.addListener("keyboardWillShow", (info) =>
            set(info.keyboardHeight),
          );
          const hideSub = await Keyboard.addListener("keyboardWillHide", () => set(0));
          cleanup = () => {
            void showSub.remove();
            void hideSub.remove();
            set(0);
          };
        } catch {
          /* plugin missing — fall back to no inset */
        }
      })();
      return () => cleanup?.();
    }

    // ── Web / PWA fallback ───────────────────────────────────────────────────
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      // Portion of the layout viewport hidden by the keyboard.
      const occluded = window.innerHeight - vv.height - vv.offsetTop;
      set(occluded > 80 ? occluded : 0); // ignore browser-chrome jitter
    };
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
      set(0);
    };
  }, []);
}
