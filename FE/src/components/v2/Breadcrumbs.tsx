// VoltHub V2 — Breadcrumbs
// Derives the navigation trail from the declarative sitemap (lib/v2/nav.ts) and
// the current pathname. Read-only consumer of V2_NAV — it never mutates nav or
// touches routing/permissions. Lives in the topbar (full trail on md+, current
// page only on mobile). For detail routes (/gardu/$id) it links back to the list
// and shows a generic current crumb.

import { Fragment } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { V2_NAV, isV2Group, type V2NavLeaf } from "@/lib/v2/nav";
import { useV2Role } from "@/lib/v2/rbac";

interface Crumb {
  label: string;
  to?: string;
}

// Find the leaf matching a base path (first path segment) and its parent group
// label, scanning the same ordered sitemap the sidebar renders.
function findLeaf(base: string): { leaf: V2NavLeaf; groupLabel?: string } | null {
  for (const node of V2_NAV) {
    if (isV2Group(node)) {
      const leaf = node.children.find((c) => c.to === base);
      if (leaf) return { leaf, groupLabel: node.label };
    } else if (node.to === base) {
      return { leaf: node };
    }
  }
  return null;
}

// Humanise an unknown URL segment (fallback when a route isn't in the sitemap).
function humanize(segment: string): string {
  return segment
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function buildCrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const base = `/${segments[0]}`;
  const match = findLeaf(base);
  const isDetail = segments.length > 1;

  if (!match) {
    // Route not in the sitemap — show a single humanised crumb.
    return [{ label: humanize(segments[isDetail ? 1 : 0]) }];
  }

  const crumbs: Crumb[] = [];
  if (match.groupLabel) crumbs.push({ label: match.groupLabel });

  if (isDetail) {
    crumbs.push({ label: match.leaf.label, to: match.leaf.to });
    crumbs.push({ label: "Detail" });
  } else {
    crumbs.push({ label: match.leaf.label });
  }
  return crumbs;
}

export function Breadcrumbs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const role = useV2Role();
  const crumbs = buildCrumbs(pathname);
  if (crumbs.length === 0) return null;

  const last = crumbs[crumbs.length - 1];
  // PETUGAS landing (/lapangan) is their home — show "Beranda" so the top bar
  // doesn't echo the in-page greeting hero ("Selamat sore …"). Other pages keep
  // their real page label.
  const mobileLabel = role === "PETUGAS" && pathname === "/lapangan" ? "Beranda" : last.label;

  return (
    <div className="min-w-0">
      {/* Mobile: current page label only. */}
      <span className="truncate text-sm font-medium text-foreground md:hidden">{mobileLabel}</span>

      {/* Tablet/desktop: full trail. */}
      <Breadcrumb className="hidden md:block">
        <BreadcrumbList>
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            return (
              <Fragment key={`${crumb.label}-${i}`}>
                <BreadcrumbItem>
                  {isLast || !crumb.to ? (
                    <BreadcrumbPage className="truncate">{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      {/* V2 routes are typed once registered; relax at this boundary. */}
                      <Link to={crumb.to as never}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
