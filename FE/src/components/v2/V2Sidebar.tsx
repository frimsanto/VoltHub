// VoltHub V2 — Sidebar
// Renders the V2 navigation model (lib/v2/nav.ts), filtered by the current user's
// V2 role (RBAC mirror). Responsive shell behaviour:
//   • Desktop (lg+)  — permanent sidebar, user-collapsible to a 72px icon rail.
//   • Tablet (md)    — icon rail by default, expandable.
//   • Mobile (<md)   — drawer (Sheet), always full width.
// In rail mode, leaves show tooltips and group icons expand the sidebar (no
// flyout submenus — a future enhancement). Nav model is read-only here.

import { useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useV2Role,
  hasRole,
  can,
  V2_ROLE_LABELS,
  type V2Capability,
  type V2Role,
} from "@/lib/v2/rbac";
import { isRtupp1User } from "@/lib/v2/rtupp";
import { useAuthStore } from "@/stores/auth";
import { BRAND_NAME } from "@/lib/brand";
import { V2_NAV, isV2Group, type V2NavGroup, type V2NavLeaf, type V2NavNode } from "@/lib/v2/nav";

// Visibility per current role (mirrors backend; read items are open). `rtupp1`
// gates the GIS-unit-only items (Laporan GI) — visible to RTUPP1 users or MASTER.
// `ghOnly` is the inverse: Gardu Hubung items visible only for RTUPP2-5 or MASTER.
function visible(
  node: {
    roles?: readonly V2Role[];
    capability?: V2Capability;
    rtupp1Only?: boolean;
    ghOnly?: boolean;
    mpOnly?: boolean;
  },
  role: ReturnType<typeof useV2Role>,
  rtupp1: boolean,
) {
  if (node.capability && !can(role, node.capability)) return false;
  if (node.roles && !hasRole(role, node.roles)) return false;
  if (node.rtupp1Only && !(rtupp1 || role === "MASTER")) return false;
  if (node.ghOnly && rtupp1 && role !== "MASTER") return false;
  if (node.mpOnly && rtupp1 && role !== "MASTER") return false;
  return true;
}

function filterNav(
  nodes: V2NavNode[],
  role: ReturnType<typeof useV2Role>,
  rtupp1: boolean,
): V2NavNode[] {
  return nodes
    .filter((n) => visible(n, role, rtupp1))
    .map((n) => {
      if (isV2Group(n)) {
        const children = n.children.filter((c) => visible(c, role, rtupp1));
        return { ...n, children };
      }
      return n;
    })
    .filter((n) => !isV2Group(n) || n.children.length > 0);
}

