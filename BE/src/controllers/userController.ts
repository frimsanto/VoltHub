import { Response } from 'express';
import { hashPassword } from '../utils/password';
import prisma from '../config/database';
import { AuthRequest } from '../middlewares/auth';
import { successResponse, errorResponse, validationErrorResponse } from '../utils/response';
import { recordAudit } from '../utils/audit';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  normalizeRole,
  isMaster,
  isManager,
  canManageUsers,
  canManageTargetRole,
} from '../auth/roles';
import { TokenPayload } from '../utils/jwt';

// Treat empty strings / null (sent by FE dropdowns when nothing is selected) as
// "not provided" so an unselected optional field never trips schema validation.
const emptyToUndefined = (val: unknown) => (val === '' || val === null ? undefined : val);

// Optional UUID that accepts "" / null / undefined and normalizes them to undefined
const optionalUuid = z.preprocess(emptyToUndefined, z.string().uuid().optional().nullable());

// Optional free-text name (RTUPP/Team) supplied by the static FE selectors.
// "" → undefined so an unselected field is simply treated as "not provided".
const optionalName = z.preprocess(emptyToUndefined, z.string().trim().min(1).max(255).optional());

const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  // Argon2id imposes no length limit; the 72-character cap is kept as a policy
  // bound shared with the FE and the change-password endpoint.
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(72, 'Password must be at most 72 characters'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['PETUGAS', 'ADMIN', 'MANAGER', 'MASTER', 'ADMIN_RTUPP', 'SUPERADMIN', 'NOC']),
  phone: z.string().optional(),
  rtuppId: optionalUuid,
  teamId: optionalUuid,
  // Free-text alternatives to the *Id fields: RTUPP for ADMIN_RTUPP, Team for PETUGAS.
  rtuppName: optionalName,
  teamName: optionalName,
});

const updateUserSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  phone: z.string().optional(),
  role: z.enum(['PETUGAS', 'ADMIN', 'MANAGER', 'MASTER', 'ADMIN_RTUPP', 'SUPERADMIN', 'NOC']).optional(),
  rtuppId: optionalUuid,
  teamId: optionalUuid,
  rtuppName: optionalName,
  teamName: optionalName,
  isActive: z.boolean().optional(),
});

// Role-visibility hierarchy ranks (higher = sees more). Used to scope which
// accounts an operator may see in the user list. Keyed by the live DB enum
// values (incl. legacy SUPERADMIN/ADMIN_RTUPP) so existing rows stay visible:
//   MASTER/MANAGER (4) see everyone; ADMIN (2) sees PETUGAS+ADMIN; PETUGAS (1)
//   sees only itself. MANAGER ranks with MASTER for visibility yet is read-only
//   (no write routes), matching its "read-only full access" mandate.
const ROLE_RANK = {
  PETUGAS: 1,
  ADMIN: 2,
  ADMIN_RTUPP: 2, // legacy → folds into ADMIN
  NOC: 3, // control-room specialist — visible to MASTER/MANAGER, managed by MASTER only
  MANAGER: 4,
  SUPERADMIN: 4, // legacy → folds into MASTER
  MASTER: 4,
} as const;

// Carries an HTTP status out of a transaction so validation messages survive.
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Tenant scope of a user-management *operator*. MASTER and the global Manager
// UP3 (MANAGER + rtuppId null) see all RTUPPs; ADMIN and ASMEN (MANAGER +
// rtuppId) are pinned to their own RTUPP. NOTE: ADMIN's global DATA scope
// (hasGlobalScope) deliberately does NOT apply here — user management stays
// per-RTUPP, so the Manager-UP3 check below is explicit instead of reusing
// hasGlobalScope. Resolved without throwing so a scoped operator with no RTUPP
// yields { global:false, rtuppId:null } and the caller can answer a clean 403
// (rather than bubbling into the 500 handler).
type OperatorScope = { global: boolean; rtuppId: string | null };

