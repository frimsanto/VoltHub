// VoltHub — RBAC UI Architecture
//
// Single source of truth for *frontend* role gating. This MIRRORS the backend
// role checks (src/auth/roles.ts) — it does NOT define or change authorization.
// The backend remains the enforcer; this layer only decides what the UI
// shows/enables so users never click an action that would 403.
//
// Canonical 4-role set (mirrors the backend normalizeRole fold):
//   MASTER   — pure system administrator. Global READ (audit) + user/system
//              management. NOT an operational actor: holds NO operational
//              write capability (approve/import/CRUD data operasional).
//   MANAGER  — READ-ONLY full access (monitoring). Holds NO write capability.
//              rtuppId filled ⇒ ASMEN (Asisten Manager), scoped per-RTUPP di BE.
//   ADMIN    — operational hub (work order/laporan/asset CRUD + approval).
//   PETUGAS  — field officer (own work order + laporan + uploads).
//
// Legacy roles fold in: SUPERADMIN → MASTER, ADMIN_RTUPP → ADMIN, USER → PETUGAS.
// `toV2Role` normalises any backend/stored role string into this set.

import { useAuthStore } from "@/stores/auth";

export type V2Role = "MASTER" | "MANAGER" | "ADMIN" | "PETUGAS" | "NOC";

export const V2_ROLES: readonly V2Role[] = [
  "MASTER",
  "MANAGER",
  "ADMIN",
  "PETUGAS",
  "NOC",
] as const;

export const V2_ROLE_LABELS: Record<V2Role, string> = {
  MASTER: "Master",
  MANAGER: "Manager",
  ADMIN: "Admin",
  PETUGAS: "Petugas",
  NOC: "NOC",
};

/** Normalise any backend/stored role string into the canonical V2 role. */
export function toV2Role(role: string | null | undefined): V2Role {
  switch ((role ?? "").toUpperCase()) {
    // Legacy global admin collapses into the system-owner MASTER role.
    case "MASTER":
    case "SUPERADMIN":
    case "SUPER_ADMIN":
      return "MASTER";
    case "MANAGER":
      return "MANAGER";
    // NOC — control-room operator (SCADA upload + monitoring, not RTUPP-bound).
    case "NOC":
      return "NOC";
    // Legacy ADMIN_RTUPP collapses into the canonical ADMIN role.
    case "ADMIN":
    case "ADMIN_RTUPP":
      return "ADMIN";
    // USER (legacy) and PETUGAS are the same field tier.
    case "USER":
    case "PETUGAS":
    default:
      return "PETUGAS"; // least privilege fallback
  }
}

// ── Capability matrix ────────────────────────────────────────────────────────
// Semantic *write/admin* actions → roles allowed (mirrors backend WRITE_ROLES /
// REPORT_WRITE_ROLES / MASTER_ONLY). MANAGER is read-only: it appears in NO
// capability, so every write/admin control is hidden for it. MASTER is likewise
// excluded from every OPERATIONAL write — pure system administrator; it keeps
// only users.manage and system.access. Read visibility is driven by the nav
// `roles` lists (lib/v2/nav.ts), not here.
const ADMIN_TIER: V2Role[] = ["ADMIN"]; // master-data & operational write — MASTER bukan operational actor
const REPORT_WRITE: V2Role[] = ["ADMIN", "PETUGAS"]; // create incl. field officers
const MASTER_ONLY: V2Role[] = ["MASTER"]; // system configuration & administration
// User-account management (add/remove ADMIN & PETUGAS accounts). MASTER + ADMIN
// only — MANAGER is read-only and holds NO write capability anywhere, user
// accounts included (mirrors backend canManageUsers). Kept separate from
// admin.access so operational writes stay MASTER+ADMIN. Fine-grained target-role/
// RTUPP rules are enforced by the backend.
const USER_MGMT: V2Role[] = ["MASTER", "ADMIN"];

