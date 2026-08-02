import ExcelJS from 'exceljs';

/**
 * Excel parser for asset imports — built on the project's existing `exceljs`
 * dependency (no new parser library). Reads the first worksheet, maps the
 * header row to known columns (case/space-insensitive), and returns raw string
 * records keyed by canonical field name. Validation happens later (Zod).
 */

// Header label (normalised) → canonical field. Accepts a few common aliases.
const HEADER_MAP: Record<string, string> = {
  locationcode: 'locationCode',
  kodelokasi: 'locationCode',
  feedercode: 'feederCode',
  kodefeeder: 'feederCode',
  assettype: 'assetType',
  jenisaset: 'assetType',
  assetcode: 'assetCode',
  kodeaset: 'assetCode',
  assetname: 'assetName',
  namaaset: 'assetName',
  brand: 'brand',
  merk: 'brand',
  model: 'model',
  serialnumber: 'serialNumber',
  nomorseri: 'serialNumber',
  tahunoperasi: 'tahunOperasi',
  status: 'status',
  notes: 'notes',
  catatan: 'notes',
};

// Header maps for the other import domains (Story 24 Gardu, Story 25 Performance).
const GARDU_HEADER_MAP: Record<string, string> = {
  sitecode: 'siteCode',
  kodegardu: 'siteCode',
  code: 'siteCode',
  kode: 'siteCode',
  sitename: 'siteName',
  namagardu: 'siteName',
  name: 'siteName',
  nama: 'siteName',
  up3: 'up3',
  address: 'address',
  alamat: 'address',
  latitude: 'latitude',
  lintang: 'latitude',
  longitude: 'longitude',
  bujur: 'longitude',
};

const PERFORMANCE_HEADER_MAP: Record<string, string> = {
  sitecode: 'siteCode',
  kodegardu: 'siteCode',
  code: 'siteCode',
  performancedate: 'performanceDate',
  tanggal: 'performanceDate',
  date: 'performanceDate',
  performancestatus: 'performanceStatus',
  status: 'performanceStatus',
  hasil: 'performanceStatus',
  score: 'score',
  nilai: 'score',
};

// SCADA RTU state export (csd_IFS-IFS_RTUs). Single sheet, header on row 1.
// Only the columns we ingest are mapped; the rest are ignored.
const SCADA_RTU_HEADER_MAP: Record<string, string> = {
  rtuname: 'rtuName',
  rtutext: 'rtuText',
  operstate: 'operState',
  adminstate: 'adminState',
  protocol: 'protocol',
  asdu: 'asdu',
  address: 'address',
  pairnr: 'pairNr',
  channelprimary: 'channelPrimary',
};

const normalise = (s: string) => s.toString().trim().toLowerCase().replace(/[\s_]+/g, '');

export interface ParsedRow {
  rowNumber: number; // 1-based sheet row (header is row 1)
  data: Record<string, string>;
}

/**
 * Generic first-worksheet parser. Maps the header row to canonical fields using
 * the supplied header map (case/space/underscore-insensitive) and returns raw
 * string records. Validation (Zod) happens in the import service.
 */
export async function parseWorkbook(
  buffer: Buffer,
  headerMap: Record<string, string>
): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Excel file has no worksheet');

  // Build column index → canonical field from the header row.
  const headerRow = sheet.getRow(1);
  const colToField: Record<number, string> = {};
  headerRow.eachCell((cell, col) => {
    const field = headerMap[normalise(String(cell.value ?? ''))];
    if (field) colToField[col] = field;
  });

  const rows: ParsedRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const data: Record<string, string> = {};
    let hasValue = false;
    Object.entries(colToField).forEach(([col, field]) => {
      const raw = row.getCell(Number(col)).value;
      const val = raw === null || raw === undefined ? '' : String(raw).trim();
      // Omit empty cells so Zod `.optional()`/`.default()` applies instead of
      // receiving an empty string (which fails enum/typed validations).
      if (val !== '') {
        hasValue = true;
        data[field] = val;
      }
    });

    if (hasValue) rows.push({ rowNumber, data });
  });

  return rows;
}

export const parseAssetWorkbook = (buffer: Buffer) => parseWorkbook(buffer, HEADER_MAP);
export const parseGarduWorkbook = (buffer: Buffer) => parseWorkbook(buffer, GARDU_HEADER_MAP);
export const parsePerformanceWorkbook = (buffer: Buffer) =>
  parseWorkbook(buffer, PERFORMANCE_HEADER_MAP);
export const parseScadaRtuWorkbook = (buffer: Buffer) => parseWorkbook(buffer, SCADA_RTU_HEADER_MAP);
