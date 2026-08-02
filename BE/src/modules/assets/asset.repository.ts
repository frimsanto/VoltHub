import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import type { CreateAssetInput, UpdateAssetInput, ListAssetQuery } from './asset.validation';
import { viaLocationScopeWhere, type TenantScope } from '../../utils/tenantScope';

const locationSelect = { select: { id: true, code: true, name: true } };
const feederSelect = { select: { id: true, feederCode: true, feederName: true } };
const parentSelect = { select: { id: true, assetCode: true, assetName: true, assetType: true } };

/**
 * Asset Repository — only layer touching Prisma for assets.
 * Reads exclude soft-deleted rows (deletedAt IS NULL).
 */
export class AssetRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.AssetWhereInput;

  async findAll(query: ListAssetQuery, scope: TenantScope) {
    const { page, limit, search, assetType, locationId, status, operState } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.AssetWhereInput = {
      ...this.notDeleted,
      // Tenant isolation: restrict to assets whose owning location is in scope.
      ...viaLocationScopeWhere(scope),
      ...(assetType ? { assetType } : {}),
      ...(locationId ? { locationId } : {}),
      ...(status ? { status } : {}),
      ...(operState ? { operState } : {}),
      ...(search
        ? {
            OR: [
              { assetCode: { contains: search, mode: 'insensitive' as const } },
              { assetName: { contains: search, mode: 'insensitive' as const } },
              { serialNumber: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { location: locationSelect, feeder: feederSelect, parentAsset: parentSelect },
      }),
      prisma.asset.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.asset.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: {
        location: locationSelect,
        feeder: feederSelect,
        parentAsset: parentSelect,
        children: { where: this.notDeleted, select: { id: true, assetCode: true, assetName: true, assetType: true, status: true } },
        simCards: true,
      },
    });
  }

  findByCode(assetCode: string) {
    return prisma.asset.findFirst({ where: { assetCode, ...this.notDeleted } });
  }

  findBySerial(serialNumber: string) {
    return prisma.asset.findFirst({ where: { serialNumber, ...this.notDeleted } });
  }

  // ── SCADA live-state ingestion helpers ──

  /** Match by the stable SCADA correlation key (set on first successful import). */
  findByScadaRtuName(scadaRtuName: string) {
    return prisma.asset.findFirst({ where: { scadaRtuName, ...this.notDeleted } });
  }

  /**
   * Fallback match for RTUs not yet correlated: RTU assets whose name equals the
   * SCADA `RTU Name` (the seed stored it verbatim into assetName). Returns all
   * matches so the caller can detect ambiguity (>1) before linking.
   */
  findRtuAssetsByName(rtuName: string) {
    return prisma.asset.findMany({
      where: { assetType: 'RTU', assetName: rtuName, ...this.notDeleted },
      select: { id: true, operState: true },
    });
  }

  /** Overwrites the live communication-state snapshot (never the lifecycle `status`). */
  updateScadaState(
    id: string,
    data: {
      scadaRtuName: string;
      operState: string | null;
      adminState: string | null;
      commLastSeenAt: Date;
      commStateChangedAt?: Date;
    }
  ) {
    return prisma.asset.update({ where: { id }, data });
  }

  /** Snapshot counts for the live monitoring dashboard (UP / DOWN / unknown). */
  groupRtuByOperState(scope: TenantScope) {
    return prisma.asset.groupBy({
      by: ['operState'],
      where: { assetType: 'RTU', ...this.notDeleted, ...viaLocationScopeWhere(scope) },
      _count: { _all: true },
    });
  }

  /**
   * Status komunikasi RTU dari BARIS individual snapshot SP7 terbaru
   * (scada_rtu_rows, upload NOC) — bukan header totalUp/totalDown yang
   * dihitung saat upload, supaya angka kebal dari header yang salah hitung.
   * Null bila belum ada snapshot RTU sama sekali.
   */
  async latestScadaRtuStatusCounts() {
    const latest = await prisma.scadaSnapshot.findFirst({
      where: { fileType: 'RTU' },
      orderBy: { uploadedAt: 'desc' },
      select: { id: true },
    });
    if (!latest) return null;
    return prisma.scadaRtuRow.groupBy({
      by: ['operState'],
      where: { snapshotId: latest.id },
      _count: { _all: true },
    });
  }

  private mapWritable(data: Partial<CreateAssetInput>): Prisma.AssetUncheckedUpdateInput {
    const out: Prisma.AssetUncheckedUpdateInput = {};
    const keys: (keyof CreateAssetInput)[] = [
      'locationId', 'feederId', 'parentAssetId', 'assetType', 'assetCode', 'assetName',
      'brand', 'model', 'serialNumber', 'tahunOperasi', 'status', 'notes',
      'protocol', 'asdu', 'linkAddress', 'pairChannel', 'masterIp1', 'masterIp2',
      'batteryCount', 'capacity',
    ];
    for (const k of keys) {
      if (data[k] !== undefined) {
        (out as Record<string, unknown>)[k] = data[k];
      }
    }
    return out;
  }

  create(data: CreateAssetInput & { assetCode: string }, userId?: string) {
    return prisma.asset.create({
      data: {
        locationId: data.locationId,
        feederId: data.feederId ?? null,
        parentAssetId: data.parentAssetId ?? null,
        assetType: data.assetType,
        assetCode: data.assetCode,
        assetName: data.assetName,
        brand: data.brand ?? null,
        model: data.model ?? null,
        serialNumber: data.serialNumber ?? null,
        tahunOperasi: data.tahunOperasi ?? null,
        status: data.status ?? 'ACTIVE',
        notes: data.notes ?? null,
        protocol: data.protocol ?? null,
        asdu: data.asdu ?? null,
        linkAddress: data.linkAddress ?? null,
        pairChannel: data.pairChannel ?? null,
        masterIp1: data.masterIp1 ?? null,
        masterIp2: data.masterIp2 ?? null,
        batteryCount: data.batteryCount ?? null,
        capacity: data.capacity ?? null,
        createdBy: userId ?? null,
        updatedBy: userId ?? null,
      },
    });
  }

  update(id: string, data: UpdateAssetInput, userId?: string) {
    return prisma.asset.update({
      where: { id },
      data: { ...this.mapWritable(data), updatedBy: userId ?? null },
    });
  }

  softDelete(id: string, userId?: string) {
    return prisma.asset.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: userId ?? null },
    });
  }

  countActiveChildren(parentAssetId: string) {
    return prisma.asset.count({ where: { parentAssetId, ...this.notDeleted } });
  }
}

export const assetRepository = new AssetRepository();
