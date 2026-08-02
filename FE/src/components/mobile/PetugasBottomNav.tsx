// VoltHub — PETUGAS mobile bottom nav ("m-banking" pattern).
// 5 fixed destinations for the field officer's phone shell: Beranda · WO ·
// Laporan · GIS · Profil. Replaces the management-role-agnostic MobileTabBar +
// QuickActionFab for PETUGAS specifically — field officers get a flat,
// always-visible 5-tab bar instead of a 4-tab-plus-FAB quick-create sheet.
//
// "Laporan" routes to /history: PETUGAS has no single report-type route (GI vs
// GH vs MP forms are gated per-RTUPP and only ever created from within a Work
// Order), so the report *list* — their existing Riwayat page — is the closest
// real destination, and is what the previous MobileTabBar already used for this
// slot too.
//
// Rendered only for role PETUGAS (self-guarded, mirrors MobileTabBar) and only
// under md (parent gates on role; `md:hidden` here gates on viewport so it's
// safe to render from anywhere).
import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Home,
  ClipboardList,
  FileText,
  MapPin,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useV2Role } from "@/lib/v2/rbac";
import { useMobileNavStore } from "@/stores/mobileNav";
import { workOrders } from "@/features/v2/work-orders/resource";

interface TabDef {
  label: string;
  to: string;
  icon: LucideIcon;
}

const TABS: TabDef[] = [
  { label: "Beranda", to: "/lapangan", icon: Home },
  { label: "WO", to: "/work-order", icon: ClipboardList },
  { label: "Laporan", to: "/history", icon: FileText },
  { label: "GIS", to: "/gis", icon: MapPin },
  { label: "Profil", to: "/profile", icon: UserIcon },
];

function TabLink({ tab, active, badge }: { tab: TabDef; active: boolean; badge?: number }) {
  return (
    <Link
      to={tab.to as never}
      aria-current={active ? "page" : undefined}
      aria-label={tab.label}
      className="relative flex h-full flex-1 touch-target flex-col items-center justify-center gap-1"
    >
      <motion.span
        whileTap={{ scale: 0.97 }}
        className={cn(
          "relative flex h-8 w-11 items-center justify-center rounded-[10px] transition-colors",
          active && "bg-[rgba(249,115,22,.12)]",
        )}
      >
        <tab.icon
          className="size-[18px]"
          style={{ color: active ? "#f97316" : "rgba(255,255,255,.3)" }}
          strokeWidth={active ? 2.25 : 2}
        />
        {!!badge && badge > 0 && (
          <span className="absolute -right-1 -top-1 grid min-w-[15px] place-items-center rounded-full bg-red-500 px-[3px] text-[9px] font-bold leading-[15px] text-white">
            {badge > 9 ? "9+" : badge}
          </span>
        )}
      </motion.span>
      <span
        className="text-[10px] font-semibold leading-none"
        style={{ color: active ? "#f97316" : "rgba(255,255,255,.3)" }}
      >
        {tab.label}
      </span>
      {/* Active dot indicator, under the label per spec. */}
      <span
        className="absolute bottom-0 size-1 rounded-full transition-opacity"
        style={{ background: "#f97316", opacity: active ? 1 : 0 }}
      />
    </Link>
  );
}

export function PetugasBottomNav() {
  const role = useV2Role();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Auto-hide while driving the GIS map — same store the map already writes to,
  // so this nav slides away/back exactly like the bar it replaces.
  const hidden = useMobileNavStore((s) => s.hidden);
  const { data } = workOrders.useList(
    { page: 1, limit: 50, mine: true },
    { enabled: role === "PETUGAS" },
  );
  const activeWoCount = (data?.items ?? []).filter(
    (wo) => wo.status === "ASSIGNED" || wo.status === "ON_PROGRESS",
  ).length;

  // Defensive self-guard (parent already gates on role) — all hooks above run
  // first so this early return never changes the hook count across renders.
  if (role !== "PETUGAS") return null;

  const isActive = (to: string) => pathname === to || pathname.startsWith(`${to}/`);

  return (
    <nav
      data-testid="petugas-bottom-nav"
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 flex md:hidden",
        "border-t-[0.5px] border-white/[0.08] bg-[#0e0e16] pb-safe",
        "transition-transform duration-300 ease-out",
        hidden && "translate-y-full",
      )}
      style={{ height: "var(--bottomnav-h)" }}
      aria-hidden={hidden}
      aria-label="Navigasi utama"
    >
      {TABS.map((tab) => (
        <TabLink
          key={tab.to}
          tab={tab}
          active={isActive(tab.to)}
          badge={tab.to === "/work-order" ? activeWoCount : undefined}
        />
      ))}
    </nav>
  );
}
