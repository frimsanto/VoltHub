import prisma from '../../config/database';
import { NotFoundError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import {
  parseRtuWorkbook,
  parseLinesWorkbook,
  type ParsedRtuRow,
  type ParsedLineRow,
} from './scada-upload.parser';
import type { LinesQuery, RtuQuery, ScadaFileType } from './scada-upload.validation';

/**
 * SCADA snapshot service (Siemens SP7 daily export).
 *
 * Replace semantics: each upload atomically deletes the previous snapshot of
 * the same fileType and inserts the new one (rows cascade), so at most one
 * live snapshot exists per type. Delete-BEFORE-insert inside one transaction
 * gives a natural rollback: a failed insert leaves the old snapshot in place.
 */

/** createMany chunk size — keeps each INSERT well under MySQL packet limits. */
const BATCH_SIZE = 500;

/** 15k+ line rows in ~31 batches — well beyond the 5s interactive default. */
const TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 } as const;

export interface UploadSummary {
  snapshotId: string;
  fileType: ScadaFileType;
  uploadedAt: Date;
  totalRows: number;
  totalUp: number;
  totalDown: number;
  /** RTU only: rows whose rtuName matched a Location.code. */
  matched: number | null;
}

const uploaderSelect = { select: { id: true, name: true, email: true } } as const;

