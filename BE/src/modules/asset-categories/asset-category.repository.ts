import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type {
  CreateAssetCategoryInput,
  UpdateAssetCategoryInput,
  ListAssetCategoryQuery,
} from './asset-category.validation';

/**
 * Asset Category Repository — Prisma access for `asset_categories`
 * (global asset taxonomy; parent of asset_types).
 */
export class AssetCategoryRepository {
  async findAll(query: ListAssetCategoryQuery) {
    const { page, limit, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AssetCategoryWhereInput = search
      ? { name: { contains: search, mode: 'insensitive' as const } }
      : {};

    const [data, total] = await Promise.all([
      prisma.assetCategory.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: { _count: { select: { assetTypes: true } } },
      }),
      prisma.assetCategory.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string) {
    return prisma.assetCategory.findUnique({
      where: { id },
      include: { _count: { select: { assetTypes: true } } },
    });
  }

  findByName(name: string) {
    return prisma.assetCategory.findUnique({ where: { name } });
  }

  create(data: CreateAssetCategoryInput) {
    return prisma.assetCategory.create({
      data: { name: data.name, description: data.description ?? null },
    });
  }

  update(id: string, data: UpdateAssetCategoryInput) {
    return prisma.assetCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
  }

  countTypes(id: string) {
    return prisma.assetTypeRef.count({ where: { assetCategoryId: id } });
  }

  delete(id: string) {
    return prisma.assetCategory.delete({ where: { id } });
  }
}

export const assetCategoryRepository = new AssetCategoryRepository();
