import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import prisma from '../config/database';
import ExcelJS from 'exceljs';
import { successResponse, errorResponse } from '../utils/response';
import { z } from 'zod';
import { hasGlobalScope, isMaster } from '../auth/roles';

// ─── Query schema ─────────────────────────────────────────────────────────────

const querySchema = z.object({
  status:       z.string().optional(),
  search:       z.string().optional(),
  petugas:      z.string().optional(),
  page:         z.string().regex(/^\d+$/).transform(Number).optional().default('1'),
  limit:        z.string().regex(/^\d+$/).transform(Number).optional().default('20'),
  startDate:    z.string().optional(),
  endDate:      z.string().optional(),
  rtuppId:      z.string().uuid().optional(),
  orderByField: z.string().optional(),
  orderDir:     z.enum(['asc', 'desc']).optional(),
});

// ─── Sortable fields ──────────────────────────────────────────────────────────

const SORTABLE_FIELDS: Record<string, string> = {
  reportId:       'reportId',
  nomorSPJ:       'nomorSPJ',
  tanggalSelesai: 'tanggalSelesai',
  tanggalDibuat:  'createdAt',
  submittedAt:    'submittedAt',
  approvedAt:     'approvedAt',
  up3:            'up3',
  gardu:          'gardu',
  status:         'status',
};

// ─── Column map ───────────────────────────────────────────────────────────────

type ColDef = { header: string; get: (row: any) => any };

