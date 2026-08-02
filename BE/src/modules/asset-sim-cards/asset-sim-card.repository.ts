import prisma from '../../config/database';
import type { TenantScope } from '../../utils/tenantScope';
import type { CreateSimCardInput, UpdateSimCardInput } from './asset-sim-card.validation';

/**
 * AssetSimCard Repository — only layer touching Prisma for SIM cards.
 * SIM cards are a hard-owned child of Asset (no soft delete; cascade on asset).
 */
export class AssetSimCardRepository {
  findByAsset(assetId: string) {
    return prisma.assetSimCard.findMany({ where: { assetId }, orderBy: { simSlot: 'asc' } });
  }

  findById(id: string, scope?: TenantScope) {
    // SIM card tenant = its asset's location's RTUPP. Out-of-scope → not found.
    const tenant =
      scope && !scope.global ? { asset: { location: { rtuppId: scope.rtuppId } } } : {};
    return prisma.assetSimCard.findFirst({ where: { id, ...tenant } });
  }

  findByAssetAndSlot(assetId: string, simSlot: number) {
    return prisma.assetSimCard.findFirst({ where: { assetId, simSlot } });
  }

  create(assetId: string, data: CreateSimCardInput, userId?: string) {
    return prisma.assetSimCard.create({
      data: {
        assetId,
        simSlot: data.simSlot,
        provider: data.provider ?? null,
        phoneNumber: data.phoneNumber ?? null,
        iccid: data.iccid ?? null,
        ipAddress: data.ipAddress ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
  }

  update(id: string, data: UpdateSimCardInput, userId?: string) {
    return prisma.assetSimCard.update({
      where: { id },
      data: {
        ...(data.simSlot !== undefined ? { simSlot: data.simSlot } : {}),
        ...(data.provider !== undefined ? { provider: data.provider } : {}),
        ...(data.phoneNumber !== undefined ? { phoneNumber: data.phoneNumber } : {}),
        ...(data.iccid !== undefined ? { iccid: data.iccid } : {}),
        ...(data.ipAddress !== undefined ? { ipAddress: data.ipAddress } : {}),
        updatedBy: userId ?? null,
      },
    });
  }

  delete(id: string) {
    return prisma.assetSimCard.delete({ where: { id } });
  }
}

export const assetSimCardRepository = new AssetSimCardRepository();