async function resolveOperatorScope(user: TokenPayload): Promise<OperatorScope> {
  if (isMaster(user.role)) return { global: true, rtuppId: null };
  // Prefer the JWT claim; fall back to a DB lookup for tokens minted before it.
  // Resolved BEFORE the MANAGER global decision so an ASMEN stays scoped.
  let rtuppId = user.rtuppId ?? null;
  if (rtuppId == null) {
    const row = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { rtuppId: true },
    });
    rtuppId = row?.rtuppId ?? null;
  }
  if (isManager(user.role) && !rtuppId) return { global: true, rtuppId: null };
  return { global: false, rtuppId };
}

// Build a unique, schema-safe code (<=50 chars) from a free-text name.
const buildCode = (name: string, fallback: string): string =>
  name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || fallback;

// Find an RTUPP by exact name, or create one. Backs the static RTUPP selector
// for ADMIN_RTUPP accounts ("RTUPP 2" … "RTUPP 5" / "Other" free text).
async function resolveRtuppIdByName(
  tx: Prisma.TransactionClient,
  name: string
): Promise<string> {
  const trimmed = name.trim();
  const existing = await tx.rTUPP.findFirst({ where: { name: trimmed } });
  if (existing) return existing.id;
  const base = buildCode(trimmed, 'RTUPP');
  let code = base;
  let n = 1;
  while (await tx.rTUPP.findUnique({ where: { code } })) {
    code = `${base}-${n++}`.slice(0, 50);
  }
  const created = await tx.rTUPP.create({ data: { name: trimmed, code } });
  return created.id;
}

// Find a Team by name within an RTUPP, or create it. Backs the static Team
// selector for PETUGAS ("Tim A" / "Tim B" / "Other" free text).
async function resolveTeamIdByName(
  tx: Prisma.TransactionClient,
  name: string,
  rtuppId: string
): Promise<string> {
  const trimmed = name.trim();
  const existing = await tx.team.findFirst({ where: { name: trimmed, rtuppId } });
  if (existing) return existing.id;
  const base = buildCode(trimmed, 'TEAM');
  let code = base;
  let n = 1;
  while (await tx.team.findUnique({ where: { code } })) {
    code = `${base}-${n++}`.slice(0, 50);
  }
  const created = await tx.team.create({ data: { name: trimmed, code, rtuppId } });
  return created.id;
}

// Get all users (Admin/SUPERADMIN only)
export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Read access: everyone who may manage accounts (MASTER, MANAGER, ADMIN).
    if (!canManageUsers(userRole)) {
      errorResponse(res, 'Access denied', 403);
      return;
    }

    const { search, role, isActive } = req.query;

    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' as const } },
        { email: { contains: search as string, mode: 'insensitive' as const } },
      ];
    }

    // Role-visibility hierarchy: an operator may only see accounts at or below
    // their own level. SUPERADMIN > ADMIN_RTUPP > ADMIN > PETUGAS.
    const operatorRank = ROLE_RANK[userRole as keyof typeof ROLE_RANK] ?? 0;
    const visibleRoles = (Object.keys(ROLE_RANK) as Array<keyof typeof ROLE_RANK>)
      .filter((r) => ROLE_RANK[r] <= operatorRank);

    if (role) {
      // Respect the explicit filter, but never beyond what the operator may see.
      where.role = visibleRoles.includes(role as keyof typeof ROLE_RANK) ? role : { in: [] };
    } else {
      where.role = { in: visibleRoles };
    }

    if (isActive !== undefined) where.isActive = isActive === 'true';

    // RTUPP isolation (Task 2): ADMIN only sees accounts in its own RTUPP.
    // MASTER/MANAGER are global. A scoped operator with no RTUPP sees nothing.
    const scope = await resolveOperatorScope(req.user as TokenPayload);
    if (!scope.global) {
      where.rtuppId = scope.rtuppId ?? '__none__';
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        rtupp: {
          select: { id: true, name: true, code: true },
        },
        team: {
          select: { id: true, name: true, code: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    successResponse(res, users, 'Users retrieved successfully');
  } catch (error) {
    console.error('Get users error:', error);
    errorResponse(res, 'Failed to retrieve users', 500);
  }
};

// Get user by ID (Admin/SUPERADMIN only)
export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { id } = req.params;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Read access: everyone who may manage accounts (MASTER, MANAGER, ADMIN).
    if (!canManageUsers(userRole)) {
      errorResponse(res, 'Access denied', 403);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        avatar: true,
        isActive: true,
        createdAt: true,
        rtuppId: true,
        rtupp: {
          select: { id: true, name: true, code: true },
        },
        team: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!user) {
      errorResponse(res, 'User not found', 404);
      return;
    }

    // RTUPP isolation (Task 2): an ADMIN may not read accounts outside its own
    // RTUPP — report 404 so cross-RTUPP existence is not leaked.
    const scope = await resolveOperatorScope(req.user as TokenPayload);
    if (!scope.global && user.rtuppId !== scope.rtuppId) {
      errorResponse(res, 'User not found', 404);
      return;
    }

    successResponse(res, user, 'User retrieved successfully');
  } catch (error) {
    console.error('Get user error:', error);
    errorResponse(res, 'Failed to retrieve user', 500);
  }
};