// SCADA snapshot upload (Siemens SP7 daily export) — the one write NOC holds.
// Mirrors backend SCADA_UPLOAD_ROLES (MASTER, MANAGER, NOC).
const SCADA_UPLOAD: V2Role[] = ["MASTER", "MANAGER", "NOC"];

export type V2Capability =
  | "locations.write"
  | "feeders.write"
  | "assets.write"
  | "simCards.write"
  | "commMedia.write"
  | "inspections.create"
  | "laporan.approve"
  | "har.create"
  | "har.detail.write"
  | "documents.upload"
  | "documents.delete"
  | "reports.generate"
  | "imports.run"
  | "tickets.create"
  | "tickets.write"
  | "workOrders.create"
  | "workOrders.manage"
  | "workOrders.execute"
  | "bays.write"
  | "users.manage"
  | "admin.access"
  | "system.access"
  | "scada.upload";

export const V2_CAPABILITIES: Record<V2Capability, V2Role[]> = {
  "locations.write": ADMIN_TIER,
  "feeders.write": ADMIN_TIER,
  "assets.write": ADMIN_TIER,
  "simCards.write": ADMIN_TIER,
  "commMedia.write": ADMIN_TIER,
  "inspections.create": REPORT_WRITE,
  "laporan.approve": ADMIN_TIER, // approve/reject laporan — ADMIN only, MASTER read-only audit
  "har.create": REPORT_WRITE,
  "har.detail.write": ADMIN_TIER,
  "documents.upload": REPORT_WRITE,
  "documents.delete": ADMIN_TIER,
  "reports.generate": ADMIN_TIER,
  "imports.run": ADMIN_TIER, // backend import = WRITE_ROLES (ADMIN only)
  "tickets.create": REPORT_WRITE, // field officers may raise work orders
  "tickets.write": ADMIN_TIER, // update/assign/close/delete
  // Work Order domain (Operation Management System GI RTUPP1)
  "workOrders.create": ADMIN_TIER, // ADMIN terbitkan & assign WO (MASTER/petugas tidak)
  "workOrders.manage": ADMIN_TIER, // assign/approve/reject/close/reopen/delete
  "workOrders.execute": REPORT_WRITE, // start/submit — petugas pelaksana
  "bays.write": ADMIN_TIER, // master data Bay
  "users.manage": USER_MGMT, // account CRUD — MASTER + ADMIN (MANAGER read-only)
  "admin.access": ADMIN_TIER, // operational administration (users, etc.)
  "system.access": MASTER_ONLY, // system config / backup / dev tools
  "scada.upload": SCADA_UPLOAD, // replace the daily SP7 SCADA snapshot
};

/** Does `role` satisfy `capability`? */
export function can(role: V2Role, capability: V2Capability): boolean {
  return V2_CAPABILITIES[capability].includes(role);
}

/** Is `role` within `allowed`? (empty/undefined `allowed` ⇒ any authenticated) */
export function hasRole(role: V2Role, allowed?: readonly V2Role[]): boolean {
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(role);
}

/** True when the role may only read (MANAGER) — handy for global UI affordances. */
export function isReadOnlyRole(role: V2Role): boolean {
  return role === "MANAGER";
}

/**
 * Human label for a role. ASMEN (Asisten Manager) is NOT a separate role — it is
 * a MANAGER with rtuppId filled (RTUPP-scoped), so pass the user's rtuppId (or
 * rtupp.id) to surface the distinction everywhere a role is displayed.
 */
export function displayRole(role: V2Role, rtuppId?: string | null): string {
  if (role === "MANAGER" && rtuppId) return "Asisten Manager";
  return V2_ROLE_LABELS[role] ?? role;
}

// ── Hooks ────────────────────────────────────────────────────────────────────
/** Current user's canonical V2 role (PETUGAS fallback when unauthenticated). */
export function useV2Role(): V2Role {
  return toV2Role(useAuthStore((s) => s.user?.role));
}

/** Reactive capability check for components. */
export function useCan(capability: V2Capability): boolean {
  return can(useV2Role(), capability);
}
