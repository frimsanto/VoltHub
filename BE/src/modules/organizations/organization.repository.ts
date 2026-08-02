import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
  ListOrganizationQuery,
} from './organization.validation';

/**
 * Organization Repository — Prisma access for the `organizations` table
 * (org tree root, parent of RTUPP). No soft-delete column on this table.
 */
export class OrganizationRepository {
  async findAll(query: ListOrganizationQuery) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.OrganizationWhereInput = search
      ? { OR: [{ code: { contains: search, mode: 'insensitive' as const } }, { name: { contains: search, mode: 'insensitive' as const } }] }
      : {};

    const [data, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { code: 'asc' },
        include: { _count: { select: { rtupps: true } } },
      }),
      prisma.organization.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string) {
    return prisma.organization.findUnique({
      where: { id },
      include: { _count: { select: { rtupps: true } } },
    });
  }

  findByCode(code: string) {
    return prisma.organization.findUnique({ where: { code } });
  }

  create(data: CreateOrganizationInput) {
    return prisma.organization.create({ data: { code: data.code, name: data.name } });
  }

  update(id: string, data: UpdateOrganizationInput) {
    return prisma.organization.update({
      where: { id },
      data: {
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
      },
    });
  }

  countRtupps(id: string) {
    return prisma.rTUPP.count({ where: { organizationId: id } });
  }

  delete(id: string) {
    return prisma.organization.delete({ where: { id } });
  }
}

export const organizationRepository = new OrganizationRepository();
