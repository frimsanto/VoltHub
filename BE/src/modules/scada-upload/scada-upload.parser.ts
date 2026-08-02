import ExcelJS from 'exceljs';
import { ValidationError } from '../../utils/appError';
import type { ScadaFileType } from './scada-upload.validation';

/**
 * Parser for the two Siemens Spectrum Power 7 exports.
 *
 * SP7 headers are messy: some contain literal line breaks ("Port /\nSerial
 * Port -> Device"), some contain <br> markup, and real-world exports carry it
 * HTML-escaped ("IP Addr /&lt;br&gt;Device Prefix"). Every header is therefore
 * normalized (strip br/entities, collapse whitespace, lowercase) before
 * matching, and the two multiline columns match on a prefix rather than the
 * full text.
 */

export interface ParsedRtuRow {
  rtuName: string;
  rtuText: string | null;
  operState: string;
  adminState: string | null;
  protocol: string | null;
  pairNr: number | null;
  channelPrimary: number | null;
  server: string | null;
  asdu: string | null;
}

export interface ParsedLineRow {
  pairId: number | null;
  channelId: number | null;
  ifsServer: string | null;
  channelName: string | null;
  channelText: string | null;
  adminState: string | null;
  /** "UP" | "DOWN" — null for UNASG channel slots that carry no Oper State. */
  operState: string | null;
  assigned: string | null;
  dataXfr: string | null;
  deviceType: string | null;
  ipAddr: string | null;
  port: string | null;
}

export interface ParseResult<T> {
  rows: T[];
  totalUp: number;
  totalDown: number;
}

/** Strip <br> (raw or HTML-escaped) + line breaks, collapse spaces, lowercase. */
const normalizeHeader = (v: ExcelJS.CellValue): string =>
  cellString(v)
    .replace(/&lt;br\s*\/?&gt;/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** Flatten any ExcelJS cell value (rich text, formula, hyperlink) to a string. */
const cellString = (v: ExcelJS.CellValue): string => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text ?? '');
    if ('result' in v) return String(v.result ?? '');
    if (v instanceof Date) return v.toISOString();
    return String(v);
  }
  return String(v);
};

const cellText = (row: ExcelJS.Row, col: number | undefined, max: number): string | null => {
  if (!col) return null;
  const s = cellString(row.getCell(col).value).trim();
  return s ? s.slice(0, max) : null;
};

const cellInt = (row: ExcelJS.Row, col: number | undefined): number | null => {
  if (!col) return null;
  const raw = row.getCell(col).value;
  const n = typeof raw === 'number' ? raw : parseInt(cellString(raw).trim(), 10);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

type HeaderMatcher = { key: string; match: (h: string) => boolean; required?: boolean };

const RTU_COLUMNS: HeaderMatcher[] = [
  { key: 'rtuName', match: (h) => h === 'rtu name', required: true },
  { key: 'pairNr', match: (h) => h === 'pairnr' },
  { key: 'channelPrimary', match: (h) => h === 'channel primary' },
  { key: 'server', match: (h) => h === 'server (cid)' },
  { key: 'rtuText', match: (h) => h === 'rtu text' },
  { key: 'protocol', match: (h) => h === 'protocol' },
  { key: 'asdu', match: (h) => h === 'asdu' },
  { key: 'adminState', match: (h) => h === 'admin state' },
  { key: 'operState', match: (h) => h === 'oper state', required: true },
];

const LINE_COLUMNS: HeaderMatcher[] = [
  { key: 'pairId', match: (h) => h === 'pair id' },
  { key: 'channelId', match: (h) => h === 'channel id', required: true },
  { key: 'ifsServer', match: (h) => h === 'ifs server (cid)' },
  { key: 'channelName', match: (h) => h === 'channel name' },
  { key: 'channelText', match: (h) => h === 'channel text' },
  { key: 'adminState', match: (h) => h === 'admin state' },
  { key: 'operState', match: (h) => h === 'oper state', required: true },
  { key: 'assigned', match: (h) => h === 'asgd' },
  { key: 'dataXfr', match: (h) => h === 'data xfr' },
  { key: 'deviceType', match: (h) => h === 'device type' },
  // Multiline headers — match on prefix so <br>/\n variants all resolve.
  { key: 'ipAddr', match: (h) => h.startsWith('ip addr') },
  { key: 'port', match: (h) => h.startsWith('port /') || h === 'port' },
];

/**
 * Locate the header row (scans the first 5 rows — SP7 sometimes prepends a
 * title/sub-header) and map each logical key to its 1-based column index.
 */
function resolveColumns(
  ws: ExcelJS.Worksheet,
  matchers: HeaderMatcher[],
  fileType: ScadaFileType
): { cols: Record<string, number>; headerRow: number } {
  for (let r = 1; r <= Math.min(5, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const cols: Record<string, number> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const h = normalizeHeader(cell.value);
      if (!h) return;
      for (const m of matchers) {
        if (cols[m.key] === undefined && m.match(h)) cols[m.key] = colNumber;
      }
    });
    const missing = matchers.filter((m) => m.required && cols[m.key] === undefined);
    if (missing.length === 0 && Object.keys(cols).length >= 2) {
      return { cols, headerRow: r };
    }
  }
  const required = matchers.filter((m) => m.required).map((m) => m.key);
  throw new ValidationError(
    `File tidak dikenali sebagai export ${fileType} Siemens SP7 — kolom wajib (${required.join(
      ', '
    )}) tidak ditemukan di 5 baris pertama. Pastikan fileType sesuai dengan file yang diupload.`
  );
}

