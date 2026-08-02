// VoltHub V2 — App Layout (shell)
// Sidebar (V2) + Topbar + scrollable content, mirroring the V1 _app layout
// (DESIGN_SYSTEM §1). Self-contained topbar (theme toggle + user menu + mobile
// menu button) so the V2 shell is decoupled from V1-specific topbar content.

import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Menu, LogOut, User as UserIcon, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { resolveAvatarUrl } from "@/lib/api/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { V2Sidebar } from "./V2Sidebar";
import { PetugasBottomNav } from "@/components/mobile/PetugasBottomNav";
import { MobileNavShell } from "@/components/mobile/MobileNavShell";
import { GlobalSearch } from "./GlobalSearch";
import { AssistantFab } from "./AssistantFab";
import { Breadcrumbs } from "./Breadcrumbs";
import { PageContainer } from "./PageContainer";
import { NotificationCenter } from "@/components/NotificationCenter";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useV2Role, displayRole, type V2Role } from "@/lib/v2/rbac";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useKeyboardInset } from "@/hooks/useKeyboardInset";
import { initLenis, destroyLenis } from "@/lib/lenis";

// Every canonical role now navigates via a native bottom-nav shell on phones —
// PETUGAS via PetugasBottomNav, the rest via MobileNavShell (+ its "Lainnya"
// overflow sheet). So the topbar hamburger / sidebar drawer is retired on mobile
// for all of them. Kept as a guard (not deleted) so a future role without a shell
// still falls back to the drawer, and so the drawer infra stays intact.
const ROLES_WITH_BOTTOM_NAV: readonly V2Role[] = [
  "MASTER",
  "MANAGER",
  "ADMIN",
  "NOC",
  "PETUGAS",
] as const;

