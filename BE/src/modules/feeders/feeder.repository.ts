import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { CreateFeederInput, UpdateFeederInput, ListFeederQuery } from './feeder.validation';

/**
 * Feeder Repository — only layer touching Prisma for feeders.
 * Reads exclude soft-deleted rows (deletedAt IS NULL).
 */
export class FeederRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.FeederWhereInput;

  async findAll(query: ListFeederQuery) {
    const { page, limit, search, locationId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.FeederWhereInput = {
      ...this.notDeleted,
      ...(locationId ? { locationId } : {}),
      ...(search
        ? { OR: [{ feederCode: { contains: search, mode: 'insensitive' as const } }, { feederName: { contains: search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.feeder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { location: { select: { id: true, code: true, name: true } } },
      }),
      prisma.feeder.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string) {
    return prisma.feeder.findFirst({
      where: { id, ...this.notDeleted },
      include: { location: { select: { id: true, code: true, name: true } } },
    });
  }

  findByLocationAndCode(locationId: string, feederCode: string) {
    return prisma.feeder.findFirst({ where: { locationId, feederCode, ...this.notDeleted } });
  }

  create(data: CreateFeederInput & { feederCode: string }, userId?: string) {
    return prisma.feeder.create({
      data: {
        locationId: data.locationId,
        feederCode: data.feederCode,
        feederName: data.feederName,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
  }

  update(id: string, data: UpdateFeederInput, userId?: string) {
    return prisma.feeder.update({
      where: { id },
      data: {
        ...(data.locationId !== undefined ? { locationId: data.locationId } : {}),
        ...(data.feederCode !== undefined ? { feederCode: data.feederCode } : {}),
        ...(data.feederName !== undefined ? { feederName: data.feederName } : {}),
        updatedBy: userId ?? null,
      },
    });
  }

  softDelete(id: string, userId?: string) {
    return prisma.feeder.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId ?? null },
    });
  }
}

export const feederRepository = new FeederRepository();
