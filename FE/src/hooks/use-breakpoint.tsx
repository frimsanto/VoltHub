import * as React from "react";

// VoltHub layout breakpoints — aligned with Tailwind's `md` (768) and `lg` (1024).
// Used by the app shell to decide the sidebar mode: drawer (mobile), icon rail
// (tablet default) or permanent sidebar (desktop). Mirrors the matchMedia pattern
// in hooks/use-mobile.tsx, generalised to three tiers.
const TABLET_MIN = 768; // Tailwind `md`
const DESKTOP_MIN = 1024; // Tailwind `lg`

export type Breakpoint = "mobile" | "tablet" | "desktop";

function compute(width: number): Breakpoint {
  if (width < TABLET_MIN) return "mobile";
  if (width < DESKTOP_MIN) return "tablet";
  return "desktop";
}

export function useBreakpoint(): Breakpoint {
  // SSR (TanStack Start) has no `window`; default to desktop and let the first
  // client effect correct it on mount.
  const [bp, setBp] = React.useState<Breakpoint>(() =>
    typeof window === "undefined" ? "desktop" : compute(window.innerWidth),
  );

  React.useEffect(() => {
    const onResize = () => setBp(compute(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return bp;
}
