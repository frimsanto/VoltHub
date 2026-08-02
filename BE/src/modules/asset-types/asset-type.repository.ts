import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type {
  CreateAssetTypeInput,
  UpdateAssetTypeInput,
  ListAssetTypeQuery,
} from './asset-type.validation';

/**
 * Asset Type Repository — Prisma access for `asset_types` (model AssetTypeRef).
 * Uniqueness is per-category: UNIQUE(assetCategoryId, name).
 */
export class AssetTypeRepository {
  async findAll(query: ListAssetTypeQuery) {
    const { page, limit, search, assetCategoryId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AssetTypeRefWhereInput = {
      ...(assetCategoryId ? { assetCategoryId } : {}),
      ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.assetTypeRef.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          category: { select: { id: true, name: true } },
          _count: { select: { assets: true } },
        },
      }),
      prisma.assetTypeRef.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string) {
    return prisma.assetTypeRef.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true } }, _count: { select: { assets: true } } },
    });
  }

  findByCategoryAndName(assetCategoryId: string, name: string) {
    return prisma.assetTypeRef.findFirst({ where: { assetCategoryId, name } });
  }

  create(data: CreateAssetTypeInput) {
    return prisma.assetTypeRef.create({
      data: {
        assetCategoryId: data.assetCategoryId,
        name: data.name,
        description: data.description ?? null,
      },
    });
  }

  update(id: string, data: UpdateAssetTypeInput) {
    return prisma.assetTypeRef.update({
      where: { id },
      data: {
        ...(data.assetCategoryId !== undefined ? { assetCategoryId: data.assetCategoryId } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
      },
    });
  }

  countAssets(id: string) {
    return prisma.asset.count({ where: { assetTypeId: id } });
  }

  delete(id: string) {
    return prisma.assetTypeRef.delete({ where: { id } });
  }

  categoryExists(assetCategoryId: string) {
    return prisma.assetCategory.findUnique({ where: { id: assetCategoryId }, select: { id: true } });
  }
}

export const assetTypeRepository = new AssetTypeRepository();