export async function parseRtuWorkbook(buffer: Buffer): Promise<ParseResult<ParsedRtuRow>> {
  const ws = await firstSheet(buffer);
  const { cols, headerRow } = resolveColumns(ws, RTU_COLUMNS, 'RTU');

  const rows: ParsedRtuRow[] = [];
  let totalUp = 0;
  let totalDown = 0;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const rtuName = cellText(row, cols.rtuName, 100);
    const operState = cellText(row, cols.operState, 10)?.toUpperCase() ?? null;
    if (!rtuName || !operState) return; // blank/summary row

    if (operState === 'UP') totalUp++;
    else if (operState === 'DOWN') totalDown++;

    rows.push({
      rtuName,
      rtuText: cellText(row, cols.rtuText, 255),
      operState,
      adminState: cellText(row, cols.adminState, 10)?.toUpperCase() ?? null,
      protocol: cellText(row, cols.protocol, 20),
      pairNr: cellInt(row, cols.pairNr),
      channelPrimary: cellInt(row, cols.channelPrimary),
      server: cellText(row, cols.server, 50),
      asdu: cellText(row, cols.asdu, 50),
    });
  });
  return { rows, totalUp, totalDown };
}

export async function parseLinesWorkbook(buffer: Buffer): Promise<ParseResult<ParsedLineRow>> {
  const ws = await firstSheet(buffer);
  const { cols, headerRow } = resolveColumns(ws, LINE_COLUMNS, 'LINES');

  const rows: ParsedLineRow[] = [];
  let totalUp = 0;
  let totalDown = 0;
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRow) return;
    const operState = cellText(row, cols.operState, 10)?.toUpperCase() ?? null;
    const channelId = cellInt(row, cols.channelId);
    // Only Channel Id marks a data row. Oper State is deliberately OPTIONAL:
    // the vast majority of SP7 Lines rows are unassigned (UNASG) channel slots
    // with an empty Admin/Oper State — they are stored with operState null so
    // the file is ingested in full, not just the ~40 assigned channels.
    if (channelId == null) return; // blank/summary row

    if (operState === 'UP') totalUp++;
    else if (operState === 'DOWN') totalDown++;

    rows.push({
      pairId: cellInt(row, cols.pairId),
      channelId,
      ifsServer: cellText(row, cols.ifsServer, 50),
      channelName: cellText(row, cols.channelName, 100),
      channelText: cellText(row, cols.channelText, 255),
      adminState: cellText(row, cols.adminState, 10)?.toUpperCase() ?? null,
      operState,
      assigned: cellText(row, cols.assigned, 10)?.toUpperCase() ?? null,
      dataXfr: cellText(row, cols.dataXfr, 10)?.toUpperCase() ?? null,
      deviceType: cellText(row, cols.deviceType, 30),
      ipAddr: cellText(row, cols.ipAddr, 100),
      port: cellText(row, cols.port, 50),
    });
  });
  return { rows, totalUp, totalDown };
}

async function firstSheet(buffer: Buffer): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount === 0) {
    throw new ValidationError('File Excel kosong atau tidak memiliki worksheet.');
  }
  return ws;
}
