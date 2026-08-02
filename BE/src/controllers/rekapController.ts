import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import prisma from '../config/database';
import ExcelJS from 'exceljs';
import { successResponse, errorResponse } from '../utils/response';
import { z } from 'zod';
import { hasGlobalScope, isMaster } from '../auth/roles';

// ─── Rekap Awal — detailed spreadsheet view of LaporanAwal ─────────────────────
// Mirrors the Rekap Akhir grid (summary cards, column toggle, templated export)
// but sourced entirely from Laporan Awal data.

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
  reportId:      'reportId',
  nomorSPJ:      'nomorSPJ',
  tanggal:       'tanggal',
  tanggalDibuat: 'createdAt',
  submittedAt:   'submittedAt',
  approvedAt:    'approvedAt',
  up3:           'up3',
  status:        'status',
};

// ─── Column map ───────────────────────────────────────────────────────────────

type ColDef = { header: string; get: (row: any) => any };

const yn = (b: boolean | null | undefined) => (b == null ? '-' : b ? 'Ya' : 'Tidak');
const d = (v: Date | null | undefined) => v?.toISOString().split('T')[0] ?? '-';

const COLUMN_MAP: Record<string, ColDef> = {
  // Identitas
  reportId:                { header: 'Report ID',          get: r => r.reportId ?? '-' },
  nomorSPJ:                { header: 'Nomor SPJ',          get: r => r.nomorSPJ ?? '-' },
  nomorWP:                 { header: 'Nomor WP',           get: r => r.nomorWP ?? '-' },
  hari:                    { header: 'Hari',               get: r => r.hari ?? '-' },
  tanggal:                 { header: 'Tanggal',            get: r => d(r.tanggal) },
  // Lokasi & organisasi
  petugas:                 { header: 'Petugas',            get: r => r.createdBy?.name ?? '-' },
  rtuppNama:               { header: 'RTUPP',              get: r => r.createdBy?.rtupp?.name ?? '-' },
  rtuppKode:               { header: 'Kode RTUPP',         get: r => r.createdBy?.rtupp?.code ?? '-' },
  teamNama:                { header: 'Team',               get: r => r.createdBy?.team?.name ?? '-' },
  up3:                     { header: 'UP3',                get: r => r.up3 ?? '-' },
  lokasiGardu:             { header: 'Lokasi Gardu',       get: r => r.lokasiGardu ?? '-' },
  pekerjaan:               { header: 'Pekerjaan',          get: r => r.pekerjaan ?? '-' },
  // Tim kerja
  pelaksana:               { header: 'Pelaksana',          get: r => r.pelaksana ?? '-' },
  penanggungJawab:         { header: 'Penanggung Jawab',   get: r => r.penanggungJawab ?? '-' },
  pengawasPekerjaan:       { header: 'Pengawas Pekerjaan', get: r => r.pengawasPekerjaan ?? '-' },
  pengawasManuver:         { header: 'Pengawas Manuver',   get: r => r.pengawasManuver ?? '-' },
  pengawasK3:              { header: 'Pengawas K3',        get: r => r.pengawasK3 ?? '-' },
  jumlahPersonil:          { header: 'Jumlah Personil',    get: r => r.jumlahPersonil ?? 0 },
  // K3 / Keselamatan
  potensiBahaya:           { header: 'Potensi Bahaya',     get: r => r.potensiBahaya ?? '-' },
  pengendalianRisiko:      { header: 'Pengendalian Risiko',get: r => r.pengendalianRisiko ?? '-' },
  apd:                     { header: 'APD',                get: r => r.apd ?? '-' },
  rambuKerja:              { header: 'Rambu Kerja',        get: r => r.rambuKerja ?? '-' },
  asuransiTK:              { header: 'Asuransi TK',        get: r => r.asuransiTK ?? '-' },
  kondisiPersonil:         { header: 'Kondisi Personil',   get: r => r.kondisiPersonil ?? '-' },
  apdLengkap:              { header: 'APD Lengkap',        get: r => yn(r.apdLengkap) },
  potensiBahayaDijelaskan: { header: 'Bahaya Dijelaskan',  get: r => yn(r.potensiBahayaDijelaskan) },
  asuransiKetenagakerjaan: { header: 'Asuransi K.',        get: r => yn(r.asuransiKetenagakerjaan) },
  berdoaSebelumBekerja:    { header: 'Berdoa',             get: r => yn(r.berdoaSebelumBekerja) },
  wpJsahirarcSop:          { header: 'WP/JSA/SOP',         get: r => yn(r.wpJsahirarcSop) },
  // Status
  status:                  { header: 'Status Validasi',    get: r => r.status ?? '-' },
  // Audit
  tanggalDibuat:           { header: 'Tgl Dibuat',         get: r => d(r.createdAt) },
  submittedAt:             { header: 'Tgl Submit',         get: r => d(r.submittedAt) },
  approvedAt:              { header: 'Tgl Approve',        get: r => d(r.approvedAt) },
  rejectedAt:              { header: 'Tgl Ditolak',        get: r => d(r.rejectedAt) },
  approvedBy:              { header: 'Disetujui Oleh',     get: r => r.approvedBy?.name ?? '-' },
  rejectedBy:              { header: 'Ditolak Oleh',       get: r => r.rejectedBy?.name ?? '-' },
  jumlahLampiran:          { header: 'Lampiran',           get: r => r._count?.attachments ?? 0 },
};

