// VoltHub V2 — PageHeader (title + optional back + actions).
// Breadcrumbs live in the app topbar (components/v2/Breadcrumbs.tsx), not here.
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageHeader({
  title,
  description,
  backTo,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  backTo?: string;
  actions?: ReactNode;
}) {
  // Opsi C: header flat — title kiri (text-xl font-semibold), deskripsi kecil di
  // bawah, actions kanan; border-bottom tipis, pb-4 mb-6 (bukan kartu).
  return (
    <div className="fade-in mb-6 flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        {backTo && (
          <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0 -ml-1">
            {/* V2 routes are typed once registered; relax at this single boundary. */}
            <Link to={backTo as never} aria-label="Kembali">
              <ChevronLeft className="size-5" />
            </Link>
          </Button>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {/* `description` is an arbitrary ReactNode — callers pass badges and
              other block content (e.g. ImportStatusBadge → a <div>). Use a
              <div>, not a <p>, so block children are valid DOM nesting. */}
          {description && (
            <div className="mt-1 text-sm text-muted-foreground leading-relaxed">{description}</div>
          )}
        </div>
      </div>
      {actions && (
        <div className="relative flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