const COLUMN_MAP: Record<string, ColDef> = {
  // Identitas
  reportId:            { header: 'Report ID',          get: r => r.reportId ?? '-' },
  laporanAwalId:       { header: 'ID Lap. Awal',       get: r => r.laporan_awal?.reportId ?? r.laporanAwalId ?? '-' },
  nomorSPJ:            { header: 'Nomor SPJ',           get: r => r.nomorSPJ ?? '-' },
  tanggalSelesai:      { header: 'Tgl Selesai',         get: r => r.tanggalSelesai?.toISOString().split('T')[0] ?? '-' },
  tanggalDibuat:       { header: 'Tgl Dibuat',          get: r => r.createdAt?.toISOString().split('T')[0] ?? '-' },
  submittedAt:         { header: 'Tgl Submit',          get: r => r.submittedAt?.toISOString().split('T')[0] ?? '-' },
  approvedAt:          { header: 'Tgl Approve',         get: r => r.approvedAt?.toISOString().split('T')[0] ?? '-' },
  // Petugas
  petugas:             { header: 'Petugas',             get: r => r.createdBy?.name ?? '-' },
  rtuppNama:           { header: 'RTUPP',               get: r => r.createdBy?.rtupp?.name ?? '-' },
  rtuppKode:           { header: 'Kode RTUPP',          get: r => r.createdBy?.rtupp?.code ?? '-' },
  teamNama:            { header: 'Team',                get: r => r.createdBy?.team?.name ?? '-' },
  approvedBy:          { header: 'Disetujui Oleh',      get: r => r.approvedBy?.name ?? '-' },
  rejectedBy:          { header: 'Ditolak Oleh',        get: r => r.rejectedBy?.name ?? '-' },
  // Lokasi & Pekerjaan
  up3:                 { header: 'UP3',                 get: r => r.up3 ?? '-' },
  gardu:               { header: 'Gardu',               get: r => r.gardu ?? r.namaAset ?? '-' },
  jenisPekerjaan:      { header: 'Jenis Pekerjaan',     get: r => r.jenisPekerjaan ?? r.pekerjaan ?? '-' },
  bayPosisi:           { header: 'Bay / Posisi',        get: r => r.bayPosisi ?? '-' },
  // Aset SCADA
  rtu:                 { header: 'RTU',                 get: r => [r.rtuNama, r.rtuType].filter(Boolean).join(' / ') || (r.namaAset ?? '-') },
  media:               { header: 'Media',               get: r => [r.mediaNama, r.mediaType].filter(Boolean).join(' / ') || '-' },
  rectifier:           { header: 'Rectifier',           get: r => [r.rectifierNama, r.rectifierType].filter(Boolean).join(' / ') || '-' },
  baterai:             { header: 'Baterai',             get: r => [r.bateraiNama, r.bateraiType].filter(Boolean).join(' / ') || '-' },
  tagSCADA:            { header: 'Tag SCADA',           get: r => r.tagSCADA ?? '-' },
  teganganNominal:     { header: 'Teg. Nominal',        get: r => r.teganganNominal ?? '-' },
  // Jaringan
  asdu:                { header: 'ASDU',                get: r => r.asdu ?? '-' },
  ipModem:             { header: 'IP Modem',            get: r => r.ipModem ?? '-' },
  ipRTU:               { header: 'IP RTU',              get: r => r.ipRTU ?? '-' },
  ipSIM1:              { header: 'IP SIM 1',            get: r => r.ipSIM1 ?? '-' },
  ipSIM2:              { header: 'IP SIM 2',            get: r => r.ipSIM2 ?? '-' },
  ipGTWIconPlus:       { header: 'IP GTW ICON+',        get: r => r.ipGTWIconPlus ?? '-' },
  ipWAN:               { header: 'IP WAN',              get: r => r.ipWAN ?? '-' },
  // Catatan Perangkat
  catatanRTU:          { header: 'Cat. RTU',            get: r => r.catatanRTU ?? '-' },
  catatanMedia:        { header: 'Cat. Media',          get: r => r.catatanMedia ?? '-' },
  catatanRectifier:    { header: 'Cat. Rectifier',      get: r => r.catatanRectifier ?? '-' },
  catatanBaterai:      { header: 'Cat. Baterai',        get: r => r.catatanBaterai ?? '-' },
  catatanLain:         { header: 'Cat. Lain',           get: r => r.catatanLain ?? '-' },
  catatanTambahan:     { header: 'Cat. Tambahan',       get: r => r.catatanTambahan ?? '-' },
  // Status Gardu
  statusSebelum:       { header: 'Status Sebelum',      get: r => r.statusSebelum ?? '-' },
  statusSesudah:       { header: 'Status Sesudah',      get: r => r.statusSesudah ?? '-' },
  statusPekerjaan:     { header: 'Status Pekerjaan',    get: r => r.statusPekerjaan ?? '-' },
  // Hasil & Penutup
  detailLangkah:       { header: 'Langkah Pekerjaan',   get: r => r.detailLangkah ?? '-' },
  hasilPekerjaan:      { header: 'Hasil Pekerjaan',     get: r => r.catatanHasil ?? '-' },
  hasilTahananIsolasi: { header: 'Thn. Isolasi',        get: r => r.hasilTahananIsolasi ?? '-' },
  hasilPengukuranBeban:{ header: 'Ukur. Beban',         get: r => r.hasilPengukuranBeban ?? '-' },
  durasiPekerjaan:     { header: 'Durasi',              get: r => r.durasiPekerjaan ?? '-' },
  pengawas:            { header: 'Pengawas',            get: r => r.pengawas ?? '-' },
  pelaksana:           { header: 'Pelaksana',           get: r => r.pelaksana ?? '-' },
  // Audit
  jumlahLampiran:      { header: 'Lampiran',            get: r => r._count?.attachments ?? 0 },
  status:              { header: 'Status Validasi',     get: r => r.status ?? '-' },
  rejectedAt:          { header: 'Tgl Ditolak',         get: r => r.rejectedAt?.toISOString().split('T')[0] ?? '-' },
};

