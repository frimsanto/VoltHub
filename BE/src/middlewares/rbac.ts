import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { forbiddenResponse } from '../utils/response';
import {
  ROLES,
  WRITE_ROLES,
  REPORT_WRITE_ROLES,
  ADMIN_ROLES,
  MONITOR_ROLES,
  ALL_ROLES,
  normalizeRole,
  type CanonicalRole,
} from '../auth/roles';

/**
 * RBAC authorization middleware (VoltHub — canonical 4-role model).
 *
 * `authorize` accepts canonical roles (MASTER | MANAGER | ADMIN | PETUGAS) but
 * also tolerates legacy enum values (SUPERADMIN, ADMIN_RTUPP) passed by older
 * route files — both the allow-list and the caller's role are normalized before
 * the check (SUPERADMIN→MASTER, ADMIN_RTUPP→ADMIN), so deprecated literals never
 * need to appear yet legacy callers keep working (backward compatible, additive).
 */
export const authorize = (...allowedRoles: string[]) => {
  const allowed = new Set<CanonicalRole>(
    allowedRoles.map((r) => normalizeRole(r)).filter((r): r is CanonicalRole => r !== null)
  );

  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      forbiddenResponse(res, 'Authentication required');
      return;
    }

    const userRole = normalizeRole(req.user.role);

    if (!userRole || !allowed.has(userRole)) {
      forbiddenResponse(res, 'Insufficient permissions');
      return;
    }

    next();
  };
};

// Predefined role middlewares (canonical). No direct dependency on legacy values.
export const requireMaster = authorize(ROLES.MASTER);
/** @deprecated VoltHub renamed SUPER_ADMIN → MASTER. Alias of requireMaster. */
export const requireSuperAdmin = requireMaster;
export const requireAdmin = authorize(...ADMIN_ROLES); // ADMIN only — MASTER is not an operational actor
/** @deprecated name retained for legacy imports — equivalent to requireAdmin. */
export const requireAdminRtupp = authorize(...ADMIN_ROLES);
export const requirePetugas = authorize(...ALL_ROLES);

/**
 * Read-only monitoring tier (MASTER, MANAGER, ADMIN). Gate READ-only endpoints
 * that were previously admin-only (KPI, dashboards, audit-log view) with this so
 * the read-only MANAGER gains full visibility. MUST NOT guard mutating routes.
 */
export const requireMonitor = authorize(...MONITOR_ROLES);

// Report write access: field officers (PETUGAS) + ADMIN may write.
export const requireReportWrite = authorize(...REPORT_WRITE_ROLES);

// Master-data / asset write access (ADMIN only).
export const requireMasterWrite = authorize(...WRITE_ROLES);

// Ownership check for petugas - can only access own resources unless admin
export const requireOwnershipOrAdmin = (
  getOwnerId: (req: AuthRequest) => string | null | Promise<string | null>
) => {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      forbiddenResponse(res, 'Authentication required');
      return;
    }

    const userRole = normalizeRole(req.user.role);

    // Admin and SuperAdmin can access all
    if (userRole === ROLES.ADMIN || userRole === ROLES.SUPER_ADMIN) {
      next();
      return;
    }

    // Petugas can only access own resources
    const ownerId = await getOwnerId(req);

    if (ownerId && ownerId === req.user.userId) {
      next();
      return;
    }

    forbiddenResponse(res, 'You can only access your own resources');
  };
};
