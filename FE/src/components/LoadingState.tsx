// VoltHub — Loading states
// Platform-aware spinner + a small library of skeleton screens used while data
// loads. Skeletons preserve the shape of the final content (cards, list rows,
// detail header) so the layout doesn't jump on mobile — the native feel both
// Material and HIG recommend over a bare spinner for content areas.

import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { cn } from "@/lib/utils";
import { nativePlatform } from "@/lib/native/bootstrap";

/**
 * Spinner. On iOS we render the HIG-style 12-spoke "activity indicator"; on
 * Android / web a Material circular spinner. Size in px.
 */
export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  if (nativePlatform() === "ios") {
    // 12 static spokes with graded opacity inside a container that ticks round
    // once per second (steps(12)) — the classic HIG activity indicator.
    return (
      <span
        role="status"
        aria-label="Memuat"
        className={cn("relative inline-block", className)}
        style={{ width: size, height: size, animation: "ios-spin 1s steps(12) infinite" }}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full bg-current"
            style={{
              width: Math.max(1.5, size * 0.08),
              height: size * 0.28,
              transformOrigin: `center ${size / 2}px`,
              transform: `rotate(${i * 30}deg)`,
              opacity: (i + 1) / 12,
            }}
          />
        ))}
      </span>
    );
  }
  return (
    <Loader2 className={cn("animate-spin", className)} style={{ width: size, height: size }} />
  );
}

/** Centered full-area loader for route-level pending UI. */
export function FullPageLoader({ label = "Memuat…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Spinner size={28} className="text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Inline button/section spinner. */
export function InlineLoader({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
      <Spinner size={18} className="text-primary" />
      {label && <span>{label}</span>}
    </div>
  );
}

/** Stacked rows — for list / table screens. */
export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** KPI cards + chart placeholder — for dashboards. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-border/60 p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ))}
      </div>
      <Skeleton className="h-56 w-full rounded-2xl" />
      <div className="grid gap-3 lg:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    </div>
  );
}

/** Header + field grid — for detail screens. */
export function DetailSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-12 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border/60 p-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-40" />
          </div>
        ))}
      </div>
    </div>
  );
}