// Create user (SUPERADMIN only)
export const createUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Write access: user-management tier (MASTER/MANAGER/ADMIN). PETUGAS denied.
    if (!canManageUsers(userRole)) {
      errorResponse(res, 'Access denied', 403);
      return;
    }

    const validation = createUserSchema.safeParse(req.body);
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const { email, password, name, phone, rtuppName, teamName, role } = validation.data;
    let { rtuppId, teamId } = validation.data;

    // Non-MASTER operators (MANAGER & ADMIN) may only provision PETUGAS and
    // ADMIN accounts — never a MANAGER or MASTER. Only MASTER manages the
    // elevated/monitoring roles.
    if (!canManageTargetRole(userRole, role)) {
      const msg = normalizeRole(userRole) === 'ADMIN'
        ? 'Admin hanya dapat mengelola/membuat user ber-role Petugas'
        : 'Anda hanya dapat membuat user Petugas atau Admin';
      errorResponse(res, msg, 403);
      return;
    }

    // RTUPP isolation (Task 2): an ADMIN may only create users inside its own
    // RTUPP. Any explicit RTUPP is rejected if it differs; the free-text RTUPP
    // selector is ignored and the new user is pinned to the operator's RTUPP.
    const scope = await resolveOperatorScope(req.user as TokenPayload);
    if (!scope.global) {
      if (!scope.rtuppId) {
        errorResponse(res, 'Akun admin Anda belum terhubung ke RTUPP', 403);
        return;
      }
      if (rtuppId && rtuppId !== scope.rtuppId) {
        errorResponse(res, 'Admin hanya dapat mengelola user di RTUPP-nya sendiri', 403);
        return;
      }
      rtuppId = scope.rtuppId;
    }

    // Check if email already exists
    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' as const } },
    });

    if (existingUser) {
      errorResponse(res, 'Email already exists', 400);
      return;
    }

    const hashedPassword = await hashPassword(password);

    // Atomic: name resolution (find-or-create RTUPP/Team), the user row, and its
    // audit record all commit together — no orphan RTUPP/Team if creation fails.
    const user = await prisma.$transaction(async (tx) => {
      // RTUPP: an explicit id wins; otherwise resolve the free-text name from
      // the static ADMIN_RTUPP selector. SUPERADMIN role does not require an RTUPP.
      if (!rtuppId && rtuppName) {
        rtuppId = await resolveRtuppIdByName(tx, rtuppName);
      }
      if (rtuppId) {
        const rtupp = await tx.rTUPP.findUnique({ where: { id: rtuppId } });
        if (!rtupp) throw new HttpError(400, 'RTUPP not found');
      } else if (role === 'PETUGAS' || role === 'ADMIN') {
        // Only RTUPP-bound roles require one; ADMIN_RTUPP & SUPERADMIN are global.
        throw new HttpError(400, 'RTUPP wajib dipilih');
      }

      // Team only applies to PETUGAS, who must always have one.
      if (role === 'PETUGAS') {
        if (!teamId && teamName) {
          teamId = await resolveTeamIdByName(tx, teamName, rtuppId as string);
        }
        if (!teamId) throw new HttpError(400, 'Team wajib dipilih untuk Petugas');
        const team = await tx.team.findUnique({
          where: { id: teamId },
          select: { id: true, rtuppId: true },
        });
        if (!team) throw new HttpError(400, 'Team not found');
        if (team.rtuppId !== rtuppId) {
          throw new HttpError(400, 'Team tidak berada di RTUPP yang dipilih');
        }
      } else {
        // Non-PETUGAS roles never carry a Team.
        teamId = undefined;
      }

      const created = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          role,
          phone,
          rtuppId,
          teamId,
          isActive: true,
          // Temporary password issued by SUPERADMIN — force change on first login
          mustChangePassword: true,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          avatar: true,
          isActive: true,
          createdAt: true,
          rtupp: {
            select: { id: true, name: true, code: true },
          },
          team: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      await recordAudit(
        {
          userId,
          action: 'CREATE',
          entityType: 'USER',
          entityId: created.id,
          details: { email: created.email, name: created.name, role: created.role },
        },
        tx
      );

      return created;
    });

    successResponse(res, user, 'User created successfully');
  } catch (error) {
    if (error instanceof HttpError) {
      errorResponse(res, error.message, error.status);
      return;
    }
    console.error('Create user error:', error);
    errorResponse(res, 'Failed to create user', 500);
  }
};

