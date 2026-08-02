// VoltHub V2 — PageContainer
// Single owner of page width + responsive padding for the app shell. Replaces the
// ad-hoc `mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8` that was inlined in the
// layout, and adds the previously-unused `2xl` (ultra-wide) tier. Spacing follows
// the 4pt scale: 16 (mobile) → 24 (tablet) → 32 (desktop).

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 2xl:max-w-[1760px]",
        // Clears the fixed mobile tab bar + FAB (PETUGAS-only chrome). --bottomnav-h
        // is viewport-width-based, not role-based, so this lands on every role's
        // mobile view — harmless extra bottom space where there's no tab bar.
        "pb-20 md:pb-8",
        className,
      )}
    >
      {children}
    </div>
  );
}