function V2Topbar({
  onMenuClick,
  onToggleSidebar,
  collapsed,
}: {
  onMenuClick: () => void;
  onToggleSidebar: () => void;
  collapsed: boolean;
}) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const role = useV2Role();
  const initials = (user?.name ?? "U")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Redirect immediately — don't wait for the (fire-and-forget) server call.
  const handleLogout = () => {
    logout();
    navigate({ to: "/login", replace: true });
  };

  return (
    // Opsi D: topbar flat 50px bg-card — breadcrumb + search + theme + bell + avatar.
    // PETUGAS phones: hidden — each mobile screen owns its own native-style header
    // (greeting hero on Beranda, sticky back+title elsewhere) instead of the
    // generic breadcrumb bar. Untouched on tablet/desktop and for every other role.
    <header
      className={cn(
        "sticky top-0 z-20 flex min-h-[var(--topbar-h)] items-center gap-[10px] border-b border-border bg-card px-[18px] pt-safe",
        role === "PETUGAS" && "max-md:hidden",
      )}
    >
      {/* Collapse/expand the rail — tablet & desktop. */}
      <Button
        variant="ghost"
        size="icon"
        className="hidden md:inline-flex"
        onClick={onToggleSidebar}
        aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
        aria-pressed={collapsed}
      >
        {collapsed ? <PanelLeftOpen className="size-5" /> : <PanelLeftClose className="size-5" />}
      </Button>
      {/* Open the navigation drawer — mobile only. Roles with a bottom-nav shell
          (all canonical roles today) navigate via that shell + its overflow sheet,
          so they get no hamburger/drawer; the guard leaves a drawer fallback for
          any future shell-less role. */}
      {!ROLES_WITH_BOTTOM_NAV.includes(role) && (
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onMenuClick}
          aria-label="Buka menu"
        >
          <Menu className="size-5" />
        </Button>
      )}
      {/* Navigation hierarchy — full trail on md+, current page on mobile. */}
      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>
      {/* Global quick-search (Ctrl/Cmd-K). */}
      <div className="hidden md:flex">
        <GlobalSearch />
      </div>
      <div className="ml-auto flex items-center gap-[10px]">
        <div className="md:hidden">
          <GlobalSearch />
        </div>
        {/* Theme Toggle — satu-satunya lokasi (dicabut dari footer sidebar). */}
        <ThemeToggle className="text-muted-foreground hover:text-foreground" />
        <NotificationCenter />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex cursor-pointer items-center rounded-[8px]"
              aria-label="Menu pengguna"
              data-testid="user-menu-trigger"
            >
              <Avatar className="size-8 rounded-[8px]">
                {resolveAvatarUrl(user?.avatar) && (
                  <AvatarImage src={resolveAvatarUrl(user?.avatar)} alt={user?.name ?? ""} />
                )}
                <AvatarFallback className="rounded-[8px] bg-primary/[0.15] text-[11px] font-bold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="truncate font-medium">{user?.name}</div>
              <div className="text-xs font-normal text-muted-foreground">
                {displayRole(role, user?.rtupp?.id)}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/profile" })}>
              <UserIcon className="mr-2 size-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} data-testid="logout-button">
              <LogOut className="mr-2 size-4" /> Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const breakpoint = useBreakpoint();
  // The phone bottom-tab-bar + center FAB are PETUGAS's field-first navigation
  // model. Management roles (MASTER/MANAGER/ADMIN) always use the sidebar shell —
  // even on a narrow viewport they get the drawer (hamburger in the top bar), NOT
  // the petugas mobile chrome. Gating by role (not just the `md:` breakpoint) is
  // what keeps an ADMIN from seeing the field officer's bottom nav/FAB.
  const role = useV2Role();
  const isPetugas = role === "PETUGAS";
  // Track the soft-keyboard height into `--kb-inset` so sticky UI lifts above it.
  useKeyboardInset();
  // Lenis smooth scroll for the whole app shell (wheel only; touch stays native).
  useEffect(() => {
    initLenis();
    return () => destroyLenis();
  }, []);
  // PETUGAS mobile "m-banking" skin — toggled on <html> (mirrors lib/theme.ts'
  // .dark pattern) so it also reaches Radix portals (Drawer/Dialog/Select) that
  // mount on <body>, not just this component's subtree. The actual color/radius
  // override only fires under the <768px media query in styles.css, so this is a
  // no-op for every other role and for PETUGAS on tablet/desktop.
  useEffect(() => {
    document.documentElement.classList.toggle("petugas-mobile", isPetugas);
    return () => document.documentElement.classList.remove("petugas-mobile");
  }, [isPetugas]);
  const sidebarCollapsed = useAuthStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAuthStore((s) => s.toggleSidebar);
  const setSidebarCollapsed = useAuthStore((s) => s.setSidebarCollapsed);

  // Tablet defaults to the icon rail each session (limited width); expansion is
  // in-session only. Desktop uses the persisted `sidebarCollapsed` preference.
  const [tabletExpanded, setTabletExpanded] = useState(false);
  const collapsed = breakpoint === "tablet" ? !tabletExpanded : sidebarCollapsed;

  const handleToggle = () => {
    if (breakpoint === "tablet") setTabletExpanded((v) => !v);
    else toggleSidebar();
  };
  const handleExpand = () => {
    if (breakpoint === "tablet") setTabletExpanded(true);
    else setSidebarCollapsed(false);
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <V2Sidebar
        mobileOpen={mobileNavOpen}
        onMobileOpenChange={setMobileNavOpen}
        collapsed={collapsed}
        onExpand={handleExpand}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <V2Topbar
          onMenuClick={() => setMobileNavOpen(true)}
          onToggleSidebar={handleToggle}
          collapsed={collapsed}
        />
        <main className="flex-1">
          <PullToRefresh>
            <PageContainer>{children}</PageContainer>
          </PullToRefresh>
        </main>
        {/* Footer global — © kiri + brand perusahaan kanan. Margin bottom mengikuti
            --bottomnav-h agar tidak tertutup tab bar PETUGAS (0 di tablet/desktop). */}
        <footer
          className={cn(
            // mb-(--bottomnav-h) clears whichever bottom nav is mounted (PETUGAS or
            // the management/NOC shell). It resolves to 0 at md+ (styles.css), so
            // this only affects mobile — desktop footer spacing is untouched.
            "flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-card px-[18px] py-[10px] mb-(--bottomnav-h)",
          )}
        >
          <p className="text-[11px] text-muted-foreground">
            © {new Date().getFullYear()} VoltReport · Sistem Pelaporan Operasional PLN
          </p>
          <p className="text-[11px] text-muted-foreground">
            Powered by <span className="font-medium text-primary">PT. Nakani Raya Group</span>
          </p>
        </footer>
      </div>
      {/* Native-style bottom nav (mobile only). PETUGAS keeps its field-first
          bar; MASTER/MANAGER/ADMIN/NOC get the adaptive management shell. Each
          component self-guards on role + `md:hidden`, so the two never overlap and
          neither leaks onto tablet/desktop. */}
      {isPetugas ? <PetugasBottomNav /> : <MobileNavShell />}
      {/* Global floating AI Assistant — available on every page (OPS roles). */}
      <AssistantFab />
    </div>
  );
}
