import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { CreateLocationInput, UpdateLocationInput, ListLocationQuery } from './location.validation';
import { locationScopeWhere, type TenantScope } from '../../utils/tenantScope';

/**
 * Location Repository — the only layer allowed to touch Prisma for locations.
 * All reads exclude soft-deleted rows (deletedAt IS NULL).
 */
export class LocationRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.LocationWhereInput;

  /** Creator's own RTUPP — used to stamp tenant ownership on a new gardu even
   *  when the creator's READ scope is global (ADMIN, 2026-07 policy). */
  async findUserRtuppId(userId: string): Promise<string | null> {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { rtuppId: true },
    });
    return row?.rtuppId ?? null;
  }

  async findAll(query: ListLocationQuery, scope: TenantScope) {
    const { page, limit, search, type } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.LocationWhereInput = {
      ...this.notDeleted,
      // Tenant isolation: ADMIN/PETUGAS see only their RTUPP's gardu.
      ...locationScopeWhere(scope),
      ...(type ? { locationType: type } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } },
              { up3: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.location.findMany({ where, skip, take: limit, orderBy: { code: 'asc' } }),
      prisma.location.count({ where }),
    ]);

    // Status RC real per gardu dari snapshot SP7 RTU terbaru; null = gardu
    // tidak terdaftar di snapshot (FE render "—" alih-alih badge).
    const operStates = await this.latestRtuOperStates(data.map((l) => l.id));
    return {
      data: data.map((l) => ({ ...l, scadaOperState: operStates.get(l.id) ?? null })),
      total,
      page,
      limit,
    };
  }

  /**
   * operState per location dari baris snapshot SP7 fileType RTU terbaru.
   * Gardu ber-RTU ganda: UP menang (satu RTU inscan ⇒ gardu dihitung inscan).
   */
  private async latestRtuOperStates(locationIds: string[]): Promise<Map<string, string>> {
    const states = new Map<string, string>();
    if (locationIds.length === 0) return states;
    const latest = await prisma.scadaSnapshot.findFirst({
      where: { fileType: 'RTU' },
      orderBy: { uploadedAt: 'desc' },
      select: { id: true },
    });
    if (!latest) return states;
    const rows = await prisma.scadaRtuRow.findMany({
      where: { snapshotId: latest.id, locationId: { in: locationIds } },
      select: { locationId: true, operState: true },
    });
    for (const row of rows) {
      if (!row.locationId) continue;
      if (states.get(row.locationId) !== 'UP') states.set(row.locationId, row.operState);
    }
    return states;
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.location.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? locationScopeWhere(scope) : {}) },
    });
  }

  /**
   * The penyulang (feeder) that supplies this gardu — for distribution gardu.
   * Raw SQL so it resolves even on a Prisma engine that predates the
   * `locations.supplyFeederId` migration (a typed include would otherwise fail
   * until `prisma generate` + a server restart).
   */
  async findSupplyFeeder(locationId: string) {
    const rows = await prisma.$queryRaw<{ id: string; feederName: string; locationId: string }[]>`
      SELECT f.id, f."feederName" AS "feederName", f."locationId" AS "locationId"
      FROM locations l JOIN feeders f ON f.id = l."supplyFeederId"
      WHERE l.id = ${locationId} LIMIT 1`;
    return rows[0] ?? null;
  }

  findByCode(code: string) {
    return prisma.location.findFirst({ where: { code, ...this.notDeleted } });
  }

  /** The owning RTUPP's code/name — used to enforce the per-RTUPP gardu-type
   *  rule (location.constants). Returns null when the RTUPP cannot be found. */
  findRtupp(rtuppId: string) {
    return prisma.rTUPP.findUnique({ where: { id: rtuppId }, select: { code: true, name: true } });
  }

  create(data: CreateLocationInput & { code: string }, userId?: string, rtuppId?: string | null) {
    return prisma.location.create({
      data: {
        code: data.code,
        name: data.name,
        locationType: data.locationType,
        up3: data.up3 ?? null,
        // Tenant ownership: a scoped creator stamps their own RTUPP; a global
        // creator (MASTER/MANAGER) may leave it null.
        rtuppId: rtuppId ?? null,
        address: data.address ?? null,
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
        status: data.status ?? true,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
  }

  update(id: string, data: UpdateLocationInput, userId?: string) {
    return prisma.location.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.locationType !== undefined ? { locationType: data.locationType } : {}),
        ...(data.up3 !== undefined ? { up3: data.up3 } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
        ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updatedBy: userId ?? null,
      },
    });
  }

  softDelete(id: string, userId?: string) {
    return prisma.location.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId ?? null },
    });
  }
}

export const locationRepository = new LocationRepository();
