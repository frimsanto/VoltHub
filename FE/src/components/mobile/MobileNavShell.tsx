// VoltHub — mobile nav shell for management + control-room roles.
//
// Adaptive bottom tab bar (sibling of PetugasBottomNav) for MASTER / MANAGER /
// ADMIN / NOC. Closes the audit gap where these roles had only the hamburger
// drawer on phones: they now get the same native-app bottom-nav model PETUGAS
// already has.
//
//   NOC                  — 4 control-room tabs: Dashboard · GIS · Upload · Profil.
//   MASTER/MANAGER/ADMIN — 5 tabs: Beranda · GIS · Kerja · Lainnya · Profil, where
//                          "Lainnya" opens a bottom sheet (MobileMoreSheet) listing
//                          the rest of their role-scoped sitemap.
//
// Rendered only <md (`md:hidden`) and only for these four roles (self-guarded,
// mirrors PetugasBottomNav). PETUGAS keeps its own PetugasBottomNav — untouched.
// Visuals reuse PetugasBottomNav's exact tokens (bg #0e0e16, active orange
// #f97316, inactive white/30) so both mobile bottom bars read as one system.

import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  Home,
  MapPin,
  ClipboardList,
  LayoutGrid,
  CloudUpload,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useV2Role, type V2Role } from "@/lib/v2/rbac";
import { useMobileNavStore } from "@/stores/mobileNav";
import { MobileMoreSheet } from "./MobileMoreSheet";

interface ShellTab {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Destination route; omitted for the "More" slot (opens the sheet instead). */
  to?: string;
}

// MASTER / MANAGER / ADMIN — five slots, "Lainnya" opens the overflow sheet.
const MANAGEMENT_TABS: ShellTab[] = [
  { key: "home", label: "Beranda", to: "/dashboard", icon: Home },
  { key: "gis", label: "GIS", to: "/gis", icon: MapPin },
  { key: "wo", label: "Kerja", to: "/work-order", icon: ClipboardList },
  { key: "more", label: "Lainnya", icon: LayoutGrid },
  { key: "profile", label: "Profil", to: "/profile", icon: UserIcon },
];

// NOC — control room: no operational "Kerja"/overflow, but owns SCADA Upload.
// "Dashboard" points at /scada (its command center; /dashboard redirects NOC there).
const NOC_TABS: ShellTab[] = [
  { key: "home", label: "Dashboard", to: "/scada", icon: Home },
  { key: "gis", label: "GIS", to: "/gis", icon: MapPin },
  { key: "upload", label: "Upload", to: "/scada-upload", icon: CloudUpload },
  { key: "profile", label: "Profil", to: "/profile", icon: UserIcon },
];

// Primary-tab routes are hidden from the "More" sheet so they never appear twice.
const MANAGEMENT_TAB_ROUTES = MANAGEMENT_TABS.map((t) => t.to).filter((to): to is string => !!to);

// Roles that get this shell. PETUGAS is intentionally excluded (PetugasBottomNav).
const SHELL_ROLES: readonly V2Role[] = ["MASTER", "MANAGER", "ADMIN", "NOC"] as const;

// Shared inner visual for a tab — identical to PetugasBottomNav's TabLink body so
// the two bottom bars are pixel-consistent.
function TabVisual({
  icon: Icon,
  label,
  active,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <>
      <motion.span
        whileTap={{ scale: 0.97 }}
        className={cn(
          "relative flex h-8 w-11 items-center justify-center rounded-[10px] transition-colors",
          active && "bg-[rgba(249,115,22,.12)]",
        )}
      >
        <Icon
          className="size-[18px]"
          style={{ color: active ? "#f97316" : "rgba(255,255,255,.3)" }}
          strokeWidth={active ? 2.25 : 2}
        />
      </motion.span>
      <span
        className="text-[10px] font-semibold leading-none"
        style={{ color: active ? "#f97316" : "rgba(255,255,255,.3)" }}
      >
        {label}
      </span>
      {/* Active dot indicator, under the label (spec mirrors PetugasBottomNav). */}
      <span
        className="absolute bottom-0 size-1 rounded-full transition-opacity"
        style={{ background: "#f97316", opacity: active ? 1 : 0 }}
      />
    </>
  );
}

function ShellTabLink({ tab, active }: { tab: ShellTab; active: boolean }) {
  return (
    <Link
      to={tab.to as never}
      aria-current={active ? "page" : undefined}
      aria-label={tab.label}
      className="relative flex h-full flex-1 touch-target flex-col items-center justify-center gap-1"
    >
      <TabVisual icon={tab.icon} label={tab.label} active={active} />
    </Link>
  );
}

function ShellMoreButton({
  tab,
  active,
  onClick,
}: {
  tab: ShellTab;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={tab.label}
      aria-haspopup="dialog"
      aria-expanded={active}
      className="relative flex h-full flex-1 touch-target flex-col items-center justify-center gap-1"
    >
      <TabVisual icon={tab.icon} label={tab.label} active={active} />
    </button>
  );
}

export function MobileNavShell() {
  const role = useV2Role();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Reuse the same store the GIS map writes to, so the bar auto-hides/returns
  // while panning the map exactly like PetugasBottomNav does.
  const hidden = useMobileNavStore((s) => s.hidden);
  const [moreOpen, setMoreOpen] = useState(false);

  // All hooks above run unconditionally — this early return keeps the hook count
  // stable across renders (defensive; the parent already gates on role).
  if (!SHELL_ROLES.includes(role)) return null;

  const isNOC = role === "NOC";
  const tabs = isNOC ? NOC_TABS : MANAGEMENT_TABS;
  const isActive = (to?: string) => !!to && (pathname === to || pathname.startsWith(`${to}/`));

  return (
    <>
      <nav
        data-testid="mobile-nav-shell"
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
        {tabs.map((tab) =>
          tab.to ? (
            <ShellTabLink key={tab.key} tab={tab} active={isActive(tab.to)} />
          ) : (
            <ShellMoreButton
              key={tab.key}
              tab={tab}
              active={moreOpen}
              onClick={() => setMoreOpen(true)}
            />
          ),
        )}
      </nav>
      {/* Overflow sheet — management roles only (NOC has no "Lainnya" slot). */}
      {!isNOC && (
        <MobileMoreSheet
          open={moreOpen}
          onOpenChange={setMoreOpen}
          hiddenRoutes={MANAGEMENT_TAB_ROUTES}
        />
      )}
    </>
  );
}
