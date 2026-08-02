import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { importRepository, ImportRepository, ImportErrorRecord } from './import.repository';
import { assetService } from '../assets/asset.service';
import { assetRepository } from '../assets/asset.repository';
import { locationService } from '../locations/location.service';
import { locationRepository } from '../locations/location.repository';
import { feederRepository } from '../feeders/feeder.repository';
import { performanceService } from '../performance/performance.service';
import { performanceImportRowSchema } from '../performance/performance.validation';
import {
  parseAssetWorkbook,
  parseGarduWorkbook,
  parsePerformanceWorkbook,
  parseScadaRtuWorkbook,
  type ParsedRow,
} from './import.parser';
import { assetImportRowSchema, garduImportRowSchema, scadaRtuImportRowSchema } from './import.validation';
import { AppError, ConflictError, NotFoundError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import { resolveScopeForUserId, rtuppInScope } from '../../utils/tenantScope';
import { z } from 'zod';
import type { ListJobsQuery } from './import.validation';

const IMPORT_SUBDIR = 'documents';

/**
 * Import Service — the Asset Excel import engine.
 *
 * Validation engine: each row is (1) Zod-validated, (2) FK-resolved
 * (locationCode→location, feederCode→feeder within that location), then
 * (3) created via `assetService.create` so ALL existing asset business rules
 * (unique code/serial, hierarchy, FK) apply without duplication. Per-row
 * failures are captured into import_errors; the job records a summary.
 */
export class ImportService {
  constructor(private readonly repo: ImportRepository = importRepository) {}

  private persistFile(fileName: string, buffer: Buffer): string {
    const safe = `import-${randomUUID()}-${fileName}`.replace(/[^\w.-]+/g, '_');
    const dir = path.join(process.cwd(), env.UPLOAD_DIR, IMPORT_SUBDIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, safe), buffer);
    return `/uploads/${IMPORT_SUBDIR}/${safe}`;
  }

  /**
   * Generic import runner shared by every import domain. Handles job lifecycle,
   * Excel parsing, per-row Zod validation, per-row processing with error capture
   * (failed rows → import_errors), and the final job summary.
   */
  private async runImport<S extends z.ZodTypeAny>(opts: {
    fileName: string;
    buffer: Buffer;
    importType: string;
    userId?: string;
    parse: (buffer: Buffer) => Promise<ParsedRow[]>;
    schema: S;
    process: (input: z.infer<S>, userId?: string) => Promise<unknown>;
  }) {
    const { fileName, buffer, importType, userId, parse, schema, process } = opts;
    const fileUrl = this.persistFile(fileName, buffer);
    const job = await this.repo.createJob({ fileName, fileUrl, importType }, userId);

    const errors: ImportErrorRecord[] = [];
    let successRows = 0;
    let totalRows = 0;

    try {
      const rows = await parse(buffer);
      totalRows = rows.length;

      for (const row of rows) {
        const parsed = schema.safeParse(row.data);
        if (!parsed.success) {
          errors.push({
            rowNumber: row.rowNumber,
            errorMessage: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
            rawData: row.data,
          });
          continue;
        }

        try {
          await process(parsed.data, userId);
          successRows += 1;
        } catch (err) {
          const message = err instanceof AppError || err instanceof Error ? err.message : 'Unknown error';
          errors.push({ rowNumber: row.rowNumber, errorMessage: message, rawData: row.data });
        }
      }
    } catch (err) {
      // Parsing failed entirely → mark the whole job FAILED.
      const message = err instanceof Error ? err.message : 'Failed to parse Excel file';
      await this.repo.finalizeJob(job.id, { totalRows: 0, successRows: 0, failedRows: 0, status: 'FAILED' });
      await this.repo.saveErrors(job.id, [{ rowNumber: 0, errorMessage: message, rawData: { fileName } }]);
      await this.auditJob(job.id, {
        importType,
        fileName,
        totalRows: 0,
        successRows: 0,
        failedRows: 0,
        status: 'FAILED',
        userId,
      });
      return this.getJob(job.id);
    }

    const failedRows = errors.length;
    const status = totalRows > 0 && successRows === 0 ? 'FAILED' : 'SUCCESS';

    await this.repo.saveErrors(job.id, errors);
    await this.repo.finalizeJob(job.id, { totalRows, successRows, failedRows, status });
    // One audit row per import job (entityType=ImportJob). Per-row entities
    // created during the run (assets, locations) are audited by their own
    // services, so we deliberately do NOT re-log them here (no duplicates).
    await this.auditJob(job.id, {
      importType,
      fileName,
      totalRows,
      successRows,
      failedRows,
      status,
      userId,
    });

    return this.getJob(job.id);
  }

  /** Records a single canonical audit row summarising a completed import job. */
  private async auditJob(
    jobId: string,
    summary: {
      importType: string;
      fileName: string;
      totalRows: number;
      successRows: number;
      failedRows: number;
      status: string;
      userId?: string;
    }
  ) {
    const { userId, ...newValue } = summary;
    await recordAuditLog({
      entityType: 'ImportJob',
      entityId: jobId,
      action: 'CREATE',
      newValue,
      performedBy: userId,
    });
  }

  // ── Import Asset (Story 26) → assets ──
  async importAssets(fileName: string, buffer: Buffer, userId?: string) {
    // Resolve the importer's tenant scope once: created assets must land inside
    // the importer's RTUPP, and the location they attach to must be in scope.
    const scope = await resolveScopeForUserId(userId);
    return this.runImport({
      fileName,
      buffer,
      userId,
      importType: 'ASSET',
      parse: parseAssetWorkbook,
      schema: assetImportRowSchema,
      process: async (input, uid) => {
        const location = await locationRepository.findByCode(input.locationCode);
        if (!location) throw new NotFoundError(`Location code "${input.locationCode}" not found`);

        let feederId: string | undefined;
        if (input.feederCode) {
          const feeder = await feederRepository.findByLocationAndCode(location.id, input.feederCode);
          if (!feeder) {
            throw new NotFoundError(
              `Feeder code "${input.feederCode}" not found in location "${input.locationCode}"`
            );
          }
          feederId = feeder.id;
        }

        return assetService.create(
          {
            locationId: location.id,
            feederId,
            assetType: input.assetType,
            assetCode: input.assetCode,
            assetName: input.assetName,
            brand: input.brand ?? null,
            model: input.model ?? null,
            serialNumber: input.serialNumber ?? null,
            tahunOperasi: input.tahunOperasi ?? null,
            status: input.status,
            notes: input.notes ?? null,
          },
          uid,
          scope
        );
      },
    });
  }

  // ── Import Gardu / Site (Story 24) → locations (locationType=GARDU) ──
  async importGardu(fileName: string, buffer: Buffer, userId?: string) {
    // Imported gardu are stamped with the importer's RTUPP (scoped) so they are
    // immediately tenant-isolated; a global importer (MASTER) leaves them unset.
    const scope = await resolveScopeForUserId(userId);
    return this.runImport({
      fileName,
      buffer,
      userId,
      importType: 'GARDU',
      parse: parseGarduWorkbook,
      schema: garduImportRowSchema,
      // locationService.create enforces BR-004 (globally unique site code) AND
      // the per-RTUPP gardu-type rule (location.constants — single source). A row
      // whose type is not allowed for the importer's RTUPP (e.g. GARDU under
      // RTUPP1) throws a 422 that runImport captures as a row-level ImportError,
      // so the batch keeps processing the valid rows.
      process: async (input, uid) =>
        locationService.create(
          {
            code: input.siteCode,
            name: input.siteName,
            locationType: 'GARDU',
            up3: input.up3 ?? null,
            address: input.address ?? null,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
            status: true,
          },
          uid,
          scope
        ),
    });
  }

  // ── Import Performance (Story 25) → performance_daily (BR-010/011/012) ──
  async importPerformance(fileName: string, buffer: Buffer, userId?: string) {
    // Scope guard: a unit importer may only post performance for its own gardu.
    const scope = await resolveScopeForUserId(userId);
    return this.runImport({
      fileName,
      buffer,
      userId,
      importType: 'PERFORMANCE',
      parse: parsePerformanceWorkbook,
      schema: performanceImportRowSchema,
      process: async (input) => {
        const location = await locationRepository.findByCode(input.siteCode);
        if (!location || !rtuppInScope(scope, location.rtuppId)) {
          throw new NotFoundError(`Gardu code "${input.siteCode}" not found`);
        }
        // Upsert enforces one record per (site, date) — BR-012.
        return performanceService.recordFromImport({
          locationId: location.id,
          performanceDate: input.performanceDate,
          performanceStatus: input.performanceStatus,
          score: input.score ?? null,
        });
      },
    });
  }

  // ── Import SCADA RTU live-state (IFS export) → assets.operState/adminState ──
  // This does NOT create assets. It matches each RTU row to an EXISTING asset
  // (assetType=RTU) and overwrites the live communication-state snapshot. Rows
  // that match no asset (or are ambiguous) are captured in import_errors so the
  // operator can reconcile the SCADA registry against the asset registry.
  async importScadaRtuState(fileName: string, buffer: Buffer, userId?: string) {
    // One snapshot timestamp for the whole export — every row "last seen" now.
    const importedAt = new Date();
    return this.runImport({
      fileName,
      buffer,
      userId,
      importType: 'SCADA_RTU_STATE',
      parse: parseScadaRtuWorkbook,
      schema: scadaRtuImportRowSchema,
      process: async (input) => {
        const rtuName = input.rtuName.trim();
        const operState = input.operState ? input.operState.trim().toUpperCase() : null;
        const adminState = input.adminState ? input.adminState.trim().toUpperCase() : null;

        // 1) Stable correlation key first; 2) fall back to RTU asset name.
        type RtuMatch = { id: string; operState: string | null };
        let target: RtuMatch | null = await assetRepository.findByScadaRtuName(rtuName);
        if (!target) {
          const candidates = await assetRepository.findRtuAssetsByName(rtuName);
          if (candidates.length === 0) {
            throw new NotFoundError(`RTU "${rtuName}" tidak cocok dengan aset manapun`);
          }
          if (candidates.length > 1) {
            throw new ConflictError(`RTU "${rtuName}" cocok dengan ${candidates.length} aset (ambigu)`);
          }
          target = candidates[0];
        }

        const changed = operState !== (target.operState ?? null);
        await assetRepository.updateScadaState(target.id, {
          scadaRtuName: rtuName,
          operState,
          adminState,
          commLastSeenAt: importedAt,
          ...(changed ? { commStateChangedAt: importedAt } : {}),
        });
      },
    });
  }

  async listJobs(query: ListJobsQuery) {
    const { data, total, page, limit } = await this.repo.findAll(query);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getJob(id: string) {
    const job = await this.repo.findById(id);
    if (!job) throw new NotFoundError('Import job not found');
    return job;
  }

  async getJobErrors(id: string) {
    await this.getJob(id);
    return this.repo.findErrors(id);
  }
}

export const importService = new ImportService();
