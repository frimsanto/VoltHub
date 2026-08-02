import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, locationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type { ListBayQuery } from './bay.validation';

export interface CreateBayData {
  locationId: string;
  code: string;
  name: string;
  voltageLevel?: string | null;
  isActive?: boolean;
  createdBy?: string | null;
}

export interface UpdateBayData {
  code?: string;
  name?: string;
  voltageLevel?: string | null;
  isActive?: boolean;
  updatedBy?: string | null;
}

/**
 * Bay Repository — Prisma access for `bays` (GI → Bay). Reads exclude soft-deleted
 * and are tenant-scoped through the owning Location.rtuppId.
 */
export class BayRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.BayWhereInput;

  async findAll(query: ListBayQuery, scope: TenantScope) {
    const { page, limit, search, locationId, isActive } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.BayWhereInput = {
      ...this.notDeleted,
      ...viaLocationScopeWhere(scope),
      ...(locationId ? { locationId } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(search
        ? { OR: [{ code: { contains: search, mode: 'insensitive' as const } }, { name: { contains: search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.bay.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ locationId: 'asc' }, { code: 'asc' }],
        include: { location: { select: { id: true, code: true, name: true } } },
      }),
      prisma.bay.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.bay.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: { location: { select: { id: true, code: true, name: true } } },
    });
  }

  findByLocationAndCode(locationId: string, code: string) {
    return prisma.bay.findFirst({ where: { locationId, code, deletedAt: null } });
  }

  create(data: CreateBayData) {
    return prisma.bay.create({
      data: {
        locationId: data.locationId,
        code: data.code,
        name: data.name,
        voltageLevel: data.voltageLevel ?? null,
        isActive: data.isActive ?? true,
        createdBy: data.createdBy ?? null,
      },
    });
  }

  update(id: string, data: UpdateBayData) {
    return prisma.bay.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.voltageLevel !== undefined ? { voltageLevel: data.voltageLevel } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.updatedBy !== undefined ? { updatedBy: data.updatedBy } : {}),
      },
    });
  }

  softDelete(id: string) {
    return prisma.bay.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  locationExists(locationId: string, scope?: TenantScope) {
    return prisma.location.findFirst({
      where: { id: locationId, deletedAt: null, ...(scope ? locationScopeWhere(scope) : {}) },
      select: { id: true, locationType: true },
    });
  }
}

export const bayRepository = new BayRepository();
