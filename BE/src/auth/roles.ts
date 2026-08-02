/**
 * Canonical RBAC role set — VoltHub 4-role hierarchy (single source of truth).
 *
 * The official VoltHub roles (Lead-Architect directive) drive ALL authorization:
 *
 *   MASTER   — pure system administrator. Global READ (audit/monitoring) + user/
 *              role management + system menus (backup/restore, config, dev
 *              tools). NOT an operational actor: never approves, imports, or
 *              CRUDs operational data — it appears in no operational write group.
 *   MANAGER  — READ-ONLY full access. rtuppId null → Manager UP3 (sees every
 *              RTUPP); rtuppId filled → ASMEN / Asisten Manager (same role,
 *              scoped to their own RTUPP — see hasGlobalScope). Never
 *              create/update/delete/import/approve/configure.
 *   ADMIN    — operational hub. Work Order + Laporan CRUD + APPROVAL, asset/gardu/
 *              penyulang/inspection/HAR/document CRUD, CRUD Petugas+Admin. No
 *              system config/backup/restore/dev tools.
 *   PETUGAS  — field officer. Own WO + Laporan Awal/Akhir + uploads. No master
 *              data, no approval, no monitoring-global, no system access.
 *
 * Backward compatibility (ADDITIVE migration): the live MySQL `UserRole` enum
 * carries `MASTER, MANAGER, SUPERADMIN, ADMIN, ADMIN_RTUPP, PETUGAS`. Legacy
 * values are normalized here so existing tokens/users keep working untouched:
 *   SUPERADMIN/SUPER_ADMIN → MASTER, ADMIN_RTUPP → ADMIN, USER → PETUGAS.
 */

export const ROLES = {
  MASTER: 'MASTER',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
  PETUGAS: 'PETUGAS',
  /** NOC — control-room operator. Not RTUPP-bound (rtuppId null, like MASTER).
   *  Uploads the daily Siemens SP7 SCADA exports and reads the SCADA/GIS/
   *  Location monitoring surface. Holds NO laporan approval, user management,
   *  work-order, or master-data capability — it appears in no write group. */
  NOC: 'NOC',
  /** @deprecated VoltHub renamed SUPER_ADMIN → MASTER. Alias kept so existing
   *  `ROLES.SUPER_ADMIN` references resolve to the canonical MASTER value. */
  SUPER_ADMIN: 'MASTER',
} as const;

export type CanonicalRole = 'MASTER' | 'MANAGER' | 'ADMIN' | 'PETUGAS' | 'NOC';

/** Legacy/DB enum value → canonical role. */
const LEGACY_TO_CANONICAL: Record<string, CanonicalRole> = {
  MASTER: ROLES.MASTER,
  SUPERADMIN: ROLES.MASTER, // legacy global admin → MASTER
  SUPER_ADMIN: ROLES.MASTER,
  MANAGER: ROLES.MANAGER,
  ADMIN: ROLES.ADMIN,
  ADMIN_RTUPP: ROLES.ADMIN, // deprecated → folded into ADMIN
  PETUGAS: ROLES.PETUGAS,
  USER: ROLES.PETUGAS, // legacy field-tier alias → folded into PETUGAS
  NOC: ROLES.NOC,
};

/**
 * Map any role string (legacy enum or canonical) to a canonical role.
 * Returns null for unknown/empty values so callers fail closed.
 */
export const normalizeRole = (role?: string | null): CanonicalRole | null => {
  if (!role) return null;
  return LEGACY_TO_CANONICAL[String(role).trim().toUpperCase()] ?? null;
};

// ── Role predicates (canonical, legacy-tolerant) ────────────────────────────

/** True for the system owner (legacy SUPERADMIN or canonical MASTER). */
export const isMaster = (role?: string | null): boolean =>
  normalizeRole(role) === ROLES.MASTER;

/** @deprecated VoltHub renamed the global role to MASTER. Alias of {@link isMaster}. */
export const isSuperAdmin = isMaster;

/** True for the read-only monitoring role. */
export const isManager = (role?: string | null): boolean =>
  normalizeRole(role) === ROLES.MANAGER;

/**
 * True for the operational write tier — ADMIN only.
 * MASTER intentionally excluded — system-owner is not an operational actor.
 * Use MONITOR_ROLES for read access that should include MASTER.
 * MANAGER is intentionally excluded: it is read-only.
 */
export const isAdmin = (role?: string | null): boolean =>
  normalizeRole(role) === ROLES.ADMIN;

/**
 * True for roles that may only read (MANAGER). Used to harden any code path
 * that must never mutate for the monitoring role even if a route is permissive.
 */
export const isReadOnly = (role?: string | null): boolean =>
  normalizeRole(role) === ROLES.MANAGER;

// ── User-management authorization (account CRUD) ────────────────────────────
//
// User accounts are managed by MASTER and ADMIN only. MASTER manages every role;
// ADMIN manages ADMIN/PETUGAS within its own RTUPP (RTUPP scoping enforced
// separately). MANAGER is deliberately EXCLUDED: it is a read-only monitoring
// role and holds NO write capability anywhere, user accounts included. This is
// separate from {@link isAdmin}/{@link WRITE_ROLES} so the operational write tier
// stays ADMIN only while MASTER keeps user management despite holding no
// operational write.

/**
 * May the operator manage user accounts at all (create/update/delete/reset)?
 * MASTER and ADMIN qualify; MANAGER (read-only), PETUGAS and unknown roles do not.
 */
