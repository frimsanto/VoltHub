// VoltHub — Mobile "More" sheet (management nav overflow).
//
// The bottom sheet behind the "Lainnya" tab of the management nav shell
// (MobileNavShell). MASTER/MANAGER/ADMIN carry more destinations than fit in the
// five-slot bottom bar, so everything not promoted to a primary tab is surfaced
// here — grouped exactly like the desktop sidebar and filtered by the same
// role/RTUPP rules (filterNavForRole), so the mobile overflow never drifts from
// what the role may actually load. Renders only <md (the parent shell that opens
// it is `md:hidden`, and the sheet content self-guards with `md:hidden` too).
//
// Design source: Claude Design "VoltHub Mobile" nav-shell prototype — dark navy
// #0e0e16 family surfaces (#15151f sheet, #1c1c28 rows), orange #f97316 accent.

import { Link } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useV2Role } from "@/lib/v2/rbac";
import { isRtupp1User } from "@/lib/v2/rtupp";
import { V2_NAV, isV2Group, filterNavForRole, type V2NavLeaf } from "@/lib/v2/nav";

// A rendered chunk of the sheet: either a titled section (multi-item group) or a
// single-row card with no header (a standalone leaf or a collapsed 1-child group,
// mirroring how the sidebar collapses single-child groups to a direct link).
interface MoreSection {
  key: string;
  header?: string;
  items: V2NavLeaf[];
}

function MoreRow({ item, onNavigate }: { item: V2NavLeaf; onNavigate: () => void }) {
  // Coming-soon items are non-navigable placeholders with a "Segera" badge —
  // same treatment as the sidebar (nav.ts `comingSoon`).
  if (item.comingSoon) {
    return (
      <div
        className="flex items-center justify-between border-b-[0.5px] border-white/[0.06] px-3.5 py-3.5 last:border-b-0"
        aria-disabled="true"
        title="Segera hadir"
      >
        <span className="text-[14px] text-white/40">{item.label}</span>
        <span className="rounded-full bg-white/[0.06] px-2 py-[3px] text-[10.5px] font-bold text-white/40">
          Segera
        </span>
      </div>
    );
  }
  return (
    <Link
      to={item.to as never}
      onClick={onNavigate}
      className="flex touch-target items-center justify-between border-b-[0.5px] border-white/[0.06] px-3.5 py-3.5 transition-colors last:border-b-0 active:bg-white/[0.03]"
    >
      <span className="text-[14px] text-[#f5f5f7]">{item.label}</span>
    </Link>
  );
}

export function MobileMoreSheet({
  open,
  onOpenChange,
  hiddenRoutes,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Routes already surfaced as primary tabs — excluded so nothing appears twice. */
  hiddenRoutes: readonly string[];
}) {
  const role = useV2Role();
  const user = useAuthStore((s) => s.user);
  const rtupp1 = isRtupp1User(user);

  // Same role-scoped sitemap as the desktop sidebar, minus the primary-tab routes.
  const hidden = new Set(hiddenRoutes);
  const sections: MoreSection[] = [];
  for (const node of filterNavForRole(V2_NAV, role, rtupp1)) {
    if (isV2Group(node)) {
      const items = node.children.filter((c) => !hidden.has(c.to));
      if (items.length === 0) continue;
      // 1 remaining child ⇒ headerless single-row card (avoid a pointless section).
      sections.push({ key: node.label, header: items.length > 1 ? node.label : undefined, items });
    } else if (!hidden.has(node.to)) {
      sections.push({ key: node.to, items: [node] });
    }
  }

  const close = () => onOpenChange(false);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-testid="mobile-more-sheet"
        className={cn(
          "md:hidden gap-0 rounded-t-[22px] border-t border-white/[0.07] bg-[#15151f] p-0",
          "max-h-[80vh] text-[#f5f5f7]",
        )}
      >
        {/* Built-in SheetContent close (X) sits top-right; title anchors the left. */}
        <div className="flex items-center justify-between px-5 pb-2.5 pt-4">
          <SheetTitle className="text-[16px] font-bold text-[#f5f5f7]">Menu Lainnya</SheetTitle>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-[calc(1.5rem+var(--safe-bottom))] pt-1">
          {sections.map((section) => (
            <div key={section.key}>
              {section.header && (
                <div className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.6px] text-white/40">
                  {section.header}
                </div>
              )}
              <div className="overflow-hidden rounded-[12px] bg-[#1c1c28]">
                {section.items.map((item) => (
                  <MoreRow key={item.to} item={item} onNavigate={close} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
