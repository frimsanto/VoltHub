import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useAuthStore, type Role } from "@/stores/auth";
import {
  LayoutDashboard,
  FileText,
  History,
  UserCog,
  BadgeCheck,
  Activity,
  Download,
  Users,
  Globe,
  UsersRound,
  ChevronLeft,
  ChevronDown,
  LogOut,
  ClipboardList,
  ClipboardCheck,
  TableProperties,
  FilePlus2,
  BarChart3,
  FolderKanban,
  RefreshCw,
  RadioTower,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type IconType = React.ComponentType<{ className?: string }>;

interface MenuLeaf {
  label: string;
  to: string;
  icon: IconType;
}
interface MenuGroup {
  label: string;
  icon: IconType;
  children: MenuLeaf[];
}
type MenuNode = MenuLeaf | MenuGroup;

const isGroup = (n: MenuNode): n is MenuGroup => "children" in n;

// ─── Dashboard dropdown ──────────────────────────────────────────────────────────
// Beberapa dashboard disatukan di bawah satu menu "Dashboard" (dropdown) agar tidak
// terpecah-pecah di sidebar:
//   • SCADA       → /scada          (monitoring dataset jaringan, OPS-only)
//   • Lapangan    → /lapangan       (aktivitas tim lapangan)
//   • Inscan/OOP  → /scada-realtime (status realtime Gardu RC: IN-SCAN vs OOP)
const DASHBOARD_GROUP: MenuGroup = {
  label: "Dashboard",
  icon: LayoutDashboard,
  children: [
    { label: "SCADA", to: "/scada", icon: RadioTower },
    { label: "Lapangan", to: "/lapangan", icon: ClipboardCheck },
    { label: "Inscan/OOP", to: "/scada-realtime", icon: Activity },
  ],
};

// ─── Menu per role ──────────────────────────────────────────────────────────────
// Struktur disusun mengikuti permission existing (route guards). Item yang route-nya
// tidak diizinkan untuk suatu role TIDAK dimunculkan agar tidak ada navigasi yang
// di-redirect (semua role tetap bekerja, tanpa orphan & tanpa duplikat).
const MENUS: Record<Role, MenuNode[]> = {
  petugas: [
    { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
    {
      label: "Laporan",
      icon: FileText,
      children: [
        { label: "Buat Laporan", to: "/laporan/create", icon: FilePlus2 },
        { label: "Riwayat Saya", to: "/history", icon: History },
      ],
    },
    { label: "Sinkronisasi", to: "/sync", icon: RefreshCw },
    { label: "Profile", to: "/profile", icon: UserCog },
  ],
  // ADMIN is the RTUPP-scoped operator: monitoring, validation, analytics, and
  // user management — all scoped server-side to the admin's assigned RTUPP.
  admin: [
    DASHBOARD_GROUP,
    {
      label: "Laporan",
      icon: FileText,
      children: [
        { label: "Monitoring", to: "/monitoring", icon: ClipboardList },
        { label: "Validasi", to: "/validasi", icon: BadgeCheck },
        { label: "Riwayat", to: "/history", icon: History },
      ],
    },
    {
      label: "Analitik",
      icon: BarChart3,
      children: [
        { label: "Rekap Awal", to: "/rekap", icon: ClipboardList },
        { label: "Rekap Akhir", to: "/rekap-akhir", icon: TableProperties },
      ],
    },
    {
      label: "Manajemen",
      icon: FolderKanban,
      children: [{ label: "User", to: "/users", icon: Users }],
    },
    { label: "Export", to: "/export", icon: Download },
    { label: "Sinkronisasi", to: "/sync", icon: RefreshCw },
    { label: "Profile", to: "/profile", icon: UserCog },
  ],
  superadmin: [
    DASHBOARD_GROUP,
    {
      label: "Laporan",
      icon: FileText,
      children: [
        { label: "Monitoring", to: "/monitoring", icon: ClipboardList },
        { label: "Validasi", to: "/validasi", icon: BadgeCheck },
        { label: "Riwayat", to: "/history", icon: History },
      ],
    },
    {
      label: "Analitik",
      icon: BarChart3,
      children: [
        { label: "Rekap Awal", to: "/rekap", icon: ClipboardList },
        { label: "Rekap Akhir", to: "/rekap-akhir", icon: TableProperties },
      ],
    },
    {
      label: "Manajemen",
      icon: FolderKanban,
      children: [
        { label: "User", to: "/users", icon: Users },
        { label: "Team", to: "/team", icon: UsersRound },
        { label: "RTUPP", to: "/rtupp", icon: Globe },
      ],
    },
    { label: "Export", to: "/export", icon: Download },
    { label: "Sinkronisasi", to: "/sync", icon: RefreshCw },
    { label: "Profile", to: "/profile", icon: UserCog },
  ],
  // MANAGER (read-only monitoring) sees the same items as the top tier; write
  // controls inside each page are gated separately. This legacy V1 sidebar is
  // superseded by the VoltHub V2 sidebar (lib/v2/nav.ts).
  manager: [],
  // NOC (control room) hidup di layout V2 (V2Sidebar); sidebar legacy V1 hanya
  // memuat permukaan monitoring SCADA miliknya.
  noc: [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      children: [
        { label: "Inscan/OOP", to: "/scada-realtime", icon: Activity },
        { label: "SCADA Lines", to: "/scada-lines", icon: RadioTower },
      ],
    },
    { label: "Profile", to: "/profile", icon: UserCog },
  ],
};
// Mirror the superadmin menu for MANAGER (kept out of the literal to avoid
// duplicating the list).
MENUS.manager = MENUS.superadmin;

// ─── Leaf link ────────────────────────────────────────────────────────────────
// Item aktif = garis oranye 3px di sisi kiri + tint bg ringan (bukan blok solid).
// Sub-item memakai Bullet Variant 2: bullet abu 5px → oranye 7px saat aktif.
function LeafLink({
  item,
  active,
  collapsed,
  nested,
  onNavigate,
}: {
  item: MenuLeaf;
  active: boolean;
  collapsed: boolean;
  nested?: boolean;
  onNavigate?: () => void;
}) {
  if (nested && !collapsed) {
    return (
      <Link
        to={item.to}
        onClick={onNavigate}
        className={cn(
          "relative flex items-center gap-[9px] px-[4px] pr-[12px] py-[7px] rounded-[6px] cursor-pointer transition-colors",
          active ? "bg-sidebar-primary/[0.06]" : "hover:bg-white/[0.04]",
        )}
      >
        {/* Garis tipis 2px menimpa rail border-left induk saat aktif. */}
        {active && (
          <span className="absolute left-[-13px] top-[8px] bottom-[8px] w-[2px] bg-sidebar-primary rounded-r-[2px]" />
        )}
        <span
          className={cn(
            "rounded-full shrink-0 transition-all duration-150",
            active
              ? "w-[7px] h-[7px] bg-sidebar-primary"
              : "w-[5px] h-[5px] bg-sidebar-foreground/[0.15]",
          )}
        />
        <span
          className={cn(
            "truncate text-[13px] leading-none",
            active ? "font-medium text-sidebar-primary" : "text-sidebar-foreground/[0.32]",
          )}
        >
          {item.label}
        </span>
      </Link>
    );
  }
  // Top-level: Icon Box — ikon dibungkus kotak 28px rounded (abu transparan,
  // oranye tint saat aktif) + garis oranye 3px di sisi kiri saat aktif.
  // Rail (collapsed): kotak membesar jadi 44px dengan ikon 18px.
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center cursor-pointer transition-colors",
        collapsed
          ? cn(
              "w-[44px] h-[44px] mx-auto justify-center rounded-[9px]",
              active ? "bg-sidebar-primary/20" : "bg-white/[0.04] hover:bg-white/[0.08]",
            )
          : cn(
              "gap-[10px] px-[14px] py-[9px] mb-[1px]",
              active ? "bg-sidebar-primary/[0.08]" : "hover:bg-white/[0.04]",
            ),
      )}
      title={collapsed ? item.label : undefined}
    >
      {active && !collapsed && (
        <span className="absolute left-0 top-[7px] bottom-[7px] w-[3px] bg-sidebar-primary rounded-r-[3px]" />
      )}
      {collapsed ? (
        <item.icon
          className={cn(
            "size-[18px] shrink-0 transition-colors",
            active ? "text-sidebar-primary" : "text-sidebar-foreground/35",
          )}
        />
      ) : (
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] transition-colors",
            active ? "bg-sidebar-primary/20" : "bg-white/[0.06]",
          )}
        >
          <item.icon
            className={cn(
              "size-[15px] transition-colors",
              active ? "text-sidebar-primary" : "text-sidebar-foreground/35",
            )}
          />
        </div>
      )}
      {!collapsed && (
        <span
          className={cn(
            "truncate text-[13.5px] font-medium leading-none",
            active
              ? "text-sidebar-primary"
              : "text-sidebar-foreground/[0.38] group-hover:text-sidebar-foreground/[0.6]",
          )}
        >
          {item.label}
        </span>
      )}
    </Link>
  );
}