const DEFAULT_COLUMNS = [
  'reportId', 'nomorSPJ', 'tanggalSelesai', 'tanggalDibuat',
  'rtuppNama', 'rtuppKode', 'teamNama', 'petugas',
  'up3', 'gardu', 'jenisPekerjaan',
  'rtu', 'media', 'rectifier', 'baterai',
  'asdu', 'ipModem', 'ipRTU', 'ipSIM1', 'ipSIM2', 'ipGTWIconPlus', 'ipWAN',
  'catatanRTU', 'catatanMedia', 'catatanRectifier', 'catatanBaterai', 'catatanLain',
  'statusSebelum', 'statusSesudah', 'statusPekerjaan',
  'detailLangkah', 'hasilPekerjaan', 'hasilTahananIsolasi', 'hasilPengukuranBeban', 'durasiPekerjaan',
  'pengawas', 'pelaksana',
  'approvedBy', 'approvedAt', 'jumlahLampiran', 'status',
];

// ─── DB includes ──────────────────────────────────────────────────────────────

const INCLUDE = {
  createdBy: {
    select: {
      id: true, name: true, email: true,
      rtupp: { select: { id: true, name: true, code: true } },
      team: { select: { id: true, name: true, code: true } },
    },
  },
  approvedBy: { select: { id: true, name: true } },
  rejectedBy: { select: { id: true, name: true } },
  laporan_awal: { select: { reportId: true } },
  _count: { select: { attachments: true } },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveRtuppId(userId: string, userRole: string, paramRtuppId?: string) {
  // MASTER: global scope; an explicit rtupp param narrows the view.
  if (isMaster(userRole)) return paramRtuppId ?? null;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { rtuppId: true } });
  const ownRtuppId = user?.rtuppId ?? null;
  // ADMIN / Manager UP3 (rtuppId null) → global; explicit rtupp param narrows the view.
  if (hasGlobalScope(userRole, ownRtuppId)) return paramRtuppId ?? null;
  // ASMEN (MANAGER + rtuppId) → pinned to their own RTUPP.
  return ownRtuppId;
}

function buildWhere(
  rtuppId: string | null,
  status?: string,
  search?: string,
  startDate?: string,
  endDate?: string,
  petugas?: string,
) {
  const where: any = {};

  if (rtuppId || petugas) {
    where.createdBy = {};
    if (rtuppId) where.createdBy.rtuppId = rtuppId;
    if (petugas) where.createdBy.name = { contains: petugas, mode: 'insensitive' as const };
  }

  if (status)  where.status = status;

  if (startDate || endDate) {
    where.tanggalSelesai = {};
    if (startDate) where.tanggalSelesai.gte = new Date(startDate);
    if (endDate)   where.tanggalSelesai.lte = new Date(`${endDate}T23:59:59`);
  }

  if (search) {
    where.OR = [
      { reportId:       { contains: search, mode: 'insensitive' as const } },
      { nomorSPJ:       { contains: search, mode: 'insensitive' as const } },
      { gardu:          { contains: search, mode: 'insensitive' as const } },
      { jenisPekerjaan: { contains: search, mode: 'insensitive' as const } },
      { pekerjaan:      { contains: search, mode: 'insensitive' as const } },
      { up3:            { contains: search, mode: 'insensitive' as const } },
      { namaAset:       { contains: search, mode: 'insensitive' as const } },
    ];
  }

  return where;
}

// ─── GET /api/rekap-akhir ─────────────────────────────────────────────────────