// Update user (Admin/SUPERADMIN only)
export const updateUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { id } = req.params;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Write access: user-management tier (MASTER/MANAGER/ADMIN). PETUGAS denied.
    if (!canManageUsers(userRole)) {
      errorResponse(res, 'Access denied', 403);
      return;
    }

    const validation = updateUserSchema.safeParse(req.body);
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    const data = validation.data;

    // Prevent SUPERADMIN from being demoted. Pull the current RTUPP name too so
    // an ADMIN's attempt to reassign the user to another RTUPP can be rejected.
    const existingUser = await prisma.user.findUnique({
      where: { id },
      include: { rtupp: { select: { name: true } } },
    });

    if (!existingUser) {
      errorResponse(res, 'User not found', 404);
      return;
    }

    // RTUPP isolation (Task 2): an ADMIN may only update users in its own RTUPP.
    const scope = await resolveOperatorScope(req.user as TokenPayload);
    if (!scope.global && existingUser.rtuppId !== scope.rtuppId) {
      errorResponse(res, 'Admin hanya dapat mengelola user di RTUPP-nya sendiri', 403);
      return;
    }

    // Privilege escalation guards: only MASTER may modify a MASTER account, and
    // only MASTER may change a user's role at all (incl. promoting to MANAGER/
    // MASTER). MANAGER & ADMIN keep the existing role.
    if (!isMaster(userRole)) {
      if (isMaster(existingUser.role)) {
        errorResponse(res, 'Hanya MASTER yang dapat mengubah akun MASTER', 403);
        return;
      }
      if (data.role !== undefined && normalizeRole(data.role) !== normalizeRole(existingUser.role)) {
        errorResponse(res, 'Hanya MASTER yang dapat mengubah role user', 403);
        return;
      }
    }

    // A MASTER account may never be demoted out of the MASTER role.
    if (isMaster(existingUser.role) && data.role && normalizeRole(data.role) !== 'MASTER') {
      errorResponse(res, 'Tidak dapat menurunkan role MASTER', 400);
      return;
    }

    // Prevent user from deactivating themselves
    if (id === userId && data.isActive === false) {
      errorResponse(res, 'Cannot deactivate yourself', 400);
      return;
    }

    // Pull the free-text selector values out — they are not user columns and are
    // translated into rtuppId/teamId (find-or-create) inside the transaction.
    let rtuppName = (data as Record<string, unknown>).rtuppName as string | undefined;
    const teamName = (data as Record<string, unknown>).teamName as string | undefined;
    delete (data as Record<string, unknown>).rtuppName;
    delete (data as Record<string, unknown>).teamName;
    // A raw rtuppId from the edit form is never trusted; RTUPP changes (ADMIN_RTUPP
    // only) go through the static selector's rtuppName instead.
    delete (data as Record<string, unknown>).rtuppId;

    // Non-MASTER operators (MANAGER & ADMIN) may only manage PETUGAS and ADMIN
    // accounts — never a MANAGER or MASTER.
    if (!canManageTargetRole(userRole, existingUser.role)) {
      const msg = normalizeRole(userRole) === 'ADMIN'
        ? 'Admin hanya dapat mengelola/mengubah user ber-role Petugas'
        : 'Anda hanya dapat mengelola user Petugas dan Admin';
      errorResponse(res, msg, 403);
      return;
    }

    if (data.role && !canManageTargetRole(userRole, data.role)) {
      const msg = normalizeRole(userRole) === 'ADMIN'
        ? 'Admin hanya dapat menetapkan role Petugas'
        : 'Anda hanya dapat menetapkan role Petugas dan Admin';
      errorResponse(res, msg, 403);
      return;
    }

    // RTUPP isolation (Task 2/A): an ADMIN may not move a user to another RTUPP.
    // A submitted RTUPP that differs from the target's current RTUPP is rejected
    // (403); a no-op (same RTUPP, e.g. the edit form re-submitting the current
    // value) is allowed and simply dropped so the tx never reassigns.
    if (!scope.global && rtuppName) {
      const currentName = existingUser.rtupp?.name ?? null;
      if (!currentName || rtuppName.trim() !== currentName.trim()) {
        errorResponse(res, 'Admin tidak dapat memindahkan user ke RTUPP lain', 403);
        return;
      }
      rtuppName = undefined;
    }

    // Atomic: name resolution, the user update, and its audit record all commit
    // together.
    const user = await prisma.$transaction(async (tx) => {
      const mutable = data as Record<string, unknown>;

      if (existingUser.role === 'PETUGAS') {
        // PETUGAS: RTUPP is immutable; Team is editable via the static selector.
        if (!mutable.teamId && teamName) {
          mutable.teamId = await resolveTeamIdByName(tx, teamName, existingUser.rtuppId as string);
        }
        if (mutable.teamId) {
          const team = await tx.team.findUnique({
            where: { id: mutable.teamId as string },
            select: { rtuppId: true },
          });
          if (!team) throw new HttpError(400, 'Team not found');
          if (existingUser.rtuppId && team.rtuppId !== existingUser.rtuppId) {
            throw new HttpError(400, 'Team tidak berada di RTUPP user');
          }
        }
      } else {
        // Non-PETUGAS roles never carry a Team. ADMIN_RTUPP/ADMIN may have their
        // RTUPP reassigned via the static selector.
        delete mutable.teamId;
        if (rtuppName) {
          mutable.rtuppId = await resolveRtuppIdByName(tx, rtuppName);
        }
      }

      const updated = await tx.user.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          phone: true,
          avatar: true,
          isActive: true,
          createdAt: true,
          rtupp: {
            select: { id: true, name: true, code: true },
          },
          team: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      await recordAudit(
        {
          userId,
          action: 'UPDATE',
          entityType: 'USER',
          entityId: id,
          details: {
            email: updated.email,
            name: updated.name,
            role: updated.role,
            isActive: updated.isActive,
          },
        },
        tx
      );

      return updated;
    });

    successResponse(res, user, 'User updated successfully');
  } catch (error) {
    if (error instanceof HttpError) {
      errorResponse(res, error.message, error.status);
      return;
    }
    console.error('Update user error:', error);
    errorResponse(res, 'Failed to update user', 500);
  }
};

