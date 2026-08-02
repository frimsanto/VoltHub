// VoltHub V2 — read-only definition grid for detail pages.
import type { ReactNode } from "react";

export function InfoGrid({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((it) => (
        <div key={it.label}>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{it.label}</dt>
          <dd className="mt-0.5 text-sm font-medium">
            {it.value === null || it.value === undefined || it.value === "" ? (
              <span className="text-muted-foreground">—</span>
            ) : (
              it.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