export class ScadaUploadService {
  /** Parse + replace the live snapshot for `fileType`. */
  async uploadSnapshot(input: {
    buffer: Buffer;
    fileType: ScadaFileType;
    userId: string;
    notes?: string;
  }): Promise<UploadSummary> {
    const { buffer, fileType, userId, notes } = input;

    let totalUp = 0;
    let totalDown = 0;
    let rtuRows: (ParsedRtuRow & { locationId: string | null })[] = [];
    let lineRows: ParsedLineRow[] = [];
    let matched: number | null = null;

    if (fileType === 'RTU') {
      const parsed = await parseRtuWorkbook(buffer);
      ({ totalUp, totalDown } = parsed);
      // Link rows to registered gardu by code (case-insensitive). Siemens
      // naming often differs from Location.code — unmatched (null) is normal.
      const locations = await prisma.location.findMany({
        where: { deletedAt: null },
        select: { id: true, code: true },
      });
      const byCode = new Map(locations.map((l) => [l.code.trim().toUpperCase(), l.id]));
      rtuRows = parsed.rows.map((r) => ({
        ...r,
        locationId: byCode.get(r.rtuName.trim().toUpperCase()) ?? null,
      }));
      matched = rtuRows.filter((r) => r.locationId !== null).length;
    } else {
      const parsed = await parseLinesWorkbook(buffer);
      ({ totalUp, totalDown } = parsed);
      lineRows = parsed.rows;
    }

    const totalRows = fileType === 'RTU' ? rtuRows.length : lineRows.length;

    const snapshot = await prisma.$transaction(async (tx) => {
      // Replace: drop the previous snapshot of this type FIRST (rows cascade);
      // if any insert below fails the whole transaction rolls back and the old
      // snapshot survives untouched.
      await tx.scadaSnapshot.deleteMany({ where: { fileType } });

      const created = await tx.scadaSnapshot.create({
        data: {
          uploadedBy: userId,
          fileType,
          totalRows,
          totalUp,
          totalDown,
          notes: notes ?? null,
        },
      });

      if (fileType === 'RTU') {
        for (let i = 0; i < rtuRows.length; i += BATCH_SIZE) {
          await tx.scadaRtuRow.createMany({
            data: rtuRows.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, snapshotId: created.id })),
          });
        }
      } else {
        for (let i = 0; i < lineRows.length; i += BATCH_SIZE) {
          await tx.scadaLineRow.createMany({
            data: lineRows.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, snapshotId: created.id })),
          });
        }
      }

      await recordAuditLog(
        {
          entityType: 'ScadaSnapshot',
          entityId: created.id,
          action: 'CREATE',
          newValue: { fileType, totalRows, totalUp, totalDown, matched },
          performedBy: userId,
        },
        tx
      );

      return created;
    }, TX_OPTIONS);

    return {
      snapshotId: snapshot.id,
      fileType,
      uploadedAt: snapshot.uploadedAt,
      totalRows,
      totalUp,
      totalDown,
      matched,
    };
  }

  /**
   * Latest snapshot metadata for one fileType (`data: null` when nothing has
   * been uploaded yet). Includes the figures the dashboards need beyond the
   * stored counters: matched-location count for RTU, per-IFS-server UP/DOWN
   * breakdown for LINES.
   */
  async getLatest(fileType: ScadaFileType) {
    const snapshot = await prisma.scadaSnapshot.findFirst({
      where: { fileType },
      orderBy: { uploadedAt: 'desc' },
      include: { uploader: uploaderSelect },
    });
    if (!snapshot) return null;

    let matched: number | null = null;
    let servers:
      | { ifsServer: string | null; up: number; down: number; none: number; total: number }[]
      | null = null;

    if (fileType === 'RTU') {
      matched = await prisma.scadaRtuRow.count({
        where: { snapshotId: snapshot.id, locationId: { not: null } },
      });
    } else {
      const grouped = await prisma.scadaLineRow.groupBy({
        by: ['ifsServer', 'operState'],
        where: { snapshotId: snapshot.id },
        _count: { _all: true },
      });
      const byServer = new Map<
        string | null,
        { up: number; down: number; none: number; total: number }
      >();
      for (const g of grouped) {
        const entry = byServer.get(g.ifsServer) ?? { up: 0, down: 0, none: 0, total: 0 };
        const n = g._count._all;
        if (g.operState === 'UP') entry.up += n;
        else if (g.operState === 'DOWN') entry.down += n;
        else entry.none += n; // slot UNASG tanpa Oper State
        entry.total += n;
        byServer.set(g.ifsServer, entry);
      }
      servers = [...byServer.entries()]
        .map(([ifsServer, counts]) => ({ ifsServer, ...counts }))
        .sort((a, b) => (a.ifsServer ?? '').localeCompare(b.ifsServer ?? ''));
    }

    return {
      id: snapshot.id,
      fileType: snapshot.fileType,
      uploadedAt: snapshot.uploadedAt,
      uploader: snapshot.uploader,
      totalRows: snapshot.totalRows,
      totalUp: snapshot.totalUp,
      totalDown: snapshot.totalDown,
      notes: snapshot.notes,
      matched,
      servers,
    };
  }

  /** Paginated RTU rows from the latest RTU snapshot. */
  async listRtu(query: RtuQuery) {
    const snapshot = await this.requireLatest('RTU');
    const where = {
      snapshotId: snapshot.id,
      ...(query.operState !== 'ALL' ? { operState: query.operState } : {}),
      ...(query.search
        ? {
            OR: [{ rtuName: { contains: query.search, mode: 'insensitive' as const } }, { rtuText: { contains: query.search, mode: 'insensitive' as const } }],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.scadaRtuRow.count({ where }),
      prisma.scadaRtuRow.findMany({
        where,
        orderBy: { rtuName: 'asc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { location: { select: { id: true, code: true, name: true } } },
      }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /** Paginated Line rows from the latest LINES snapshot. */
  async listLines(query: LinesQuery) {
    const snapshot = await this.requireLatest('LINES');
    const where = {
      snapshotId: snapshot.id,
      // NONE = slot channel UNASG tanpa Oper State (disimpan sebagai null).
      ...(query.operState === 'NONE'
        ? { operState: null }
        : query.operState !== 'ALL'
          ? { operState: query.operState }
          : {}),
      ...(query.ifsServer ? { ifsServer: query.ifsServer } : {}),
      ...(query.channelId != null ? { channelId: query.channelId } : {}),
      ...(query.search
        ? {
            OR: [
              { channelName: { contains: query.search, mode: 'insensitive' as const } },
              { channelText: { contains: query.search, mode: 'insensitive' as const } },
              { ipAddr: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      prisma.scadaLineRow.count({ where }),
      prisma.scadaLineRow.findMany({
        where,
        orderBy: [{ ifsServer: 'asc' }, { channelId: 'asc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);

    return {
      items,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  /** Last 30 uploads (metadata only — snapshots are replaced, so this reads
   *  the audit trail the upload writes rather than the live table). */
  async history() {
    // The live table holds at most one snapshot per type (replace semantics),
    // so upload history comes from audit_logs where every upload is recorded.
    const logs = await prisma.auditLog.findMany({
      where: { entityType: 'ScadaSnapshot', action: 'CREATE' },
      orderBy: { performedAt: 'desc' },
      take: 30,
      include: { performer: { select: { id: true, name: true, email: true } } },
    });

    return logs.map((log) => {
      let summary: Record<string, unknown> = {};
      try {
        summary = log.newValue ? (JSON.parse(log.newValue) as Record<string, unknown>) : {};
      } catch {
        // ignore malformed audit payloads — render metadata-only rows
      }
      return {
        id: log.id,
        snapshotId: log.entityId,
        uploadedAt: log.performedAt,
        uploader: log.performer,
        fileType: (summary.fileType as string) ?? null,
        totalRows: (summary.totalRows as number) ?? null,
        totalUp: (summary.totalUp as number) ?? null,
        totalDown: (summary.totalDown as number) ?? null,
        matched: (summary.matched as number | null) ?? null,
      };
    });
  }

  private async requireLatest(fileType: ScadaFileType) {
    const snapshot = await prisma.scadaSnapshot.findFirst({
      where: { fileType },
      orderBy: { uploadedAt: 'desc' },
      select: { id: true },
    });
    if (!snapshot) {
      throw new NotFoundError(
        `Belum ada snapshot ${fileType}. Upload file export Siemens SP7 terlebih dahulu.`
      );
    }
    return snapshot;
  }
}

export const scadaUploadService = new ScadaUploadService();
