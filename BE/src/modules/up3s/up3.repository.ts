import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { CreateUp3Input, UpdateUp3Input, ListUp3Query } from './up3.validation';

/**
 * UP3 Repository — Prisma access for the `up3s` table (child of RTUPP).
 * Uniqueness is per-RTUPP: UNIQUE(rtuppId, code).
 */
export class Up3Repository {
  async findAll(query: ListUp3Query) {
    const { page, limit, search, rtuppId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.Up3WhereInput = {
      ...(rtuppId ? { rtuppId } : {}),
      ...(search ? { OR: [{ code: { contains: search, mode: 'insensitive' as const } }, { name: { contains: search, mode: 'insensitive' as const } }] } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.up3.findMany({
        where,
        skip,
        take: limit,
        orderBy: { code: 'asc' },
        include: { rtupp: { select: { id: true, code: true, name: true } } },
      }),
      prisma.up3.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string) {
    return prisma.up3.findUnique({
      where: { id },
      include: { rtupp: { select: { id: true, code: true, name: true } } },
    });
  }

  findByRtuppAndCode(rtuppId: string, code: string) {
    return prisma.up3.findFirst({ where: { rtuppId, code } });
  }

  create(data: CreateUp3Input) {
    return prisma.up3.create({
      data: { rtuppId: data.rtuppId, code: data.code, name: data.name },
    });
  }

  update(id: string, data: UpdateUp3Input) {
    return prisma.up3.update({
      where: { id },
      data: {
        ...(data.rtuppId !== undefined ? { rtuppId: data.rtuppId } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
      },
    });
  }

  delete(id: string) {
    return prisma.up3.delete({ where: { id } });
  }

  rtuppExists(rtuppId: string) {
    return prisma.rTUPP.findUnique({ where: { id: rtuppId }, select: { id: true } });
  }
}

export const up3Repository = new Up3Repository();