const DEFAULT_COLUMNS = [
  'reportId', 'nomorSPJ', 'tanggal',
  'rtuppNama', 'teamNama', 'petugas',
  'up3', 'lokasiGardu', 'pekerjaan',
  'pelaksana', 'penanggungJawab',
  'pengawasPekerjaan', 'pengawasManuver', 'pengawasK3', 'jumlahPersonil',
  'potensiBahaya', 'pengendalianRisiko', 'apd', 'rambuKerja', 'asuransiTK',
  'kondisiPersonil', 'apdLengkap', 'approvedBy', 'approvedAt', 'jumlahLampiran', 'status',
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

  if (status) where.status = status;

  if (startDate || endDate) {
    where.tanggal = {};
    if (startDate) where.tanggal.gte = new Date(startDate);
    if (endDate)   where.tanggal.lte = new Date(`${endDate}T23:59:59`);
  }

  if (search) {
    where.OR = [
      { reportId:    { contains: search, mode: 'insensitive' as const } },
      { nomorSPJ:    { contains: search, mode: 'insensitive' as const } },
      { lokasiGardu: { contains: search, mode: 'insensitive' as const } },
      { pekerjaan:   { contains: search, mode: 'insensitive' as const } },
      { up3:         { contains: search, mode: 'insensitive' as const } },
    ];
  }

  return where;
}

// ─── GET /api/rekap ───────────────────────────────────────────────────────────

export const getRekap = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const userRole = req.user?.role;
    if (!userId || !userRole) { errorResponse(res, 'User not authenticated', 401); return; }

    const qv = querySchema.safeParse(req.query);
    if (!qv.success) { errorResponse(res, 'Invalid query parameters', 400); return; }

    const { status, search, petugas, page, limit, startDate, endDate, rtuppId, orderByField, orderDir } = qv.data;

    const filterRtuppId = await resolveRtuppId(userId, userRole, rtuppId);

    const sortField = SORTABLE_FIELDS[orderByField ?? ''] ?? 'tanggal';
    const sortDir   = orderDir ?? 'desc';

    const where           = buildWhere(filterRtuppId, status, search, startDate, endDate, petugas);
    // Summary scoped to RTUPP only (ignores filters) → absolute counts for context.
    const whereForSummary = buildWhere(filterRtuppId);
    const skip            = (page - 1) * limit;

    const now          = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [data, total, statusCounts, approvedToday, approvedThisMonth] = await Promise.all([
      prisma.laporanAwal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortDir },
        include: INCLUDE,
      }),
      prisma.laporanAwal.count({ where }),
      prisma.laporanAwal.groupBy({
        by: ['status'],
        where: whereForSummary,
        _count: { _all: true },
      }),
      prisma.laporanAwal.count({
        where: { ...whereForSummary, status: 'APPROVED', approvedAt: { gte: startOfToday } },
      }),
      prisma.laporanAwal.count({
        where: { ...whereForSummary, status: 'APPROVED', approvedAt: { gte: startOfMonth } },
      }),
    ]);

    const summary = {
      total:            statusCounts.reduce((acc, s) => acc + s._count._all, 0),
      approved:         statusCounts.find(s => s.status === 'APPROVED')?._count._all ?? 0,
      pending:          statusCounts.find(s => s.status === 'PENDING')?._count._all  ?? 0,
      rejected:         statusCounts.find(s => s.status === 'REJECTED')?._count._all ?? 0,
      draft:            statusCounts.find(s => s.status === 'DRAFT')?._count._all    ?? 0,
      approvedToday,
      approvedThisMonth,
    };

    successResponse(res, {
      items: data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      summary,
    }, 'Rekap Awal retrieved successfully');
  } catch (error) {
    console.error('Get rekap awal error:', error);
    errorResponse(res, 'Failed to retrieve rekap', 500);
  }
};

// ─── GET /api/rekap/export ────────────────────────────────────────────────────

export const exportRekapXlsx = async (req: AuthRequest, res: Response): Promise<void> => {
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

    const data = await prisma.laporanAwal.findMany({
      where,
      orderBy: { tanggal: 'desc' },
      include: INCLUDE,
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VoltHub';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Rekap Laporan Awal');

    const headers = ['No', ...requestedCols.map(k => COLUMN_MAP[k].header)];
    const headerRow = sheet.addRow(headers);
    headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    sheet.getRow(1).height = 28;

    data.forEach((row, idx) => {
      const values = [idx + 1, ...requestedCols.map(k => COLUMN_MAP[k].get(row))];
      const dataRow = sheet.addRow(values);
      if (idx % 2 === 1) {
        dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } };
      }
    });

    sheet.getColumn(1).width = 5;
    requestedCols.forEach((key, i) => {
      const col = sheet.getColumn(i + 2);
      const w = ['potensiBahaya', 'pengendalianRisiko', 'pekerjaan'].includes(key) ? 28
              : key.startsWith('pengawas') || key === 'penanggungJawab' || key === 'lokasiGardu' ? 22
              : 18;
      col.width = w;
    });

    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Rekap_LapAwal_${ts}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();

    await prisma.activityLog.create({
      data: {
        userId,
        action: 'EXPORT',
        entityType: 'LAPORAN_AWAL',
        details: JSON.stringify({ exportType: 'REKAP_AWAL_XLSX', columns: requestedCols }),
      },
    });
  } catch (error) {
    console.error('Export rekap awal error:', error);
    errorResponse(res, 'Failed to export rekap', 500);
  }
};
