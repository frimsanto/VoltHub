import prisma from '../config/database';
import { CreateLaporanAkhirInput, UpdateLaporanAkhirInput } from '../validators/laporanValidators';
import { recordAudit } from '../utils/audit';
import { isUniqueConstraintError } from '../utils/generateId';
import { validationActionToStatus, isPetugasEditable } from '../utils/reportStatus';
import { sendToUser } from './pushService';
import { isMaster, isFieldOfficer } from '../auth/roles';
import { assertReportRtuppAccess } from '../utils/reportScope';
import { syncWorkOrderStatus } from '../utils/workOrderSync';

// Generate the next sequential report ID for the current year.
// Derived from the most recently created report (not count(), which collides
// after a deletion). Concurrency collisions are handled by retrying the create.
const generateLaporanAkhirId = async (): Promise<string> => {
  const prefix = 'LK';
  const year = new Date().getFullYear();
  const last = await prisma.laporanAkhir.findFirst({
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

// Create Laporan Akhir
export const createLaporanAkhir = async (
  data: CreateLaporanAkhirInput,
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
    const reportId = await generateLaporanAkhirId();
    try {
      return await createLaporanAkhirWithId(data, user.id, reportId);
    } catch (e) {
      if (isUniqueConstraintError(e) && attempt < MAX_REPORT_ID_RETRIES - 1) {
        continue;
      }
      throw e;
    }
  }
  throw new Error('Gagal membuat reportId unik, silakan coba lagi.');
};

const createLaporanAkhirWithId = async (
  data: CreateLaporanAkhirInput,
  userId: string,
  reportId: string
) => {
  const d = data as any;

  const laporan = await prisma.$transaction(async (tx) => {
  const created = await tx.laporanAkhir.create({
    data: {
      reportId,
      laporanAwalId: d.laporanAwalId || null,
      nomorSPJ: d.nomorSPJ || "-",
      tanggalSelesai: new Date(d.tanggalSelesai),
      up3: d.up3,
      pekerjaan: d.pekerjaan || d.jenisPekerjaan || "-",
      namaAset: d.namaAset || d.rtuNama || "-",
      tagSCADA: d.tagSCADA || null,
      bayPosisi: d.bayPosisi || null,
      teganganNominal: d.teganganNominal || null,
      detailLangkah: d.detailLangkah || d.langkahPekerjaan || "-",
      hasilTahananIsolasi: d.hasilTahananIsolasi || null,
      hasilPengukuranBeban: d.hasilPengukuranBeban || null,
      catatanHasil: d.catatanHasil || d.hasilPekerjaan || "-",
      statusPekerjaan: d.statusPekerjaan || "SELESAI",
      durasiPekerjaan: d.durasiPekerjaan || null,
      catatanTambahan: d.catatanTambahan || null,
      status: d.status || "DRAFT",
      createdById: userId,
      submittedAt: d.status === 'PENDING' ? new Date() : null,
      // Operational SCADA fields
      gardu: d.gardu || null,
      jenisPekerjaan: d.jenisPekerjaan || null,
      asdu: d.asdu || null,
      ipModem: d.ipModem || null,
      ipRTU: d.ipRTU || null,
      ipSIM1: d.ipSIM1 || null,
      ipSIM2: d.ipSIM2 || null,
      ipGTWIconPlus: d.ipGTWIconPlus || null,
      ipWAN: d.ipWAN || null,
      rtuNama: d.rtuNama || null,
      rtuType: d.rtuType || null,
      mediaNama: d.mediaNama || null,
      mediaType: d.mediaType || null,
      rectifierNama: d.rectifierNama || null,
      rectifierType: d.rectifierType || null,
      bateraiNama: d.bateraiNama || null,
      bateraiType: d.bateraiType || null,
      catatanRTU: d.catatanRTU || null,
      catatanMedia: d.catatanMedia || null,
      catatanRectifier: d.catatanRectifier || null,
      catatanBaterai: d.catatanBaterai || null,
      catatanLain: d.catatanLain || null,
      statusSebelum: d.statusSebelum || null,
      statusSesudah: d.statusSesudah || null,
      pengawas: d.pengawas || null,
      pelaksana: d.pelaksana || null,
      // Work Order link + hasil uji remote checklist (RC/LR/ES/CB) + analisis
      workOrderId: d.workOrderId || null,
      hasilRC: d.hasilRC || null,
      hasilLR: d.hasilLR || null,
      hasilES: d.hasilES || null,
      statusCB: d.statusCB || null,
      penyebab: d.penyebab || null,
      tindakan: d.tindakan || null,
      rekomendasi: d.rekomendasi || null,
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
      action: (data.status as any) === 'PENDING' ? 'SUBMIT' : 'CREATE',
      entityType: 'LAPORAN_AKHIR',
      entityId: created.id,
      laporanAkhirId: created.id,
      details: { reportId: created.reportId },
    },
    tx
  );

    return created;
  });

  // Mirror to the linked Work Order: submitted → WAITING_APPROVAL, else ON_PROGRESS.
  await syncWorkOrderStatus(
    laporan.workOrderId,
    laporan.status === 'PENDING' ? 'WAITING_APPROVAL' : 'ON_PROGRESS',
    laporan.status === 'PENDING' ? { submittedAt: new Date() } : {}
  );

  return laporan;
};

// Get all Laporan Akhir
export const getAllLaporanAkhir = async (
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
  
  const where: any = {};
  
  if (userRole === 'PETUGAS') {
    where.createdById = userId;
  }
  
  if (status) {
    where.status = status;
  }
  
  if (startDate || endDate) {
    where.tanggalSelesai = {};
    if (startDate) where.tanggalSelesai.gte = new Date(startDate);
    if (endDate) where.tanggalSelesai.lte = new Date(endDate);
  }
  
  if (search) {
    where.OR = [
      { reportId: { contains: search, mode: 'insensitive' as const } },
      { jenisPekerjaan: { contains: search, mode: 'insensitive' as const } },
      { gardu: { contains: search, mode: 'insensitive' as const } },
      { up3: { contains: search, mode: 'insensitive' as const } },
      // Legacy fields for backward compatibility
      { pekerjaan: { contains: search, mode: 'insensitive' as const } },
      { namaAset: { contains: search, mode: 'insensitive' as const } },
      { nomorSPJ: { contains: search, mode: 'insensitive' as const } },
    ];
  }

  const skip = (page - 1) * limit;

  const [data, total] = await Promise.all([
    prisma.laporanAkhir.findMany({
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
    prisma.laporanAkhir.count({ where }),
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

// Get Laporan Akhir by ID
export const getLaporanAkhirById = async (
  id: string,
  userId: string,
  userRole: string
) => {
  const laporan = await prisma.laporanAkhir.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          rtuppId: true,
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

// Update Laporan Akhir
export const updateLaporanAkhir = async (
  id: string,
  data: UpdateLaporanAkhirInput,
  userId: string,
  userRole: string
) => {
  const existing = await prisma.laporanAkhir.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Laporan not found');
  }

  if (userRole === 'PETUGAS' && existing.createdById !== userId) {
    throw new Error('Access denied');
  }

  // BUG-03: a PETUGAS may only edit their own report while it is in an editable
  // state (DRAFT, REJECTED, REVISED). PENDING (awaiting validation) and APPROVED
  // reports are locked.
  if (userRole === 'PETUGAS' && !isPetugasEditable(existing.status)) {
    throw new Error('Report is locked');
  }

  // Admins still cannot edit an APPROVED report unless SUPERADMIN.
  if (existing.status === 'APPROVED' && !isMaster(userRole)) {
    throw new Error('Cannot edit approved report');
  }

  // Explicit column mapping (mirror create flow) so non-column input fields
  // (rtupp, langkahPekerjaan, hasilPekerjaan) never reach the Prisma update.
  // undefined values are ignored by Prisma, preserving existing data.
  const updateData: any = {
    laporanAwalId: data.laporanAwalId,
    nomorSPJ: data.nomorSPJ,
    tanggalSelesai: data.tanggalSelesai ? new Date(data.tanggalSelesai) : undefined,
    up3: data.up3,
    pekerjaan: data.pekerjaan ?? data.jenisPekerjaan,
    namaAset: data.namaAset ?? data.rtuNama,
    tagSCADA: data.tagSCADA,
    bayPosisi: data.bayPosisi,
    teganganNominal: data.teganganNominal,
    detailLangkah: data.detailLangkah ?? data.langkahPekerjaan,
    hasilTahananIsolasi: data.hasilTahananIsolasi,
    hasilPengukuranBeban: data.hasilPengukuranBeban,
    catatanHasil: data.catatanHasil ?? data.hasilPekerjaan,
    statusPekerjaan: data.statusPekerjaan as any,
    durasiPekerjaan: data.durasiPekerjaan,
    catatanTambahan: data.catatanTambahan,
    gardu: data.gardu,
    jenisPekerjaan: data.jenisPekerjaan,
    asdu: data.asdu,
    ipModem: data.ipModem,
    ipRTU: data.ipRTU,
    ipSIM1: data.ipSIM1,
    ipSIM2: data.ipSIM2,
    ipGTWIconPlus: data.ipGTWIconPlus,
    ipWAN: data.ipWAN,
    rtuNama: data.rtuNama,
    rtuType: data.rtuType,
    mediaNama: data.mediaNama,
    mediaType: data.mediaType,
    rectifierNama: data.rectifierNama,
    rectifierType: data.rectifierType,
    bateraiNama: data.bateraiNama,
    bateraiType: data.bateraiType,
    catatanRTU: data.catatanRTU as any,
    catatanMedia: data.catatanMedia as any,
    catatanRectifier: data.catatanRectifier as any,
    catatanBaterai: data.catatanBaterai as any,
    catatanLain: data.catatanLain,
    statusSebelum: data.statusSebelum as any,
    statusSesudah: data.statusSesudah as any,
    pengawas: data.pengawas,
    pelaksana: data.pelaksana,
    // Work Order link + hasil uji remote checklist + analisis (undefined ignored)
    workOrderId: (data as any).workOrderId,
    hasilRC: (data as any).hasilRC,
    hasilLR: (data as any).hasilLR,
    hasilES: (data as any).hasilES,
    statusCB: (data as any).statusCB,
    penyebab: (data as any).penyebab,
    tindakan: (data as any).tindakan,
    rekomendasi: (data as any).rekomendasi,
    // BUG-01: status is intentionally NOT copied from the request payload.
    // Status transitions only happen through the validate endpoint, with the
    // single exception of the DRAFT -> PENDING submit handled below.
  };

  // BUG-01: the only status transition allowed through update is the
  // DRAFT -> PENDING submit. Any other requested status is ignored.
  const isSubmit = existing.status === 'DRAFT' && (data.status as any) === 'PENDING';
  if (isSubmit) {
    updateData.status = 'PENDING';
    updateData.submittedAt = new Date();
  }

  const laporan = await prisma.$transaction(async (tx) => {
    const updated = await tx.laporanAkhir.update({
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
        entityType: 'LAPORAN_AKHIR',
        entityId: updated.id,
        laporanAkhirId: updated.id,
        details: { reportId: updated.reportId },
      },
      tx
    );

    return updated;
  });

  if (isSubmit) {
    await syncWorkOrderStatus(laporan.workOrderId, 'WAITING_APPROVAL', { submittedAt: new Date() });
  }

  return laporan;
};

// Delete Laporan Akhir
export const deleteLaporanAkhir = async (
  id: string,
  userId: string,
  userRole: string
) => {
  const existing = await prisma.laporanAkhir.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new Error('Laporan not found');
  }

  if (userRole === 'PETUGAS' && existing.createdById !== userId) {
    throw new Error('Access denied');
  }

  // BUG-03: a PETUGAS may only delete their own report while it is in an editable
  // state (DRAFT, REJECTED, REVISED). PENDING and APPROVED reports are locked.
  if (userRole === 'PETUGAS' && !isPetugasEditable(existing.status)) {
    throw new Error('Report is locked');
  }

  // Admins still cannot delete an APPROVED report unless SUPERADMIN.
  if (existing.status === 'APPROVED' && !isMaster(userRole)) {
    throw new Error('Cannot delete approved report');
  }

  await prisma.$transaction(async (tx) => {
    await tx.laporanAkhir.delete({
      where: { id },
    });

    await recordAudit(
      {
        userId,
        action: 'DELETE',
        entityType: 'LAPORAN_AKHIR',
        entityId: id,
        details: { reportId: existing.reportId },
      },
      tx
    );
  });

  return { message: 'Laporan deleted successfully' };
};

// Validate Laporan Akhir
export const validateLaporanAkhir = async (
  id: string,
  status: 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED',
  notes: string | undefined,
  validatorId: string,
  validatorRole: string
) => {
  const laporan = await prisma.laporanAkhir.findUnique({
    where: { id },
    include: { createdBy: { select: { rtuppId: true } } },
  });

  if (!laporan) {
    throw new Error('Laporan not found');
  }

  // Per-RTUPP approval: ADMIN may only validate reports from their own RTUPP;
  // MASTER (global) may validate any. (PETUGAS/MANAGER are blocked at the route.)
  await assertReportRtuppAccess(validatorId, validatorRole, laporan.createdBy?.rtuppId);

  if (laporan.status !== 'PENDING' && laporan.status !== 'DRAFT') {
    throw new Error('Can only validate pending reports');
  }

  // Map validation action to the canonical stored report status.
  const reportStatus = validationActionToStatus(status);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.laporanAkhir.update({
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
        laporanAkhirId: id,
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
        entityType: 'LAPORAN_AKHIR',
        entityId: id,
        laporanAkhirId: id,
        details: { status, notes },
      },
      tx
    );

    return result;
  });

  // Mirror approval/rejection to the linked Work Order (Laporan Akhir is the
  // approval driver of the WO lifecycle). APPROVED → WO APPROVED; REJECTED → WO
  // REJECTED. ADMIN still explicitly CLOSEs the WO afterwards.
  if (status === 'APPROVED') {
    await syncWorkOrderStatus(updated.workOrderId, 'APPROVED', {
      approvedAt: new Date(),
      approvedBy: { connect: { id: validatorId } },
    });
  } else if (status === 'REJECTED') {
    await syncWorkOrderStatus(updated.workOrderId, 'REJECTED', {
      rejectedAt: new Date(),
      revisionNote: notes ?? null,
      rejectedBy: { connect: { id: validatorId } },
    });
  }

  // Notify the report owner of the validation outcome (best-effort, async).
  void sendToUser(laporan.createdById, {
    title:
      status === 'APPROVED'
        ? 'Laporan Akhir disetujui'
        : status === 'REVISION_REQUESTED'
        ? 'Laporan Akhir perlu revisi'
        : 'Laporan Akhir ditolak',
    body: `${laporan.reportId}${notes ? `: ${notes}` : ''}`,
    data: { type: 'laporan-akhir', id, status },
  });

  return updated;
};
