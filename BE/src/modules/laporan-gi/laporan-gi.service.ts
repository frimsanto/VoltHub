import { Prisma } from '@prisma/client';
import { laporanGiRepository, LaporanGiRepository } from './laporan-gi.repository';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import { notificationDispatcher } from '../notifications/notification.dispatcher';
import { workOrderService } from '../work-orders/work-order.service';
import { assertLaporanAwalSubmitted } from '../work-orders/work-order-report-gates';
import { assertWoNotRejected } from '../work-orders/work-order-lock.helper';
import { isFieldOfficer } from '../../auth/roles';
import { rtuppInScope, type TenantScope } from '../../utils/tenantScope';
import type {
  CreateLaporanGiInput,
  UpdateLaporanGiInput,
  DecideLaporanGiInput,
  ListLaporanGiQuery,
} from './laporan-gi.validation';

export interface Actor {
  userId?: string;
  role?: string | null;
}

/** Section JSON payload keys (Json columns on LaporanGi). */
const SECTION_KEYS = [
  'rectifier',
  'rectifierBackup',
  'baterai',
  'serialDevice',
  'rtuIo',
  'kubikel',
  'relayProteksi',
] as const;

const asJson = (v: unknown): Prisma.InputJsonValue | undefined =>
  v == null ? undefined : (v as Prisma.InputJsonValue);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null;

const isAbsent = (v: unknown): boolean => isObj(v) && v.tidakAda === true;

const hasKesimpulan = (v: unknown): boolean =>
  isObj(v) && typeof v.kesimpulan === 'string' && v.kesimpulan.trim() !== '';

/** Hasil uji manual (BERHASIL/GAGAL) → enum WO; selain itu null. */
const toWorkResult = (v: unknown) => (v === 'BERHASIL' || v === 'GAGAL' ? v : null);

export class LaporanGiService {
  constructor(private readonly repo: LaporanGiRepository = laporanGiRepository) {}

  async list(query: ListLaporanGiQuery, actor: Actor, scope: TenantScope) {
    const restrictToUserId =
      isFieldOfficer(actor.role) || query.mine ? actor.userId ?? null : null;
    const { data, total, page, limit } = await this.repo.findAll(query, scope, { restrictToUserId });
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string, actor: Actor, scope: TenantScope) {
    const report = await this.repo.findById(id, scope);
    if (!report) throw new NotFoundError('Laporan GI tidak ditemukan');
    // PETUGAS only sees their own reports (own-records).
    if (isFieldOfficer(actor.role) && report.inspectorId !== actor.userId) {
      throw new ForbiddenError('Laporan GI ini bukan milik Anda');
    }
    return report;
  }

  /** Resolve identitas (auto-fill dari WO bila workOrderId ada). */
  private async resolveIdentity(
    input: { locationId?: string | null; feederId?: string | null; workOrderId?: string | null; pelaksana?: string | null },
    scope: TenantScope,
  ) {
    let locationId = input.locationId ?? null;
    let feederId = input.feederId ?? null;
    let pelaksana = input.pelaksana ?? null;
    const workOrderId = input.workOrderId ?? null;
    let requiredReports: unknown = null;

    if (workOrderId) {
      const wo = await this.repo.workOrderById(workOrderId, scope);
      if (!wo) throw new NotFoundError('Work Order tidak ditemukan / di luar RTUPP Anda');
      locationId = wo.locationId;
      feederId = wo.feederId ?? null;
      pelaksana = wo.team?.name ?? pelaksana;
      requiredReports = wo.requiredReports;
    }

    if (!locationId) throw new ValidationError('locationId (GI) wajib diisi');

    const loc = await this.repo.locationById(locationId);
    if (!loc) throw new NotFoundError(`GI/Lokasi "${locationId}" tidak ditemukan`);
    if (!rtuppInScope(scope, loc.rtuppId)) {
      throw new ForbiddenError('GI tersebut berada di luar RTUPP Anda');
    }
    if (loc.locationType !== 'GI') {
      throw new BusinessRuleError('Laporan GI harus berakar pada lokasi bertipe GI');
    }
    if (feederId && !(await this.repo.feederExists(feederId, locationId))) {
      throw new ValidationError(`Penyulang "${feederId}" tidak ditemukan pada GI ini`);
    }

    return { locationId, feederId, workOrderId, pelaksana, up3: loc.up3 ?? null, requiredReports };
  }