// Delete user. User-management tier (MASTER/MANAGER/ADMIN): MASTER/MANAGER are
// global; ADMIN is scoped to its own RTUPP. MANAGER/ADMIN may only delete
// PETUGAS/ADMIN; a MASTER account is never deletable; referenced users are kept
// (deactivate instead) by the soft-delete policy.
export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { id } = req.params;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Delete is part of user management (MASTER/MANAGER/ADMIN). Per-target and
    // per-RTUPP guards below keep MANAGER/ADMIN to PETUGAS/ADMIN accounts; the
    // soft-delete reference policy still forbids removing referenced users.
    if (!canManageUsers(userRole)) {
      errorResponse(res, 'Anda tidak memiliki akses menghapus user', 403);
      return;
    }

    // Prevent deleting yourself
    if (id === userId) {
      errorResponse(res, 'Cannot delete yourself', 400);
      return;
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            activityLogs: true,
            attachments: true,
            validations: true,
            laporanAwalCreated: true,
            laporanAkhirCreated: true,
            laporanAwalUpdated: true,
            laporanAkhirUpdated: true,
            laporanAwalApproved: true,
            laporanAkhirApproved: true,
            laporanAwalRejected: true,
            laporanAkhirRejected: true,
            teams_teams_leaderIdTousers: true,
          },
        },
      },
    });

    if (!existingUser) {
      errorResponse(res, 'User not found', 404);
      return;
    }

    // Non-MASTER operators (MANAGER & ADMIN) may only delete PETUGAS/ADMIN —
    // never a MANAGER or MASTER (403, consistent with updateUser's guard order).
    if (!canManageTargetRole(userRole, existingUser.role)) {
      const msg = normalizeRole(userRole) === 'ADMIN'
        ? 'Admin hanya dapat mengelola/menghapus user ber-role Petugas'
        : 'Anda hanya dapat menghapus user Petugas dan Admin';
      errorResponse(res, msg, 403);
      return;
    }

    // A MASTER account is never deletable, even by another MASTER.
    if (isMaster(existingUser.role)) {
      errorResponse(res, 'Tidak dapat menghapus akun MASTER', 400);
      return;
    }

    // RTUPP isolation (Task 2): an ADMIN may only delete users in its own RTUPP.
    const scope = await resolveOperatorScope(req.user as TokenPayload);
    if (!scope.global && existingUser.rtuppId !== scope.rtuppId) {
      errorResponse(res, 'Admin hanya dapat mengelola user di RTUPP-nya sendiri', 403);
      return;
    }

    // Soft-delete policy: a user with ANY historical reference must NEVER be
    // physically deleted (no data loss, no FK/orphan failures). Deactivation
    // (isActive=false via updateUser) is the standard workflow instead.
    // Only users with absolutely zero references may be physically removed.
    const c = existingUser._count;
    const referenceCount =
      c.activityLogs +
      c.attachments +
      c.validations +
      c.laporanAwalCreated +
      c.laporanAkhirCreated +
      c.laporanAwalUpdated +
      c.laporanAkhirUpdated +
      c.laporanAwalApproved +
      c.laporanAkhirApproved +
      c.laporanAwalRejected +
      c.laporanAkhirRejected +
      c.teams_teams_leaderIdTousers;

    if (referenceCount > 0) {
      errorResponse(res, 'User has historical records and cannot be deleted', 409);
      return;
    }

    // Atomic: the deletion and its audit record commit together.
    await prisma.$transaction(async (tx) => {
      await tx.user.delete({
        where: { id },
      });

      await recordAudit(
        {
          userId,
          action: 'DELETE',
          entityType: 'USER',
          entityId: id,
          details: { email: existingUser.email, name: existingUser.name },
        },
        tx
      );
    });

    successResponse(res, null, 'User deleted successfully');
  } catch (error) {
    console.error('Delete user error:', error);
    errorResponse(res, 'Failed to delete user', 500);
  }
};

