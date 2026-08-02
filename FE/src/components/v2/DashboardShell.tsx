// VoltHub V2 — DashboardShell
// Opt-in presentational scaffold for dashboard pages: a consistent header
// (reuses PageHeader) plus a responsive grid wrapper for KPI/section cards.
// Purely layout — no data, no business logic. Pages adopt it incrementally.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "./PageHeader";

export function DashboardShell({
  title,
  description,
  actions,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}

// Responsive KPI/section grid: 1 col (mobile) → 2 (sm) → 3 (lg) → 4 (ultra-wide).
export function DashboardGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
