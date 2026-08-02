// VoltHub — Pull-to-refresh (mobile)
// A native-feeling overscroll-to-refresh gesture for touch devices. Wraps the
// scrollable app content; when the user is scrolled to the very top and drags
// down past a threshold, it refetches the *active* React Query queries for the
// current screen — i.e. exactly the data the visible page is showing. It calls
// no endpoint directly and changes no business logic: it simply re-triggers the
// queries the screen already declared.
//
// It is inert unless the gesture clearly starts at the top, so it never fights
// in-page scrolling. Disabled on fine-pointer (desktop) devices.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

const THRESHOLD = 72; // px of pull needed to arm a refresh
const MAX_PULL = 110; // visual clamp so the indicator never flies away
const RESIST = 0.5; // rubber-band resistance

function scrollTop(): number {
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export function PullToRefresh({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Refetch only what the current screen is actively observing.
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  useEffect(() => {
    // Touch-only: a fine pointer (mouse) never engages this.
    if (typeof window === "undefined" || !window.matchMedia("(pointer: coarse)").matches) return;

    const onStart = (e: TouchEvent) => {
      if (refreshing || scrollTop() > 0 || e.touches.length !== 1) {
        startY.current = null;
        return;
      }
      // Never engage when the gesture starts on an interactive map surface — a
      // downward map pan must not be hijacked as a pull-to-refresh (GIS).
      const target = e.target as HTMLElement | null;
      if (target?.closest(".leaflet-container")) {
        startY.current = null;
        return;
      }
      startY.current = e.touches[0].clientY;
      armed.current = false;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const delta = e.touches[0].clientY - startY.current;
      if (delta <= 0 || scrollTop() > 0) {
        if (armed.current) setPull(0);
        armed.current = false;
        return;
      }
      armed.current = true;
      const dist = Math.min(MAX_PULL, delta * RESIST);
      setPull(dist);
    };

    const onEnd = () => {
      if (!armed.current) return;
      armed.current = false;
      if (pull >= THRESHOLD) void doRefresh();
      setPull(0);
      startY.current = null;
    };

    // Passive listeners — we never call preventDefault, so native scrolling and
    // browser/WebView gestures are unaffected.
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [pull, refreshing, doRefresh]);

  const active = pull > 0 || refreshing;
  const progress = Math.min(1, pull / THRESHOLD);
  const indicatorY = refreshing ? 44 : pull;

  return (
    <div className="relative">
      {/* Overscroll indicator — Material circular spinner, HIG-friendly motion. */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
        style={{ transform: `translateY(${Math.max(0, indicatorY - 36)}px)` }}
        aria-hidden={!refreshing}
      >
        <div className="mt-2 grid size-9 place-items-center rounded-full border border-border bg-background shadow-md">
          {refreshing ? (
            <Loader2 className="size-5 animate-spin text-primary" />
          ) : (
            <ArrowDown
              className={cn(
                "size-5 text-primary transition-transform",
                progress >= 1 && "rotate-180",
              )}
              style={{ opacity: 0.4 + progress * 0.6 }}
            />
          )}
        </div>
      </div>
      {/* Content follows the finger, then springs back. */}
      <div
        style={{ transform: active ? `translateY(${refreshing ? 36 : pull}px)` : undefined }}
        className={cn(!active && "transition-transform duration-200")}
      >
        {children}
      </div>
    </div>
  );
}