  private sectionData(input: Partial<Record<(typeof SECTION_KEYS)[number], unknown>>) {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const k of SECTION_KEYS) {
      const v = asJson(input[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }

  /** Sinkronisasi status PMT, LR, ES, MPUF dari nested elements ke scalar fields. */
  private syncScalars(kubikelVal: any) {
    const out: Record<string, string | null> = {
      statusPmt: null,
      statusPmtDiMaster: null,
      statusLr: null,
      statusLrDiMaster: null,
      esDiMaster: null,
      mpufDiMaster: null,
    };
    if (kubikelVal && isObj(kubikelVal.elements)) {
      const el = kubikelVal.elements as Record<string, any>;
      if (el.PMT) {
        out.statusPmt = el.PMT.cubicle ?? null;
        out.statusPmtDiMaster = el.PMT.master ?? null;
      }
      if (el.LR) {
        out.statusLr = el.LR.cubicle ?? null;
        out.statusLrDiMaster = el.LR.master ?? null;
      }
      if (el.ES) {
        out.esDiMaster = el.ES.master ?? null;
      }
      if (el.MPUF) {
        out.mpufDiMaster = el.MPUF.master ?? null;
      }
    }
    return out;
  }

  async create(input: CreateLaporanGiInput, actor: Actor, scope: TenantScope) {
    const id = await this.resolveIdentity(input, scope);
    if (id.workOrderId) {
      await assertLaporanAwalSubmitted(id.workOrderId, id.requiredReports);
    }
    const synced = this.syncScalars(input.kubikel);

    const created = await this.repo.create({
      locationId: id.locationId,
      feederId: id.feederId,
      workOrderId: id.workOrderId,
      up3: id.up3,
      reportDate: input.reportDate,
      pelaksana: id.pelaksana,
      inspectorId: actor.userId ?? null,
      status: 'DRAFT',
      scadaRtuName: input.scadaRtuName ?? null,
      notes: input.notes ?? null,
      catatan: input.catatan ?? null,
      ...synced,
      ...this.sectionData(input),
      createdBy: actor.userId ?? null,
    });

    await recordAuditLog({
      entityType: 'LaporanGi',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: actor.userId,
    });
    return created;
  }

  async update(id: string, input: UpdateLaporanGiInput, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    assertWoNotRejected(current.workOrder?.status);
    if (!['DRAFT', 'REJECTED'].includes(current.status)) {
      throw new BusinessRuleError(`Laporan GI berstatus ${current.status} tidak dapat diubah`);
    }
    if (input.feederId !== undefined && input.feederId && !(await this.repo.feederExists(input.feederId, current.locationId))) {
      throw new ValidationError(`Penyulang "${input.feederId}" tidak ditemukan pada GI ini`);
    }

    const synced = input.kubikel !== undefined ? this.syncScalars(input.kubikel) : {};

    const updated = await this.repo.update(id, {
      ...(input.feederId !== undefined ? { feederId: input.feederId ?? null } : {}),
      ...(input.reportDate !== undefined ? { reportDate: input.reportDate } : {}),
      ...(input.pelaksana !== undefined ? { pelaksana: input.pelaksana ?? null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
      ...(input.catatan !== undefined ? { catatan: input.catatan ?? null } : {}),
      ...(input.scadaRtuName !== undefined ? { scadaRtuName: input.scadaRtuName ?? null } : {}),
      ...synced,
      ...this.sectionData(input),
      updatedBy: actor.userId ?? null,
    });

    await recordAuditLog({
      entityType: 'LaporanGi',
      entityId: id,
      action: 'UPDATE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });
    return updated;
  }

  /** Wajib kesimpulan untuk tiap section aktif. */
  private assertSubmittable(r: {
    rectifier: unknown; rectifierBackup: unknown; baterai: unknown;
    serialDevice: unknown; rtuIo: unknown;
    kubikel: unknown; relayProteksi: unknown;
  }) {
    const missing: string[] = [];
    const need = (label: string, v: unknown) => {
      if (!hasKesimpulan(v)) missing.push(label);
    };

    need('Rectifier', r.rectifier);
    if (!isAbsent(r.rectifierBackup)) need('Rectifier Backup', r.rectifierBackup);
    need('Baterai', r.baterai);

    const sd = isObj(r.serialDevice) ? r.serialDevice : {};
    need('Serial Device Utama', sd.utama ?? r.serialDevice);
    if (sd.device2TidakAda !== true) need('Serial Device Ke-2', sd.device2);

    need('RTU I/O', r.rtuIo);
    need('Kubikel', r.kubikel);
    if (!isAbsent(r.relayProteksi)) need('Relay Proteksi', r.relayProteksi);

    if (missing.length > 0) {
      throw new ValidationError(`Kesimpulan wajib diisi untuk section: ${missing.join(', ')}`);
    }
  }

  /** PETUGAS submit: DRAFT/REJECTED → SUBMITTED. */
  async submit(id: string, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    assertWoNotRejected(current.workOrder?.status);
    if (!['DRAFT', 'REJECTED'].includes(current.status)) {
      throw new BusinessRuleError(`Laporan GI berstatus ${current.status} tidak dapat dikirim`);
    }
    this.assertSubmittable(current as any);

    const updated = await this.repo.update(id, {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      updatedBy: actor.userId ?? null,
    });

    await recordAuditLog({
      entityType: 'LaporanGi',
      entityId: id,
      action: 'STATUS_CHANGE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });

    if (current.workOrderId) {
      // Petakan hasil uji manual dari elements PMT ke WorkOrder
      const k = (isObj(current.kubikel) ? current.kubikel : {}) as Record<string, unknown>;
      const elements = (isObj(k.elements) ? k.elements : {}) as Record<string, any>;
      const pmt = (isObj(elements.PMT) ? elements.PMT : {}) as Record<string, any>;

      await workOrderService.onLinkedReportSubmitted(
        current.workOrderId,
        {
          resultMapping: {
            hasilRC: toWorkResult(pmt.hasilRc),
            hasilLR: null,
            hasilES: null,
            statusCB: null,
          },
        },
        actor,
        scope,
      );
    } else {
      notificationDispatcher.giReportWorkflow({
        action: 'SUBMIT',
        reportId: updated.id,
        ref: updated.location?.code ?? updated.id,
        rtuppId: updated.location?.rtuppId,
        ownerId: updated.inspectorId,
        actorId: actor.userId,
      });
    }

    return updated;
  }

  /** ADMIN/MASTER decision: SUBMITTED → VALIDATED | REJECTED. */
  async decide(id: string, input: DecideLaporanGiInput, actor: Actor, scope: TenantScope) {
    const current = await this.getById(id, actor, scope);
    if (current.workOrderId) {
      throw new BusinessRuleError('Approval Laporan GI tertaut Work Order dilakukan di Work Order terkait');
    }
    if (current.status !== 'SUBMITTED') {
      throw new BusinessRuleError(`Hanya laporan berstatus SUBMITTED yang dapat divalidasi (saat ini ${current.status})`);
    }

    const updated = await this.repo.update(id, {
      status: input.decision,
      validatedAt: new Date(),
      validatedBy: actor.userId ?? null,
      validationNote: input.validationNote ?? null,
      updatedBy: actor.userId ?? null,
    });

    await recordAuditLog({
      entityType: 'LaporanGi',
      entityId: id,
      action: 'STATUS_CHANGE',
      oldValue: current,
      newValue: updated,
      performedBy: actor.userId,
    });

    notificationDispatcher.giReportWorkflow({
      action: input.decision === 'VALIDATED' ? 'APPROVE' : 'REJECT',
      reportId: updated.id,
      ref: updated.location?.code ?? updated.id,
      rtuppId: updated.location?.rtuppId,
      ownerId: updated.inspectorId,
      actorId: actor.userId,
      reason: input.validationNote,
    });

    return updated;
  }
}

export const laporanGiService = new LaporanGiService();