const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(72, 'Password must be at most 72 characters'),
});

// Reset another user's password (SUPERADMIN: anyone; ADMIN_RTUPP: ADMIN/PETUGAS
// within own RTUPP). Issues a temporary password and forces a change on next login.
export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    const { id } = req.params;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    // Write access: user-management tier (MASTER/MANAGER/ADMIN). PETUGAS denied.
    if (!canManageUsers(userRole)) {
      errorResponse(res, 'Access denied', 403);
      return;
    }

    const validation = resetPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      validationErrorResponse(res, validation.error.format());
      return;
    }

    // Own password must go through the dedicated change-password flow.
    if (id === userId) {
      errorResponse(res, 'Gunakan halaman ganti password untuk akun Anda sendiri', 400);
      return;
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, rtuppId: true, email: true, name: true },
    });

    if (!target) {
      errorResponse(res, 'User not found', 404);
      return;
    }

    // Authorization matrix. Non-MASTER operators (MANAGER & ADMIN) may only
    // reset ADMIN/PETUGAS passwords — never a MANAGER or MASTER.
    if (!canManageTargetRole(userRole, target.role)) {
      const msg = normalizeRole(userRole) === 'ADMIN'
        ? 'Admin hanya dapat mengelola/mereset password user ber-role Petugas'
        : 'Anda hanya dapat mereset password Admin dan Petugas';
      errorResponse(res, msg, 403);
      return;
    }

    // RTUPP isolation (Task 2): an ADMIN may only reset passwords in its RTUPP.
    const scope = await resolveOperatorScope(req.user as TokenPayload);
    if (!scope.global && target.rtuppId !== scope.rtuppId) {
      errorResponse(res, 'Admin hanya dapat mengelola user di RTUPP-nya sendiri', 403);
      return;
    }

    const hashedPassword = await hashPassword(validation.data.password);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          password: hashedPassword,
          // Temporary password — force the user to set their own on next login.
          mustChangePassword: true,
        },
      });

      await recordAudit(
        {
          userId,
          action: 'UPDATE',
          entityType: 'USER',
          entityId: id,
          details: { action: 'RESET_PASSWORD', email: target.email, name: target.name, role: target.role },
        },
        tx
      );
    });

    successResponse(res, null, 'Password berhasil direset');
  } catch (error) {
    console.error('Reset password error:', error);
    errorResponse(res, 'Failed to reset password', 500);
  }
};

// Get RTUPP list (for dropdown)
export const getRtuppList = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const rtuppList = await prisma.rTUPP.findMany({
      select: {
        id: true,
        name: true,
        code: true,
      },
      orderBy: { name: 'asc' },
    });

    successResponse(res, rtuppList, 'RTUPP list retrieved successfully');
  } catch (error) {
    console.error('Get RTUPP list error:', error);
    errorResponse(res, 'Failed to retrieve RTUPP list', 500);
  }
};

// Get Team list (for dropdown)
export const getTeamList = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;

    if (!userId || !userRole) {
      errorResponse(res, 'User not authenticated', 401);
      return;
    }

    const teamList = await prisma.team.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        rtuppId: true,
      },
      orderBy: { name: 'asc' },
    });

    successResponse(res, teamList, 'Team list retrieved successfully');
  } catch (error) {
    console.error('Get Team list error:', error);
    errorResponse(res, 'Failed to retrieve Team list', 500);
  }
};