// TanStack Link is strongly typed against the route tree. V2 business routes are
// registered in later phases; we render real <Link>s now and relax the `to` type
// at this single boundary so the foundation typechecks without stub pages.
function NavLink({
  item,
  active,
  onNavigate,
  nested,
  collapsed,
}: {
  item: V2NavLeaf;
  active: boolean;
  onNavigate?: () => void;
  nested?: boolean;
  collapsed?: boolean;
}) {
  // Coming-soon items are non-navigable placeholders (Phase 2 roadmap).
  if (item.comingSoon) {
    const placeholder =
      nested && !collapsed ? (
        <div
          className="flex items-center gap-[9px] px-[4px] pr-[12px] py-[7px] rounded-[6px] cursor-not-allowed"
          aria-disabled="true"
          title="Segera hadir"
        >
          <span className="w-[5px] h-[5px] rounded-full bg-sidebar-foreground/[0.1] shrink-0" />
          <span className="truncate text-[13px] leading-none text-sidebar-foreground/[0.22]">
            {item.label}
          </span>
          <span className="ml-auto rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-sidebar-foreground/50">
            Soon
          </span>
        </div>
      ) : (
        <div
          className={cn(
            "flex items-center text-sidebar-foreground/[0.25] cursor-not-allowed",
            collapsed
              ? "w-[44px] h-[44px] mx-auto justify-center rounded-[9px] bg-white/[0.04]"
              : "gap-[10px] px-[14px] py-[9px] mb-[1px]",
          )}
          aria-disabled="true"
          title="Segera hadir"
        >
          {collapsed ? (
            <item.icon className="size-[18px] shrink-0" />
          ) : (
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] bg-white/[0.04]">
              <item.icon className="size-[15px]" />
            </div>
          )}
          {!collapsed && (
            <>
              <span className="truncate text-[13.5px] font-medium leading-none">{item.label}</span>
              <span className="ml-auto rounded-full bg-sidebar-accent px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-sidebar-foreground/50">
                Soon
              </span>
            </>
          )}
        </div>
      );
    return collapsed ? withTooltip(placeholder, `${item.label} — segera hadir`) : placeholder;
  }

  // Sub-item — Bullet Variant 2: bullet solid abu 5px yang membesar jadi 7px
  // oranye saat aktif, plus garis tipis 2px menimpa rail border-left induk.
  if (nested && !collapsed) {
    return (
      <Link
        to={item.to as never}
        onClick={onNavigate}
        className={cn(
          "relative flex items-center gap-[9px] px-[4px] pr-[12px] py-[7px] rounded-[6px] cursor-pointer transition-colors",
          active ? "bg-sidebar-primary/[0.06]" : "hover:bg-white/[0.04]",
        )}
      >
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
  const link = (
    <Link
      to={item.to as never}
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
  return collapsed ? withTooltip(link, item.label) : link;
}

// Wrap a rail item in a right-side tooltip showing its label.
function withTooltip(trigger: React.ReactNode, label: string) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function GroupBlock({
  group,
  pathname,
  onNavigate,
}: {
  group: V2NavGroup;
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
            "ml-auto size-[13px] shrink-0 text-sidebar-foreground/[0.2] transition-transform duration-200",
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
              <NavLink item={child} active={pathname === child.to} nested onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Rail-mode representation of a group: a single icon button that expands the
// sidebar so its children become reachable (no inline flyout — future work).
function CollapsedGroup({
  group,
  pathname,
  onExpand,
}: {
  group: V2NavGroup;
  pathname: string;
  onExpand?: () => void;
}) {
  const hasActiveChild = group.children.some((c) => c.to === pathname);
  const button = (
    <button
      type="button"
      onClick={onExpand}
      aria-label={`${group.label} — buka menu`}
      className={cn(
        "flex w-[44px] h-[44px] mx-auto items-center justify-center rounded-[9px] cursor-pointer transition-colors",
        hasActiveChild
          ? "bg-sidebar-primary/20 text-sidebar-primary"
          : "bg-white/[0.04] text-sidebar-foreground/35 hover:bg-white/[0.08]",
      )}
    >
      <group.icon className="size-[18px] shrink-0" />
    </button>
  );
  return withTooltip(button, group.label);
}

function Nav({
  pathname,
  onNavigate,
  collapsed,
  onExpand,
}: {
  pathname: string;
  onNavigate?: () => void;
  collapsed?: boolean;
  onExpand?: () => void;
}) {
  const role = useV2Role();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const rtupp1 = isRtupp1User(user);
  const menus = filterNav(V2_NAV, role, rtupp1);

  // Redirect immediately — don't wait for the (fire-and-forget) server call.
  const handleLogout = () => {
    logout();
    navigate({ to: "/login", replace: true });
  };
  return (
    // Explicit flex column with a definite height — a fragment would leave the
    // scroll area without a flex parent to size against inside the Sheet.
    <div className="flex h-full flex-col">
      {/* Brand area — logo VoltHub + wordmark + badge RTUPP. */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-3 border-b border-sidebar-border px-4 py-4",
          collapsed && "justify-center px-2",
        )}
      >
        {/* Logo dengan subtle glow */}
        <div className="relative shrink-0">
          <div className="absolute inset-0 rounded-xl bg-pln-yellow/25 blur-lg scale-90" aria-hidden />
          <div className="relative flex size-8 items-center justify-center rounded-xl border border-white/10 bg-sidebar-accent/80">
            <img src="/icon-volthub.png" alt={BRAND_NAME} className="size-5 object-contain" />
          </div>
        </div>
        {!collapsed && (
          <>
            <span className="min-w-0 text-[15px] font-bold tracking-tight text-sidebar-foreground">
              {BRAND_NAME}
            </span>
            <span className="ml-auto truncate rounded-full bg-sidebar-primary/[0.15] px-[9px] py-[2px] text-[10px] font-medium uppercase text-sidebar-primary">
              {user?.rtupp?.code ?? V2_ROLE_LABELS[role]}
            </span>
          </>
        )}
      </div>

      {/* Scrollable nav — hidden scrollbar + bottom fade hint that more items exist. */}
      <div className="relative min-h-0 flex-1 flex flex-col">
        {/* data-lenis-prevent: the app-wide Lenis instance intercepts wheel events
            globally; without this opt-out the nav never receives native wheel
            scroll and appears frozen. */}
        <nav
          data-lenis-prevent
          className={cn(
            // Tanpa padding horizontal saat expanded — item membawa px-[14px]
            // sendiri agar garis aktif 3px menempel tepat di tepi sidebar.
            "min-h-0 flex-1 overflow-y-auto py-3",
            collapsed && "space-y-[4px] px-2",
            "[&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
          )}
        >
        {menus.map((node) => {
          if (isV2Group(node)) {
            // A group that collapses to a single visible child renders as a
            // direct link (no dropdown) — e.g. PETUGAS sees only the single
            // "Dashboard Lapangan" item, so no pointless one-item dropdown.
            if (node.children.length === 1) {
              const child = node.children[0];
              return (
                <NavLink
                  key={child.to}
                  item={child}
                  active={pathname === child.to}
                  onNavigate={onNavigate}
                  collapsed={collapsed}
                />
              );
            }
            // Rail mode: groups become a single expanding icon button.
            if (collapsed) {
              return (
                <CollapsedGroup
                  key={node.label}
                  group={node}
                  pathname={pathname}
                  onExpand={onExpand}
                />
              );
            }
            return (
              <GroupBlock
                key={node.label}
                group={node}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            );
          }
          return (
            <NavLink
              key={node.to}
              item={node}
              active={pathname === node.to}
              onNavigate={onNavigate}
              collapsed={collapsed}
            />
          );
        })}
        </nav>
        {/* Gradient fade hint — there is more nav below the fold. */}
        {!collapsed && (
          <div
            className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-linear-to-t from-sidebar to-transparent"
            aria-hidden
          />
        )}
      </div>
      {/* Footer — logout saja (theme toggle pindah ke topbar header). */}
      <div
        className={cn(
          "flex shrink-0 items-center gap-[6px] border-t border-sidebar-border px-[12px] py-[10px]",
          collapsed && "flex-col",
        )}
      >
        <button
          type="button"
          onClick={handleLogout}
          data-testid="sidebar-logout"
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
      </div>
    </div>
  );
}

export function V2Sidebar({
  mobileOpen = false,
  onMobileOpenChange,
  collapsed = false,
  onExpand,
}: {
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
  collapsed?: boolean;
  onExpand?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const closeMobile = () => onMobileOpenChange?.(false);

  return (
    <>
      <TooltipProvider delayDuration={0}>
        <aside
          className={cn(
            "hidden md:flex sticky top-0 h-screen flex-col overflow-hidden bg-sidebar text-sidebar-foreground border-r border-sidebar-border/40 z-30 transition-[width] duration-200 ease-in-out",
            collapsed ? "w-[72px]" : "w-[260px]",
          )}
        >
          <Nav pathname={pathname} collapsed={collapsed} onExpand={onExpand} />
        </aside>
      </TooltipProvider>
      <Sheet open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <SheetContent
          side="left"
          className="md:hidden p-0 pt-safe pb-safe w-[260px] sm:max-w-[260px] flex flex-col overflow-hidden bg-sidebar text-sidebar-foreground border-sidebar-border"
        >
          <SheetTitle className="sr-only">Menu Navigasi</SheetTitle>
          {/* Drawer is always full width — never the rail. */}
          <Nav pathname={pathname} onNavigate={closeMobile} />
        </SheetContent>
      </Sheet>
    </>
  );
}
