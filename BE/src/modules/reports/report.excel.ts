import ExcelJS from 'exceljs';
import { getBranding, BRAND_COLOR_EXCEL } from './report.branding';
import type { ReportModel, ReportSection } from './report.templates';
import type { ReportSignatureBlock } from './report.signature';

/**
 * Excel renderer for the Enterprise Report Generator.
 *
 * Streams any `ReportModel` to an .xlsx file via ExcelJS's streaming
 * `WorkbookWriter`: rows are committed and flushed to disk as they are written
 * instead of being buffered in memory, so a section with hundreds of thousands
 * of rows exports with a near-constant memory footprint — large-dataset safe.
 *
 * Layout: a branded "Ringkasan" sheet (letterhead + metadata) plus one sheet per
 * section. Writing directly to a path (not a Buffer) avoids a second full copy.
 */

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: BRAND_COLOR_EXCEL },
};

function safeSheetName(raw: string, index: number): string {
  // Excel: max 31 chars, no []*/\?: and must be unique-ish.
  const cleaned = raw.replace(/[[\]*/\\?:]/g, ' ').slice(0, 28).trim() || `Sheet${index}`;
  return `${index}. ${cleaned}`.slice(0, 31);
}

function writeSummarySheet(workbook: ExcelJS.stream.xlsx.WorkbookWriter, model: ReportModel, reportNumber: string) {
  const b = getBranding();
  const ws = workbook.addWorksheet('Ringkasan');
  ws.columns = [{ width: 28 }, { width: 70 }];

  const title = ws.addRow([b.companyName]);
  title.font = { bold: true, size: 14, color: { argb: BRAND_COLOR_EXCEL } };
  title.commit();
  ws.addRow([b.companyUnit]).commit();
  ws.addRow([b.companyAddress]).commit();
  ws.addRow([]).commit();

  const docTitle = ws.addRow([model.title]);
  docTitle.font = { bold: true, size: 12 };
  docTitle.commit();
  ws.addRow([model.subtitle]).commit();
  ws.addRow(['No. Dokumen', reportNumber]).commit();
  ws.addRow([]).commit();

  const head = ws.addRow(['Informasi', 'Nilai']);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = HEADER_FILL;
  });
  head.commit();

  model.meta.forEach(({ label, value }) => {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    r.commit();
  });
  ws.commit();
}

function writeSectionSheet(
  workbook: ExcelJS.stream.xlsx.WorkbookWriter,
  section: ReportSection,
  index: number,
) {
  const ws = workbook.addWorksheet(safeSheetName(section.heading, index));
  ws.columns = section.columns.map((_, i) => ({
    width: section.widths?.[i] ?? 22,
  }));

  const head = ws.addRow(section.columns);
  head.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = HEADER_FILL;
    c.alignment = { vertical: 'middle' };
  });
  head.commit();

  for (const row of section.rows) {
    const r = ws.addRow(row);
    r.eachCell((c) => {
      c.alignment = { wrapText: true, vertical: 'top' };
    });
    r.commit();
  }
  // Freeze header for usability on large sheets.
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.commit();
}

/**
 * Digital-signature "Validasi" sheet: the embedded QR image plus signer/issuer,
 * key fingerprint, content hash and verify URL. Mirrors the PDF validation block
 * so the Excel artifact is equally self-verifying (docs/DIGITAL_SIGNATURE.md).
 */
function writeSignatureSheet(workbook: ExcelJS.stream.xlsx.WorkbookWriter, sig: ReportSignatureBlock) {
  const ws = workbook.addWorksheet('Validasi');
  ws.columns = [{ width: 28 }, { width: 80 }];

  const title = ws.addRow(['TANDA TANGAN DIGITAL']);
  title.font = { bold: true, size: 13, color: { argb: BRAND_COLOR_EXCEL } };
  title.commit();
  ws.addRow(['Dokumen ditandatangani secara elektronik dan dapat diverifikasi keasliannya.']).commit();
  ws.addRow([]).commit();

  // Embed the QR image (top-right of the sheet).
  try {
    const imageId = workbook.addImage({ buffer: sig.qrPng as unknown as ExcelJS.Buffer, extension: 'png' });
    ws.addImage(imageId, { tl: { col: 2.2, row: 3 }, ext: { width: 160, height: 160 } });
  } catch {
    /* QR embed failure must not break the export */
  }

  const rows: Array<[string, string]> = [
    ['Penerbit', sig.issuer],
    ['Penandatangan', sig.signerName ?? '-'],
    ['No. Dokumen', sig.reportNumber],
    ['Algoritma', `${sig.algorithm} · Key ${sig.keyId}`],
    ['Ditandatangani', new Date(sig.issuedAt).toISOString().slice(0, 19).replace('T', ' ') + ' UTC'],
    ['Sidik Konten (SHA-256)', sig.contentHash],
    ['URL Verifikasi', sig.verifyUrl],
  ];
  rows.forEach(([label, value]) => {
    const r = ws.addRow([label, value]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    r.commit();
  });
  ws.commit();
}

/** Stream a ReportModel to an .xlsx file at `absPath`. Resolves when flushed. */
export async function buildReportExcelToFile(
  model: ReportModel,
  reportNumber: string,
  absPath: string,
  signature?: ReportSignatureBlock,
): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: absPath,
    useStyles: true,
    useSharedStrings: false, // lower memory for large, low-repetition datasets
  });
  workbook.creator = getBranding().appName;
  workbook.created = new Date();

  writeSummarySheet(workbook, model, reportNumber);
  model.sections.forEach((section, i) => writeSectionSheet(workbook, section, i + 1));
  if (signature) writeSignatureSheet(workbook, signature);

  await workbook.commit();
}
