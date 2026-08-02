// VoltHub — route guards (TanStack Router beforeLoad helpers).
// Reuses the V1 auth gate (requireAuth) and adds V2 role gating that mirrors the
// backend. Forbidden access routes to /unauthorized (DESIGN_SYSTEM §9), not the
// V1 dashboard.

import { redirect } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth";
import { requireAuth } from "@/lib/route-guards";
import { toV2Role, type V2Role, type V2Capability, can } from "./rbac";

function currentV2Role(): V2Role {
  return toV2Role(useAuthStore.getState().user?.role);
}

/** Require authentication (delegates to the shared V1 guard). */
export function requireV2Auth(): void {
  requireAuth();
}

/** Require the current user to hold one of `allowed` V2 roles. */
export function requireV2Role(allowed: readonly V2Role[]): void {
  requireAuth();
  if (!allowed.includes(currentV2Role())) {
    throw redirect({ to: "/unauthorized" });
  }
}

// Canonical role groups — kept in lock-step with the sidebar model (lib/v2/nav.ts)
// so a route is loadable exactly when its menu item is visible. The read-only
// MANAGER is admitted to VIEW operational, asset and management pages; the write
// controls inside those pages stay capability-gated (lib/v2/rbac.ts), so MANAGER
// can look but not mutate.

/** Field-officer entry pages (Pelaporan): PETUGAS only. */
export const FIELD_ONLY_ROLES: readonly V2Role[] = ["PETUGAS"] as const;

/** Operational & asset pages (read): MASTER, MANAGER, ADMIN. */
export const OPS_ROLES: readonly V2Role[] = ["MASTER", "MANAGER", "ADMIN"] as const;

/** Operational-admin WRITE pages (e.g. Import, Personil): ADMIN only —
 *  MASTER is a pure system administrator (no operational writes), MANAGER read-only. */
export const ADMIN_TIER_ROLES: readonly V2Role[] = ["ADMIN"] as const;

/** Approval Laporan (/validasi) VIEW: ADMIN acts; MASTER may open it read-only
 *  for audit (action buttons are capability-gated via "laporan.approve"). */
export const APPROVAL_VIEW_ROLES: readonly V2Role[] = ["MASTER", "ADMIN"] as const;

/** User management page: MASTER + ADMIN only. MANAGER is read-only and blocked
 *  from user accounts entirely — the guard redirects it to /unauthorized. */
export const USER_MGMT_ROLES: readonly V2Role[] = ["MASTER", "ADMIN"] as const;

/** System-owner only pages (system config, backup, dev tools): MASTER. */
export const MASTER_ONLY_ROLES: readonly V2Role[] = ["MASTER"] as const;

// ── SCADA snapshot surface (Siemens SP7 daily export) — mirrors backend groups.
/** SCADA Upload page: MASTER, MANAGER, NOC (the NOC team owns the export). */
export const SCADA_UPLOAD_ROLES: readonly V2Role[] = ["MASTER", "MANAGER", "NOC"] as const;

/** Inscan/OOP (RTU) dashboard: every role incl. PETUGAS di lapangan. */
export const SCADA_RTU_ROLES: readonly V2Role[] = [
  "MASTER",
  "MANAGER",
  "ADMIN",
  "NOC",
  "PETUGAS",
] as const;

/** SCADA Lines dashboard: monitoring tiers + NOC (no PETUGAS). */
export const SCADA_LINES_ROLES: readonly V2Role[] = [
  "MASTER",
  "MANAGER",
  "ADMIN",
  "NOC",
] as const;

/** @deprecated VoltHub renamed SUPERADMIN → MASTER. Use {@link MASTER_ONLY_ROLES}. */
export const SUPERADMIN_ONLY_ROLES = MASTER_ONLY_ROLES;

/** Require the current user to satisfy a semantic capability. */
export function requireV2Capability(capability: V2Capability): void {
  requireAuth();
  if (!can(currentV2Role(), capability)) {
    throw redirect({ to: "/unauthorized" });
  }
}
