import prisma from '../config/database';
import { CreateLaporanAwalInput, UpdateLaporanAwalInput } from '../validators/laporanValidators';
import { isUniqueConstraintError } from '../utils/generateId';
import { recordAudit } from '../utils/audit';
import { validationActionToStatus, isPetugasEditable } from '../utils/reportStatus';
import { sendToUser } from './pushService';
import { isMaster, isFieldOfficer } from '../auth/roles';
import { assertReportRtuppAccess } from '../utils/reportScope';
import { syncWorkOrderStatus } from '../utils/workOrderSync';

// Generate the next sequential report ID for the current year.
// Derived from the most recently created report (not count(), which collides
// after a deletion). Concurrency collisions are handled by retrying the create.
const generateLaporanAwalId = async (): Promise<string> => {
  const prefix = 'LA';
  const year = new Date().getFullYear();
  const last = await prisma.laporanAwal.findFirst({
    where: { reportId: { startsWith: `${prefix}-${year}-` } },
    orderBy: { createdAt: 'desc' },
    select: { reportId: true },
  });
  const lastSeq = last
    ? parseInt(last.reportId.split('-')[2] ?? '0', 10) || 0
    : 0;
  const sequence = String(lastSeq + 1).padStart(3, '0');
  return `${prefix}-${year}-${sequence}`;
};

const MAX_REPORT_ID_RETRIES = 5;

export const createLaporanAwal = async (
  data: CreateLaporanAwalInput,
  userId: string
) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    throw new Error("User login tidak ditemukan di database. Silakan logout lalu login ulang.");
  }

  // Retry on a duplicate reportId (concurrent create or deletion gap).
  for (let attempt = 0; attempt < MAX_REPORT_ID_RETRIES; attempt++) {
    const reportId = await generateLaporanAwalId();
    try {
      return await createLaporanAwalWithId(data, user.id, reportId);
    } catch (e) {
      if (isUniqueConstraintError(e) && attempt < MAX_REPORT_ID_RETRIES - 1) {
        continue;
      }
      throw e;
    }
  }
  throw new Error('Gagal membuat reportId unik, silakan coba lagi.');
};

const createLaporanAwalWithId = async (
  data: CreateLaporanAwalInput,
  userId: string,
  reportId: string
) => {
  const laporan = await prisma.$transaction(async (tx) => {
  const created = await tx.laporanAwal.create({
    data: {
      reportId,
      hari: data.hari,
      tanggal: new Date(data.tanggal),
      nomorSPJ: data.nomorSPJ || "-",
      up3: data.up3,
      pekerjaan: data.pekerjaan,
      lokasiGardu: data.lokasiGardu,

      pelaksana: data.pelaksana || "Petugas PLN",
      penanggungJawab:
        data.penanggungJawab ||
        data.pengawasPekerjaan ||
        "Pengawas PLN",

      pengawasPekerjaan: data.pengawasPekerjaan || null,
      pengawasManuver: data.pengawasManuver || null,
      pengawasK3: data.pengawasK3 || null,
      nomorWP: data.nomorWP || null,

      potensiBahaya: data.potensiBahaya || "-",
      pengendalianRisiko: data.pengendalianRisiko || "-",
      apd: data.apd || null,
      rambuKerja: data.rambuKerja || null,
      asuransiTK: data.asuransiTK || null,

      // Safety Checklist (K3) persistence
      wpJsahirarcSop: data.wpJsahirarcSop ?? false,
      kondisiPersonil: data.kondisiPersonil ?? "SEHAT",
      potensiBahayaDijelaskan: data.potensiBahayaDijelaskan ?? false,
      apdLengkap: data.apdLengkap ?? false,
      asuransiKetenagakerjaan: data.asuransiKetenagakerjaan ?? false,
      berdoaSebelumBekerja: data.berdoaSebelumBekerja ?? false,

      // Personil Snapshot (immutable audit trail copy at submit time)
      personilSnapshot: (data.personilSnapshot as any) ?? [],
      jumlahPersonil:
        data.jumlahPersonil ?? (Array.isArray(data.personilSnapshot) ? data.personilSnapshot.length : 0),

      status: (data.status as any) || "PENDING",
      createdById: userId,
      submittedAt: new Date(),

      // Work Order link + kondisi perangkat checklist (Relay/RC/LR/ES/CB)
      workOrderId: data.workOrderId ?? null,
      cekRelay: (data.cekRelay as any) ?? null,
      cekRC: (data.cekRC as any) ?? null,
      cekLR: (data.cekLR as any) ?? null,
      cekES: (data.cekES as any) ?? null,
      cekStatusCB: (data.cekStatusCB as any) ?? null,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      attachments: true,
      validations: true,
    },
  });

  await recordAudit(
    {
      userId,
      action: 'SUBMIT',
      entityType: 'LAPORAN_AWAL',
      entityId: created.id,
      laporanAwalId: created.id,
      details: { reportId: created.reportId },
    },
    tx
  );

    return created;
  });

  // Laporan Awal lahir dari WO → WO masuk tahap eksekusi (best-effort mirror).
  await syncWorkOrderStatus(laporan.workOrderId, 'ON_PROGRESS', { startedAt: new Date() });

  return laporan;
};

