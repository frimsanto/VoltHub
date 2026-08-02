// VoltHub — animated number counter (no dependency).
// Eases a numeric value from 0 → target with requestAnimationFrame so KPI cards
// feel alive without pulling in an animation library. Honors the user's
// prefers-reduced-motion setting (jumps straight to the value).
import { useEffect, useRef, useState } from "react";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

// easeOutCubic — fast start, gentle settle.
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function useCountUp(target: number | undefined, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const end = target ?? 0;
    if (prefersReducedMotion()) {
      setValue(end);
      fromRef.current = end;
      return;
    }
    const from = fromRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const current = from + (end - from) * ease(t);
      setValue(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = end;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs]);

  return Math.round(value);
}
