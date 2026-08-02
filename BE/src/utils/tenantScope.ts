import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { hasGlobalScope, normalizeRole, ROLES } from '../auth/roles';
import { ForbiddenError } from './appError';

/**
 * Tenant-scoping core (Security Hardening Sprint — Priority 1).
 *
 * The operational domain (assets, inspections, HAR, tickets, documents,
 * performance, GIS) roots every row at `locations`, and `locations.rtuppId` is
 * the single tenant boundary (added by 20260614120000_location_tenant_rtupp_*).
 *
 * Scope resolution is FAIL-CLOSED:
 *   - MASTER                    → GLOBAL (system-owner audit read).
 *   - ADMIN                     → GLOBAL (2026-07 policy: data access only —
 *                                 menu/route capability and user management
 *                                 stay per-RTUPP, enforced elsewhere).
 *   - MANAGER + rtuppId null    → GLOBAL (Manager UP3, read-only).
 *   - MANAGER + rtuppId filled  → ASMEN: restricted to their own `rtuppId`.
 *   - PETUGAS                   → restricted to their own `rtuppId`.
 *   - A scoped user with NO rtuppId is DENIED (throws) — never silently global.
 *
 * The resolved scope is converted into Prisma `where` fragments that callers
 * spread into their queries. A GLOBAL scope contributes an empty fragment (no
 * predicate); a restricted scope contributes the tenant predicate. Because the
 * fragment is *always* applied, forgetting to special-case global cannot widen
 * access — the default is the restrictive branch.
 */

export type TenantScope =
  | { global: true; rtuppId: null }
  | { global: false; rtuppId: string };

const GLOBAL: TenantScope = { global: true, rtuppId: null };

export interface ScopeUser {
  userId: string;
  role?: string | null;
  /** From the JWT claim when present; resolved from the DB otherwise. */
  rtuppId?: string | null;
}

/**
 * Resolve scope straight from an authenticated request's `req.user`. Throws
 * fail-closed if the request somehow carries no identity (every scoped route is
 * behind `authenticate`, so this is a guard, not an expected path).
 */
export async function resolveRequestScope(user?: ScopeUser): Promise<TenantScope> {
  if (!user?.userId) {
    throw new ForbiddenError('Authentication required');
  }
  return resolveTenantScope(user);
}

/**
 * Resolve the requester's tenant scope. MASTER/ADMIN/Manager-UP3 are global.
 * Everyone else is pinned to their RTUPP; if that cannot be determined the
 * request is denied (fail-closed) rather than defaulting to a broad view.
 */
export async function resolveTenantScope(user: ScopeUser): Promise<TenantScope> {
  const role = normalizeRole(user.role);

  // MASTER is never RTUPP-bound — global without a DB hit.
  if (role === ROLES.MASTER) return GLOBAL;

  // ADMIN reads every RTUPP (data-only global; their rtuppId still matters for
  // user management and for stamping rows they create) — no DB hit needed.
  if (role === ROLES.ADMIN) return GLOBAL;

  // NOC (control room) is not RTUPP-bound by design (rtuppId null, like
  // MASTER): it reads the whole location-rooted monitoring surface (Locations,
  // GIS, SCADA snapshots). Granted HERE rather than via hasGlobalScope so NOC
  // gains no global visibility over the laporan/KPI domain, whose route guards
  // exclude it anyway.
  if (role === ROLES.NOC) return GLOBAL;

  // Prefer the JWT claim (no DB hit); fall back to a lookup for tokens minted
  // before the claim existed. Resolved BEFORE the MANAGER global decision so an
  // ASMEN (MANAGER + rtuppId) on a stale token is still scoped, never global.
  let rtuppId = user.rtuppId ?? null;
  if (rtuppId == null) {
    const row = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { rtuppId: true },
    });
    rtuppId = row?.rtuppId ?? null;
  }

  // MANAGER + rtuppId null → Manager UP3 (global read). With rtuppId → ASMEN,
  // which falls through to the restricted branch below.
  if (hasGlobalScope(user.role, rtuppId)) return GLOBAL;

  if (!rtuppId) {
    throw new ForbiddenError(
      'Akun Anda belum terhubung ke RTUPP. Hubungi administrator untuk mendapatkan akses.'
    );
  }
  return { global: false, rtuppId };
}

/**
 * Resolve scope from a bare userId (no token claims at hand) — used by the
 * import engine and other server-side flows that act on behalf of a user. Loads
 * the user's role + rtuppId from the DB. Fail-closed if the user is unknown.
 */
export async function resolveScopeForUserId(userId?: string | null): Promise<TenantScope> {
  if (!userId) {
    throw new ForbiddenError('Authentication required');
  }
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, rtuppId: true },
  });
  if (!row) throw new ForbiddenError('Authentication required');
  return resolveTenantScope({ userId, role: row.role, rtuppId: row.rtuppId });
}

/**
 * `where` fragment for queries directly on `locations`.
 * GLOBAL → {} (no predicate); restricted → { rtuppId }.
 */
export function locationScopeWhere(scope: TenantScope): Prisma.LocationWhereInput {
  return scope.global ? {} : { rtuppId: scope.rtuppId };
}

/**
 * `where` fragment for tables that hang off a location via a `location` relation
 * (Asset, Inspection, HarReport, Ticket, Document, PerformanceDaily,
 * CommunicationMedia). GLOBAL → {}; restricted → { location: { rtuppId } }.
 */
export function viaLocationScopeWhere(scope: TenantScope): { location?: { rtuppId: string } } {
  return scope.global ? {} : { location: { rtuppId: scope.rtuppId } };
}

/** True when a row's owning RTUPP is visible under the scope. */
export function rtuppInScope(scope: TenantScope, rtuppId: string | null | undefined): boolean {
  if (scope.global) return true;
  return !!rtuppId && rtuppId === scope.rtuppId;
}