// Get all Laporan Awal (with role-based filtering)
export const getAllLaporanAwal = async (
  userId: string,
  userRole: string,
  options: {
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
    startDate?: string;
    endDate?: string;
  } = {}
) => {
  const { status, search, page = 1, limit = 10, startDate, endDate } = options;
  
  // Build where clause
  const where: any = {};
  
  // Role-based filtering
  if (userRole === 'PETUGAS') {
    where.createdById = userId;
  }
  
  // Status filter
  if (status) {
    where.status = status;
  }
  
  // Date range filter
  if (startDate || endDate) {
    where.tanggal = {};
    if (startDate) where.tanggal.gte = new Date(startDate);
    if (endDate) where.tanggal.lte = new Date(endDate);
  }
  
  // Search filter
  if (search) {
    where.OR = [
      { reportId: { contains: search, mode: 'insensitive' as const } },
      { pekerjaan: { contains: search, mode: 'insensitive' as const } },
      { lokasiGardu: { contains: search, mode: 'insensitive' as const } },
      { nomorSPJ: { contains: search, mode: 'insensitive' as const } },
    ];
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.laporanAwal.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        attachments: {
          select: {
            id: true,
            originalName: true,
            category: true,
          },
        },
        validations: {
          orderBy: { validatedAt: 'desc' },
          take: 1,
          include: {
            validator: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.laporanAwal.count({ where }),
  ]);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

// Get Laporan Awal by ID
export const getLaporanAwalById = async (
  id: string,
  userId: string,
  userRole: string
) => {
  const laporan = await prisma.laporanAwal.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          rtuppId: true,
          rtupp: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          team: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
        },
      },
      attachments: {
        orderBy: { uploadedAt: 'desc' },
      },
      validations: {
        orderBy: { validatedAt: 'desc' },
        include: {
          validator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!laporan) {
    throw new Error('Laporan not found');
  }

  // Access scoping: PETUGAS sees only its own; ADMIN only its RTUPP; MASTER/MANAGER all.
  if (isFieldOfficer(userRole)) {
    if (laporan.createdById !== userId) throw new Error('Access denied');
  } else {
    await assertReportRtuppAccess(userId, userRole, laporan.createdBy?.rtuppId);
  }

  return laporan;
};

// Update Laporan Awal
export const updateLaporanAwal = async (
  id: string,
  data: UpdateLaporanAwalInput,
  userId: string,
  userRole: string
) => {
  // Check if laporan exists
  const existing = await prisma.laporanAwal.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Laporan not found');
  }

  // Check permission
  if (userRole === 'PETUGAS' && existing.createdById !== userId) {
    throw new Error('Access denied');
  }

  // BUG-03: a PETUGAS may only edit their own report while it is in an editable
  // state (DRAFT, PENDING — still owned by the petugas). Once a validator has
  // acted (APPROVED, REJECTED, REVISED) the report is locked.
  if (userRole === 'PETUGAS' && !isPetugasEditable(existing.status)) {
    throw new Error('Report is locked');
  }

  // Admins still cannot edit an APPROVED report unless SUPERADMIN.
  if (existing.status === 'APPROVED' && !isMaster(userRole)) {
    throw new Error('Cannot edit approved report');
  }

  // Explicit column mapping (mirror create flow) so non-column passthrough
  // fields (rtuppId, teamId, attachments, etc.) never reach the Prisma update.
  // Safety checklist + personilSnapshot ARE real columns and are mapped below.
  // undefined values are ignored by Prisma, preserving existing data.
  const updateData: any = {
    hari: data.hari,
    tanggal: data.tanggal ? new Date(data.tanggal) : undefined,
    nomorSPJ: data.nomorSPJ,
    up3: data.up3,
    pekerjaan: data.pekerjaan,
    lokasiGardu: data.lokasiGardu,
    pelaksana: data.pelaksana,
    penanggungJawab: data.penanggungJawab,
    pengawasPekerjaan: data.pengawasPekerjaan,
    pengawasManuver: data.pengawasManuver,
    pengawasK3: data.pengawasK3,
    nomorWP: data.nomorWP,
    potensiBahaya: data.potensiBahaya,
    pengendalianRisiko: data.pengendalianRisiko,
    apd: data.apd,
    rambuKerja: data.rambuKerja,
    asuransiTK: data.asuransiTK,
    // Safety Checklist (K3) — undefined values are ignored by Prisma
    wpJsahirarcSop: data.wpJsahirarcSop,
    kondisiPersonil: data.kondisiPersonil,
    potensiBahayaDijelaskan: data.potensiBahayaDijelaskan,
    apdLengkap: data.apdLengkap,
    asuransiKetenagakerjaan: data.asuransiKetenagakerjaan,
    berdoaSebelumBekerja: data.berdoaSebelumBekerja,
    // Work Order link + kondisi perangkat checklist (undefined ignored by Prisma)
    workOrderId: data.workOrderId,
    cekRelay: data.cekRelay as any,
    cekRC: data.cekRC as any,
    cekLR: data.cekLR as any,
    cekES: data.cekES as any,
    cekStatusCB: data.cekStatusCB as any,
    // BUG-01: status is intentionally NOT copied from the request payload.
    // Status transitions only happen through the validate endpoint, with the
    // single exception of the DRAFT -> PENDING submit handled below.
  };

  // Personil Snapshot — only overwrite when explicitly provided
  if (data.personilSnapshot !== undefined) {
    updateData.personilSnapshot = (data.personilSnapshot as any) ?? [];
    updateData.jumlahPersonil =
      data.jumlahPersonil ?? (Array.isArray(data.personilSnapshot) ? data.personilSnapshot.length : 0);
  } else if (data.jumlahPersonil !== undefined) {
    updateData.jumlahPersonil = data.jumlahPersonil;
  }

  // BUG-01: the only status transition allowed through update is the
  // DRAFT -> PENDING submit. Any other requested status is ignored.
  const isSubmit = existing.status === 'DRAFT' && (data.status as any) === 'PENDING';
  if (isSubmit) {
    updateData.status = 'PENDING';
    updateData.submittedAt = new Date();
  }

  const laporan = await prisma.$transaction(async (tx) => {
    const updated = await tx.laporanAwal.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        attachments: true,
        validations: {
          include: {
            validator: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    await recordAudit(
      {
        userId,
        action: isSubmit ? 'SUBMIT' : 'UPDATE',
        entityType: 'LAPORAN_AWAL',
        entityId: updated.id,
        laporanAwalId: updated.id,
        details: { reportId: updated.reportId },
      },
      tx
    );

    return updated;
  });

  return laporan;
};

// Delete Laporan Awal
export const deleteLaporanAwal = async (
  id: string,
  userId: string,
  userRole: string
) => {
  const existing = await prisma.laporanAwal.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Laporan not found');
  }

  // Check permission
  if (userRole === 'PETUGAS' && existing.createdById !== userId) {
    throw new Error('Access denied');
  }

  // BUG-03: a PETUGAS may only delete their own report while it is in an editable
  // state (DRAFT, PENDING). Once a validator has acted (APPROVED, REJECTED,
  // REVISED) the report is locked.
  if (userRole === 'PETUGAS' && !isPetugasEditable(existing.status)) {
    throw new Error('Report is locked');
  }

  // Admins still cannot delete an APPROVED report unless SUPERADMIN.
  if (existing.status === 'APPROVED' && !isMaster(userRole)) {
    throw new Error('Cannot delete approved report');
  }

  // Hard delete (remove comments for soft delete)
  await prisma.$transaction(async (tx) => {
    await tx.laporanAwal.delete({
      where: { id },
    });

    await recordAudit(
      {
        userId,
        action: 'DELETE',
        entityType: 'LAPORAN_AWAL',
        entityId: id,
        details: { reportId: existing.reportId },
      },
      tx
    );
  });

  return { message: 'Laporan deleted successfully' };
};

// Validate/Approve Laporan Awal (Admin only)
export const validateLaporanAwal = async (
  id: string,
  status: 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED',
  notes: string | undefined,
  validatorId: string,
  validatorRole: string
) => {
  const laporan = await prisma.laporanAwal.findUnique({
    where: { id },
    include: { createdBy: { select: { rtuppId: true } } },
  });

  if (!laporan) {
    throw new Error('Laporan awal tidak ditemukan');
  }

  // Per-RTUPP approval: ADMIN may only validate reports from their own RTUPP;
  // MASTER (global) may validate any. (PETUGAS/MANAGER are blocked at the route.)
  await assertReportRtuppAccess(validatorId, validatorRole, laporan.createdBy?.rtuppId);

  if (laporan.status !== 'PENDING' && laporan.status !== 'DRAFT') {
    throw new Error('Can only validate pending reports');
  }

  // Map validation action to the canonical stored report status.
  const reportStatus = validationActionToStatus(status);

  // Update status, create the validation record and write the audit log
  // atomically so approval/rejection and its trail can never diverge.
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.laporanAwal.update({
      where: { id },
      data: {
        status: reportStatus as any,
        approvedAt: status === 'APPROVED' ? new Date() : null,
        approvedById: status === 'APPROVED' ? validatorId : null,
        rejectedAt: status === 'REJECTED' ? new Date() : null,
        rejectedById: status === 'REJECTED' ? validatorId : null,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    await tx.reportValidation.create({
      data: {
        laporanAwalId: id,
        validatorId,
        status: status as any,
        notes:
          notes ||
          (status === 'APPROVED'
            ? 'Laporan disetujui'
            : status === 'REVISION_REQUESTED'
            ? 'Laporan dikembalikan untuk revisi'
            : 'Laporan ditolak'),
      },
    });

    await recordAudit(
      {
        userId: validatorId,
        action: status === 'APPROVED' ? 'VALIDATE' : 'REJECT',
        entityType: 'LAPORAN_AWAL',
        entityId: id,
        laporanAwalId: id,
        details: { status, notes },
      },
      tx
    );

    return result;
  });

  // Notify the report owner of the validation outcome (best-effort, async).
  void sendToUser(laporan.createdById, {
    title:
      status === 'APPROVED'
        ? 'Laporan Awal disetujui'
        : status === 'REVISION_REQUESTED'
        ? 'Laporan Awal perlu revisi'
        : 'Laporan Awal ditolak',
    body: `${laporan.reportId}${notes ? `: ${notes}` : ''}`,
    data: { type: 'laporan-awal', id, status },
  });

  return updated;
};
