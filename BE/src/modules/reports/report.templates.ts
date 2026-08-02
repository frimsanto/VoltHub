/**
 * Report templates — the heart of template-based generation.
 *
 * Every source entity (Laporan Awal/Akhir, Inspection, HAR) is normalised into a
 * single, format-agnostic `ReportModel`. The PDF and Excel renderers consume that
 * model only, so adding a format never touches a source and adding a source never
 * touches a renderer. The model is intentionally row-oriented (`sections[].rows`)
 * so unbounded child collections (findings, HAR details) stream cleanly into both
 * a paginated PDF and a streamed Excel worksheet — see report.pdf.ts / report.excel.ts.
 */

export const SOURCE_TYPES = ['LAPORAN_AWAL', 'LAPORAN_AKHIR', 'INSPECTION', 'HAR'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const REPORT_FORMATS = ['PDF', 'EXCEL'] as const;
export type ReportFormat = (typeof REPORT_FORMATS)[number];

export interface ReportSection {
  heading: string;
  columns: string[];
  /** Row cells, already stringified. May be large — renderers stream these. */
  rows: string[][];
  /** Optional per-column width hint (Excel chars). Falls back to auto. */
  widths?: number[];
}

export interface ReportModel {
  sourceType: SourceType;
  /** Human title, e.g. "LAPORAN INSPEKSI". */
  title: string;
  /** Report-number prefix, e.g. "INSP". */
  numberPrefix: string;
  /** FK to a V2 location when the source has one (Inspection/HAR); else null. */
  locationId: string | null;
  /** Short subtitle shown under the title (e.g. report id / SPJ no). */
  subtitle: string;
  /** Header key/value pairs rendered as a metadata block. */
  meta: Array<{ label: string; value: string }>;
  /** Zero or more tabular sections (the bulk / large-dataset payload). */
  sections: ReportSection[];
}

const str = (v: unknown): string => {
  if (v === null || v === undefined) return '-';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  return s.length ? s : '-';
};
const yn = (v: unknown): string => (v ? 'Ya' : 'Tidak');

const TEMPLATE_META: Record<SourceType, { title: string; numberPrefix: string }> = {
  LAPORAN_AWAL: { title: 'LAPORAN AWAL PEKERJAAN', numberPrefix: 'LA' },
  LAPORAN_AKHIR: { title: 'LAPORAN AKHIR PEKERJAAN', numberPrefix: 'LK' },
  INSPECTION: { title: 'LAPORAN INSPEKSI', numberPrefix: 'INSP' },
  HAR: { title: 'LAPORAN HAR (HASIL ANALISA RUTIN)', numberPrefix: 'HAR' },
};

export function templateMetaFor(sourceType: SourceType) {
  return TEMPLATE_META[sourceType];
}

// ── Normalisers: source entity (repo include shape) → ReportModel ───────────

function normalizeLaporanAwal(d: any): ReportModel {
  const personil: any[] = Array.isArray(d.personilSnapshot) ? d.personilSnapshot : [];
  return {
    sourceType: 'LAPORAN_AWAL',
    ...TEMPLATE_META.LAPORAN_AWAL,
    locationId: null,
    subtitle: `No. ${str(d.reportId)} · SPJ ${str(d.nomorSPJ)}`,
    meta: [
      { label: 'ID Laporan', value: str(d.reportId) },
      { label: 'Tanggal', value: str(d.tanggal) },
      { label: 'Hari', value: str(d.hari) },
      { label: 'Nomor SPJ', value: str(d.nomorSPJ) },
      { label: 'UP3', value: str(d.up3) },
      { label: 'Pekerjaan', value: str(d.pekerjaan) },
      { label: 'Lokasi Gardu', value: str(d.lokasiGardu) },
      { label: 'Pelaksana', value: str(d.pelaksana) },
      { label: 'Penanggung Jawab', value: str(d.penanggungJawab) },
      { label: 'Pengawas Pekerjaan', value: str(d.pengawasPekerjaan) },
      { label: 'Pengawas Manuver', value: str(d.pengawasManuver) },
      { label: 'Pengawas K3', value: str(d.pengawasK3) },
      { label: 'Status', value: str(d.status) },
    ],
    sections: [
      {
        heading: 'Keselamatan Kerja (K3)',
        columns: ['Aspek', 'Nilai'],
        rows: [
          ['WP/JSA/HIRARC/SOP', yn(d.wpJsahirarcSop)],
          ['Kondisi Personil', str(d.kondisiPersonil)],
          ['Potensi Bahaya Dijelaskan', yn(d.potensiBahayaDijelaskan)],
          ['APD Lengkap', yn(d.apdLengkap)],
          ['Asuransi Ketenagakerjaan', yn(d.asuransiKetenagakerjaan)],
          ['Berdoa Sebelum Bekerja', yn(d.berdoaSebelumBekerja)],
          ['Potensi Bahaya', str(d.potensiBahaya)],
          ['Pengendalian Risiko', str(d.pengendalianRisiko)],
        ],
        widths: [34, 60],
      },
      {
        heading: `Personil Bertugas (${personil.length})`,
        columns: ['No', 'Nama', 'Jabatan'],
        rows: personil.map((p, i) => [String(i + 1), str(p?.nama), str(p?.jabatan)]),
        widths: [6, 36, 30],
      },
    ],
  };
}

function normalizeLaporanAkhir(d: any): ReportModel {
  return {
    sourceType: 'LAPORAN_AKHIR',
    ...TEMPLATE_META.LAPORAN_AKHIR,
    locationId: null,
    subtitle: `No. ${str(d.reportId)} · SPJ ${str(d.nomorSPJ)}`,
    meta: [
      { label: 'ID Laporan', value: str(d.reportId) },
      { label: 'Tanggal Selesai', value: str(d.tanggalSelesai) },
      { label: 'Nomor SPJ', value: str(d.nomorSPJ) },
      { label: 'UP3', value: str(d.up3) },
      { label: 'Pekerjaan', value: str(d.pekerjaan) },
      { label: 'Nama Aset', value: str(d.namaAset) },
      { label: 'Gardu', value: str(d.gardu) },
      { label: 'Status Pekerjaan', value: str(d.statusPekerjaan) },
      { label: 'Durasi', value: str(d.durasiPekerjaan) },
      { label: 'Pelaksana', value: str(d.pelaksana) },
      { label: 'Pengawas', value: str(d.pengawas) },
      { label: 'Status', value: str(d.status) },
    ],
    sections: [
      {
        heading: 'Detail Pekerjaan',
        columns: ['Aspek', 'Nilai'],
        rows: [
          ['Detail Langkah', str(d.detailLangkah)],
          ['Hasil Tahanan Isolasi', str(d.hasilTahananIsolasi)],
          ['Hasil Pengukuran Beban', str(d.hasilPengukuranBeban)],
          ['Catatan Hasil', str(d.catatanHasil)],
          ['Tegangan Nominal', str(d.teganganNominal)],
          ['Bay / Posisi', str(d.bayPosisi)],
          ['Tag SCADA', str(d.tagSCADA)],
        ],
        widths: [34, 60],
      },
      {
        heading: 'Perangkat SCADA',
        columns: ['Perangkat', 'Nama', 'Tipe', 'Catatan'],
        rows: [
          ['RTU', str(d.rtuNama), str(d.rtuType), str(d.catatanRTU)],
          ['Media', str(d.mediaNama), str(d.mediaType), str(d.catatanMedia)],
          ['Rectifier', str(d.rectifierNama), str(d.rectifierType), str(d.catatanRectifier)],
          ['Baterai', str(d.bateraiNama), str(d.bateraiType), str(d.catatanBaterai)],
        ],
        widths: [16, 28, 20, 24],
      },
      {
        heading: 'Status Gardu',
        columns: ['Sebelum', 'Sesudah'],
        rows: [[str(d.statusSebelum), str(d.statusSesudah)]],
        widths: [30, 30],
      },
    ],
  };
}

function normalizeInspection(d: any): ReportModel {
  const findings: any[] = Array.isArray(d.findings) ? d.findings : [];
  return {
    sourceType: 'INSPECTION',
    ...TEMPLATE_META.INSPECTION,
    locationId: d.locationId ?? null,
    subtitle: d.location ? `${str(d.location.code)} — ${str(d.location.name)}` : str(d.id),
    meta: [
      { label: 'Lokasi', value: d.location ? `${str(d.location.code)} — ${str(d.location.name)}` : '-' },
      { label: 'Tanggal Inspeksi', value: str(d.inspectionDate) },
      { label: 'Inspector', value: str(d.inspector?.name) },
      { label: 'Catatan', value: str(d.notes) },
    ],
    sections: [
      {
        heading: `Temuan (${findings.length})`,
        columns: ['No', 'Aset', 'Status', 'Temuan', 'Rekomendasi', 'Foto'],
        rows: findings.map((f, i) => [
          String(i + 1),
          f.asset ? `${str(f.asset.assetCode)} — ${str(f.asset.assetName)}` : '-',
          str(f.status),
          str(f.finding),
          str(f.recommendation),
          String(Array.isArray(f.photos) ? f.photos.length : 0),
        ]),
        widths: [6, 28, 16, 36, 36, 8],
      },
    ],
  };
}

function normalizeHar(d: any): ReportModel {
  const details: any[] = Array.isArray(d.details) ? d.details : [];
  return {
    sourceType: 'HAR',
    ...TEMPLATE_META.HAR,
    locationId: d.locationId ?? null,
    subtitle: d.location ? `${str(d.location.code)} — ${str(d.location.name)}` : str(d.id),
    meta: [
      { label: 'Lokasi', value: d.location ? `${str(d.location.code)} — ${str(d.location.name)}` : '-' },
      { label: 'Tanggal Laporan', value: str(d.reportDate) },
    ],
    sections: [
      {
        heading: `Detail Aset (${details.length})`,
        columns: ['No', 'Aset', 'Status', 'Analisa', 'Catatan'],
        rows: details.map((x, i) => [
          String(i + 1),
          x.asset ? `${str(x.asset.assetCode)} — ${str(x.asset.assetName)}` : '-',
          str(x.status),
          str(x.analysis),
          str(x.notes),
        ]),
        widths: [6, 30, 16, 40, 40],
      },
    ],
  };
}

const NORMALIZERS: Record<SourceType, (entity: any) => ReportModel> = {
  LAPORAN_AWAL: normalizeLaporanAwal,
  LAPORAN_AKHIR: normalizeLaporanAkhir,
  INSPECTION: normalizeInspection,
  HAR: normalizeHar,
};

/** Build the format-agnostic ReportModel for a loaded source entity. */
export function buildReportModel(sourceType: SourceType, entity: any): ReportModel {
  return NORMALIZERS[sourceType](entity);
}