export const getRekap = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    if (!userId || !userRole) { errorResponse(res, 'User not authenticated', 401); return; }

    const qv = querySchema.safeParse(req.query);
    if (!qv.success) { errorResponse(res, 'Invalid query parameters', 400); return; }

    const { status, search, petugas, page, limit, startDate, endDate, rtuppId, orderByField, orderDir } = qv.data;

    const filterRtuppId = await resolveRtuppId(userId, userRole, rtuppId);

    const sortField = SORTABLE_FIELDS[orderByField ?? ''] ?? 'tanggalSelesai';
    const sortDir   = orderDir ?? 'desc';

    const where            = buildWhere(filterRtuppId, status, search, startDate, endDate, petugas);
    // Summary always scoped to RTUPP only, ignoring filters — shows absolute counts for context
    const whereForSummary  = buildWhere(filterRtuppId);
    const skip             = (page - 1) * limit;

    // Insight ringan: approved hari ini / bulan ini (scope RTUPP, by approvedAt)
    const now          = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [data, total, statusCounts, approvedToday, approvedThisMonth] = await Promise.all([
      prisma.laporanAkhir.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortDir },
        include: INCLUDE,
      }),
      prisma.laporanAkhir.count({ where }),
      prisma.laporanAkhir.groupBy({
        by: ['status'],
        where: whereForSummary,
        _count: { _all: true },
      }),
      prisma.laporanAkhir.count({
        where: { ...whereForSummary, status: 'APPROVED', approvedAt: { gte: startOfToday } },
      }),
      prisma.laporanAkhir.count({
        where: { ...whereForSummary, status: 'APPROVED', approvedAt: { gte: startOfMonth } },
      }),
    ]);

    const summary = {
      total:            statusCounts.reduce((acc, s) => acc + s._count._all, 0),
      approved:         statusCounts.find(s => s.status === 'APPROVED')?._count._all  ?? 0,
      pending:          statusCounts.find(s => s.status === 'PENDING')?._count._all   ?? 0,
      rejected:         statusCounts.find(s => s.status === 'REJECTED')?._count._all  ?? 0,
      draft:            statusCounts.find(s => s.status === 'DRAFT')?._count._all     ?? 0,
      approvedToday,
      approvedThisMonth,
    };

    successResponse(res, {
      items: data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary,
    }, 'Rekap Akhir retrieved successfully');
  } catch (error) {
    console.error('Get rekap akhir error:', error);
    errorResponse(res, 'Failed to retrieve rekap', 500);
  }
};

// ─── GET /api/rekap-akhir/export ─────────────────────────────────────────────

export const exportRekap = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    if (!userId || !userRole) { errorResponse(res, 'User not authenticated', 401); return; }

    const { status, search, petugas, startDate, endDate, rtuppId, columns } = req.query;

    const filterRtuppId = await resolveRtuppId(userId, userRole, rtuppId as string | undefined);

    const requestedCols: string[] = columns
      ? (columns as string).split(',').map(c => c.trim()).filter(c => c in COLUMN_MAP)
      : DEFAULT_COLUMNS;

    const where = buildWhere(
      filterRtuppId,
      status as string | undefined,
      search as string | undefined,
      startDate as string | undefined,
      endDate as string | undefined,
      petugas as string | undefined,
    );

    const data = await prisma.laporanAkhir.findMany({
      where,
      orderBy: { tanggalSelesai: 'desc' },
      include: INCLUDE,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VoltHub';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Rekap Laporan Akhir');

    // Header
    const headers = ['No', ...requestedCols.map(k => COLUMN_MAP[k].header)];
    const headerRow = sheet.addRow(headers);
    headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    sheet.getRow(1).height = 28;

    // Data rows
    data.forEach((row, idx) => {
      const values = [idx + 1, ...requestedCols.map(k => COLUMN_MAP[k].get(row))];
      const dataRow = sheet.addRow(values);
      if (idx % 2 === 1) {
        dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } };
      }
    });

    // Column widths
    sheet.getColumn(1).width = 5;
    requestedCols.forEach((key, i) => {
      const col = sheet.getColumn(i + 2);
      const w = key.startsWith('ip') || key === 'asdu' ? 14
              : ['catatanRTU','catatanMedia','catatanRectifier','catatanBaterai','statusSebelum','statusSesudah','statusPekerjaan'].includes(key) ? 14
              : key.includes('hasil') || key.includes('catatan') || key === 'jenisPekerjaan' ? 26
              : 18;
      col.width = w;
    });

    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Rekap_LapAkhir_${ts}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();

    await prisma.activityLog.create({
      data: {
        userId,
        action: 'EXPORT',
        entityType: 'LAPORAN_AKHIR',
        details: JSON.stringify({ exportType: 'REKAP_AKHIR_XLSX', columns: requestedCols }),
      },
    });
  } catch (error) {
    console.error('Export rekap akhir error:', error);
    errorResponse(res, 'Failed to export rekap', 500);
  }
};