export const canManageUsers = (role?: string | null): boolean => {
  const r = normalizeRole(role);
  return r === ROLES.MASTER || r === ROLES.ADMIN;
};

/**
 * May an operator act on a target account with role `targetRole`?
 *   - MASTER: any target.
 *   - ADMIN: only PETUGAS targets — never ADMIN/MANAGER/MASTER.
 *   - anyone else (incl. read-only MANAGER): never.
 * RTUPP scoping (ADMIN → own RTUPP only) is enforced separately by the caller.
 */
export const canManageTargetRole = (
  operatorRole?: string | null,
  targetRole?: string | null
): boolean => {
  if (!canManageUsers(operatorRole)) return false;
  if (isMaster(operatorRole)) return true;

  const op = normalizeRole(operatorRole);
  const t = normalizeRole(targetRole);

  if (op === ROLES.ADMIN) {
    return t === ROLES.PETUGAS;
  }

  return false;
};

/**
 * True for roles whose DATA scope is GLOBAL (all RTUPPs).
 * - MASTER: always global.
 * - ADMIN: always global (2026-07 policy — operational hub reads every RTUPP).
 *   DATA only: menu/route capability (MASTER_ONLY, /sistem) is unchanged, and
 *   user management stays pinned per-RTUPP (userController resolves its own
 *   operator scope, deliberately NOT via this predicate).
 * - MANAGER + rtuppId = null → Manager UP3 (global read).
 * - MANAGER + rtuppId = filled → ASMEN (scoped to their RTUPP, NOT global).
 * - PETUGAS: always scoped to their RTUPP.
 *
 * Pass rtuppId from the authenticated user's JWT/DB record. Centralizes the
 * scope decision so services (KPI, dashboards) resolve visibility consistently.
 */
export const hasGlobalScope = (
  role?: string | null,
  rtuppId?: string | null
): boolean => {
  const r = normalizeRole(role);
  if (r === ROLES.MASTER) return true;
  if (r === ROLES.ADMIN) return true; // global data access regardless of rtuppId
  if (r === ROLES.MANAGER) return !rtuppId; // null = global Manager, filled = ASMEN
  return false;
};

/**
 * True only for the field-officer tier (PETUGAS). Use to gate the "own records
 * only" branch in report/history scoping: PETUGAS sees their own reports, while
 * every higher tier (MASTER/MANAGER/ADMIN global, ASMEN by RTUPP) sees more.
 */
export const isFieldOfficer = (role?: string | null): boolean =>
  normalizeRole(role) === ROLES.PETUGAS;

// ── Canonical role groups ───────────────────────────────────────────────────

/** Every authenticated role. */
export const ALL_ROLES: CanonicalRole[] = [
  ROLES.MASTER,
  ROLES.MANAGER,
  ROLES.ADMIN,
  ROLES.PETUGAS,
];

/** Master-data & operational write (Asset/Gardu/UP3/Ticket manage): ADMIN only —
 *  MASTER is a pure system administrator, not an operational actor. */
export const WRITE_ROLES: CanonicalRole[] = [ROLES.ADMIN];

/** Report/operational create incl. field officers (laporan, inspection, ticket create). */
export const REPORT_WRITE_ROLES: CanonicalRole[] = [ROLES.ADMIN, ROLES.PETUGAS];

/** System-owner only (user/role/permission mgmt, backup/restore, config, dev tools). */
export const MASTER_ONLY: CanonicalRole[] = [ROLES.MASTER];

/** @deprecated renamed → {@link MASTER_ONLY}. */
export const SUPER_ONLY = MASTER_ONLY;

/** Admin-tier write/manage (mutations gated to the operational hub): ADMIN only. */
export const ADMIN_ROLES: CanonicalRole[] = [ROLES.ADMIN];

/** System-owner + monitoring read untuk keperluan audit. */
export const AUDIT_READ_ROLES: CanonicalRole[] = [ROLES.MASTER, ROLES.MANAGER];

/**
 * Monitoring read tier: MASTER + MANAGER + ADMIN. Use for READ endpoints that
 * were previously ADMIN-only (KPI, dashboards, audit-log view) so the read-only
 * MANAGER gains full visibility WITHOUT any write capability. Never use this
 * group on a mutating route — writes belong to {@link WRITE_ROLES}/{@link ADMIN_ROLES}.
 */
export const MONITOR_ROLES: CanonicalRole[] = [ROLES.MASTER, ROLES.MANAGER, ROLES.ADMIN];

// ── SCADA snapshot surface (Siemens SP7 daily export) ───────────────────────
// NOC is deliberately absent from every group above: its access is exactly the
// SCADA monitoring surface below plus the read-only Location/GIS scope granted
// in utils/tenantScope.ts (global, since NOC carries no rtuppId).

/** May upload/replace the daily SP7 export and see the upload history. */
export const SCADA_UPLOAD_ROLES: CanonicalRole[] = [ROLES.MASTER, ROLES.MANAGER, ROLES.NOC];

/** RTU (Inscan/OOP) read surface — every role incl. field officers. */
export const SCADA_RTU_READ_ROLES: CanonicalRole[] = [
  ROLES.MASTER,
  ROLES.MANAGER,
  ROLES.ADMIN,
  ROLES.NOC,
  ROLES.PETUGAS,
];

/** Lines (IFS channel) read surface — monitoring tiers + NOC, no PETUGAS. */
export const SCADA_LINES_READ_ROLES: CanonicalRole[] = [
  ROLES.MASTER,
  ROLES.MANAGER,
  ROLES.ADMIN,
  ROLES.NOC,
];
