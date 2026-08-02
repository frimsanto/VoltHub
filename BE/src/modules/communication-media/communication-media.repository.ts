import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type {
  CreateCommunicationMediaInput,
  UpdateCommunicationMediaInput,
  ListCommunicationMediaQuery,
} from './communication-media.validation';

const locationSelect = { select: { id: true, code: true, name: true } };

/**
 * CommunicationMedia Repository — only layer touching Prisma for this entity.
 * Reads exclude soft-deleted rows (deletedAt IS NULL).
 */
export class CommunicationMediaRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.CommunicationMediaWhereInput;

  async findAll(query: ListCommunicationMediaQuery, scope: TenantScope) {
    const { page, limit, search, locationId, mediaType } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.CommunicationMediaWhereInput = {
      ...this.notDeleted,
      ...viaLocationScopeWhere(scope),
      ...(locationId ? { locationId } : {}),
      ...(mediaType ? { mediaType } : {}),
      ...(search ? { provider: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.communicationMedia.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { location: locationSelect },
      }),
      prisma.communicationMedia.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.communicationMedia.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: { location: locationSelect },
    });
  }

  create(data: CreateCommunicationMediaInput, userId?: string) {
    return prisma.communicationMedia.create({
      data: {
        locationId: data.locationId,
        mediaType: data.mediaType,
        provider: data.provider ?? null,
        status: data.status ?? true,
        notes: data.notes ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
  }

  update(id: string, data: UpdateCommunicationMediaInput, userId?: string) {
    return prisma.communicationMedia.update({
      where: { id },
      data: {
        ...(data.locationId !== undefined ? { locationId: data.locationId } : {}),
        ...(data.mediaType !== undefined ? { mediaType: data.mediaType } : {}),
        ...(data.provider !== undefined ? { provider: data.provider } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        updatedBy: userId ?? null,
      },
    });
  }

  softDelete(id: string, userId?: string) {
    return prisma.communicationMedia.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId ?? null },
    });
  }
}

export const communicationMediaRepository = new CommunicationMediaRepository();