// ─── Collapsible group ──────────────────────────────────────────────────────────
function GroupBlock({
  group,
  pathname,
  onNavigate,
}: {
  group: MenuGroup;
  pathname: string;
  onNavigate?: () => void;
}) {
  const hasActiveChild = group.children.some((c) => c.to === pathname);
  const [open, setOpen] = useState(hasActiveChild);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* Trigger bergaya nav item Icon Box — kotak ikon oranye tint saat ada
          anak yang aktif, chevron collapsible di kanan. */}
      <CollapsibleTrigger
        className={cn(
          "group w-full flex items-center gap-[10px] px-[14px] py-[9px] mb-[1px] cursor-pointer transition-colors hover:bg-white/[0.04]",
        )}
      >
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] transition-colors",
            hasActiveChild ? "bg-sidebar-primary/20" : "bg-white/[0.06]",
          )}
        >
          <group.icon
            className={cn(
              "size-[15px] transition-colors",
              hasActiveChild ? "text-sidebar-primary" : "text-sidebar-foreground/35",
            )}
          />
        </div>
        <span
          className={cn(
            "truncate flex-1 text-left text-[13.5px] font-medium leading-none",
            hasActiveChild
              ? "text-sidebar-foreground/[0.85]"
              : "text-sidebar-foreground/[0.38] group-hover:text-sidebar-foreground/[0.6]",
          )}
        >
          {group.label}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto size-[13px] shrink-0 text-sidebar-foreground/[0.2] transition-transform",
            open && "rotate-180",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        {/* Rail border-left sejajar tengah kotak ikon — bullet sub-item Varian 2
            menempel pada garis ini. */}
        <ul className="ml-[27px] pl-[12px] border-l-[1.5px] border-white/[0.07] mt-[1px] mb-[2px] space-y-[1px]">
          {group.children.map((child) => (
            <li key={child.to}>
              <LeafLink
                item={child}
                active={pathname === child.to}
                collapsed={false}
                nested
                onNavigate={onNavigate}
              />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ─── Isi sidebar (dipakai bersama desktop aside & mobile sheet) ───────────────────
// `collapsed` hanya berlaku pada desktop (icon rail). `onNavigate` menutup sheet di mobile.
// `showCollapseToggle` menyembunyikan tombol collapse pada mode mobile (tak relevan di sheet).
function SidebarContent({
  menus,
  pathname,
  collapsed,
  onNavigate,
  showCollapseToggle,
  user,
  logout,
  toggleSidebar,
}: {
  menus: MenuNode[];
  pathname: string;
  collapsed: boolean;
  onNavigate?: () => void;
  showCollapseToggle: boolean;
  user: { name: string; role: string; rtupp?: { code: string } | null };
  logout: () => void;
  toggleSidebar: () => void;
}) {
  // Collapsed (icon rail): flatten leaves agar tetap bisa diakses sebagai ikon.
  const flatLeaves: MenuLeaf[] = menus.flatMap((n) => (isGroup(n) ? n.children : [n]));

  return (
    <>
      {/* Logo area — titik oranye PLN + wordmark + badge RTUPP. */}
      <div
        className={cn(
          "flex items-center gap-[10px] px-[18px] py-[15px] border-b border-sidebar-border shrink-0",
          collapsed && "justify-center px-2",
        )}
      >
        <div className="w-[10px] h-[10px] rounded-full bg-sidebar-primary shrink-0" />
        {!collapsed && (
          <>
            <span className="text-[15px] font-semibold text-sidebar-foreground tracking-[-0.3px]">
              VoltHub
            </span>
            <span className="ml-auto truncate text-[10px] font-medium bg-sidebar-primary/[0.15] text-sidebar-primary px-[9px] py-[2px] rounded-full uppercase">
              {user.rtupp?.code ?? user.role}
            </span>
          </>
        )}
      </div>

      {/* Info user — avatar inisial kotak + nama + role, di bawah logo. */}
      {!collapsed && (
        <div className="px-[14px] py-[10px] border-b border-sidebar-border shrink-0">
          <div className="bg-white/[0.04] rounded-[9px] px-[12px] py-[10px] flex items-center gap-[10px]">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-sidebar-primary/[0.18] text-[12px] font-bold text-sidebar-primary">
              {(user.name || "U").slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-sidebar-foreground truncate leading-tight">
                {user.name}
              </p>
              <p className="mt-[2px] truncate text-[10px] uppercase tracking-[0.06em] text-sidebar-foreground/[0.28]">
                {user.role}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tanpa padding horizontal saat expanded — item membawa px-[14px] sendiri
          agar garis aktif 3px menempel tepat di tepi sidebar. */}
      <nav className={cn("flex-1 overflow-y-auto py-3", collapsed && "px-2")}>
        {menus.length === 0 ? (
          <div className="px-[18px] text-sm text-sidebar-foreground/60">
            Menu tidak tersedia untuk role ini.
          </div>
        ) : collapsed ? (
          <ul className="space-y-[4px]">
            {flatLeaves.map((leaf) => (
              <li key={leaf.to}>
                <LeafLink
                  item={leaf}
                  active={pathname === leaf.to}
                  collapsed
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        ) : (
          menus.map((node) =>
            isGroup(node) ? (
              <GroupBlock
                key={node.label}
                group={node}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            ) : (
              <LeafLink
                key={node.to}
                item={node}
                active={pathname === node.to}
                collapsed={false}
                onNavigate={onNavigate}
              />
            ),
          )
        )}
      </nav>

      {/* Footer — logout + collapse (theme toggle pindah ke topbar header). */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-[6px] border-t border-sidebar-border px-[12px] py-[10px]",
          collapsed && "flex-col",
        )}
      >
        <button
          type="button"
          onClick={logout}
          className={cn(
            "flex cursor-pointer items-center gap-[8px] rounded-[8px] bg-white/[0.03] transition-colors hover:bg-white/[0.06]",
            collapsed ? "size-[34px] justify-center" : "flex-1 px-[11px] py-[8px]",
          )}
        >
          <LogOut className="size-[14px] shrink-0 text-sidebar-foreground/[0.28]" />
          {!collapsed && (
            <span className="text-[12.5px] text-sidebar-foreground/[0.28]">Logout</span>
          )}
        </button>
        {showCollapseToggle && (
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            className="flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-[8px] bg-white/[0.04] transition-colors hover:bg-white/[0.08]"
          >
            <ChevronLeft
              className={cn(
                "size-[14px] text-sidebar-foreground/[0.28] transition-transform",
                collapsed && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
    </>
  );
}

export function Sidebar({
  mobileOpen = false,
  onMobileOpenChange,
}: {
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}) {
  const { user, sidebarCollapsed, toggleSidebar, logout } = useAuthStore();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Safety: redirect if no user
  if (!user) {
    navigate({ to: "/login" });
    return null;
  }

  const menus = MENUS[user.role] ?? [];
  const collapsed = sidebarCollapsed;
  const closeMobile = () => onMobileOpenChange?.(false);

  // Redirect immediately — don't wait for the (fire-and-forget) server call.
  const handleLogout = () => {
    logout();
    navigate({ to: "/login", replace: true });
  };

  return (
    <>
      {/* Desktop (≥ lg): aside permanen — perilaku sama seperti sebelumnya */}
      <aside
        className={cn(
          "hidden lg:flex sticky top-0 h-screen flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border transition-all duration-300 z-30",
          collapsed ? "w-[72px]" : "w-[260px]",
        )}
      >
        <SidebarContent
          menus={menus}
          pathname={pathname}
          collapsed={collapsed}
          showCollapseToggle
          user={user}
          logout={handleLogout}
          toggleSidebar={toggleSidebar}
        />
      </aside>

      {/* Mobile / tablet (< lg): off-canvas drawer */}
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="lg:hidden p-0 w-[260px] sm:max-w-[260px] flex flex-col bg-sidebar text-sidebar-foreground border-sidebar-border"
        >
          <SheetTitle className="sr-only">Menu Navigasi</SheetTitle>
          <SidebarContent
            menus={menus}
            pathname={pathname}
            collapsed={false}
            onNavigate={closeMobile}
            showCollapseToggle={false}
            user={user}
            logout={logout}
            toggleSidebar={toggleSidebar}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
