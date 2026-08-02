// VoltHub — Lenis smooth scroll (premium feel on list/detail pages).
// A single app-wide instance driven by rAF. Wheel scrolling is smoothed; touch
// stays native (Capacitor/mobile ergonomics + PullToRefresh untouched). Honours
// prefers-reduced-motion by not initialising at all.
import Lenis from "lenis";

let lenisInstance: Lenis | null = null;
let rafId: number | null = null;

export function initLenis(): Lenis | null {
  if (typeof window === "undefined") return null;
  if (lenisInstance) return lenisInstance;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;

  lenisInstance = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
  });

  const raf = (time: number) => {
    lenisInstance?.raf(time);
    rafId = requestAnimationFrame(raf);
  };
  rafId = requestAnimationFrame(raf);

  return lenisInstance;
}

export function destroyLenis(): void {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  lenisInstance?.destroy();
  lenisInstance = null;
}

export function getLenis(): Lenis | null {
  return lenisInstance;
}
