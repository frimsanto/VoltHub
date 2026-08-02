import PDFDocument from 'pdfkit';
import { getBranding, BRAND_COLOR } from './report.branding';
import type { ReportModel, ReportSection } from './report.templates';
import type { ReportSignatureBlock } from './report.signature';

/**
 * PDF renderer for the Enterprise Report Generator.
 *
 * Renders any `ReportModel` (see report.templates.ts) into a branded A4 PDF:
 * company letterhead, metadata block, then one auto-paginated table per section.
 * Tables wrap and break across pages so an unbounded section (e.g. thousands of
 * inspection findings) renders without overflowing — large-dataset safe.
 *
 * `render()` streams chunks and resolves a Buffer; the service writes it to disk.
 */

const PAGE = { size: 'A4' as const, margin: 50 };
const CONTENT_LEFT = 50;
const CONTENT_RIGHT = 545;
const CONTENT_WIDTH = CONTENT_RIGHT - CONTENT_LEFT; // 495
const BOTTOM_LIMIT = 780; // A4 height 842 − bottom margin/footer band

function render(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ ...PAGE, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      build(doc);
      stampFooters(doc);
      doc.end();
    } catch (err) {
      reject(err as Error);
    }
  });
}

/** Branded letterhead: logo (if any) + company block + report title bar. */
function letterhead(doc: PDFKit.PDFDocument, model: ReportModel, reportNumber: string) {
  const b = getBranding();
  let textX = CONTENT_LEFT;

  if (b.logoPath) {
    try {
      doc.image(b.logoPath, CONTENT_LEFT, 45, { fit: [48, 48] });
      textX = CONTENT_LEFT + 60;
    } catch {
      /* unreadable logo → text-only letterhead */
    }
  }

  doc.fillColor(BRAND_COLOR).fontSize(15).font('Helvetica-Bold').text(b.companyName, textX, 48);
  doc.fillColor('#333').fontSize(9).font('Helvetica').text(b.companyUnit, textX);
  doc.fontSize(8).text(b.companyAddress, textX);
  doc.fillColor('black');

  doc.moveTo(CONTENT_LEFT, 92).lineTo(CONTENT_RIGHT, 92).lineWidth(1.5).strokeColor(BRAND_COLOR).stroke();
  doc.strokeColor('black').lineWidth(1);

  doc.moveDown(1.4);
  doc.fontSize(13).font('Helvetica-Bold').fillColor('black').text(model.title, { align: 'center' });
  doc.fontSize(9).font('Helvetica').fillColor('#555').text(model.subtitle, { align: 'center' });
  doc.fontSize(8).text(`No. Dokumen: ${reportNumber}`, { align: 'center' });
  doc.fillColor('black').moveDown(1);
}

function metaBlock(doc: PDFKit.PDFDocument, model: ReportModel) {
  model.meta.forEach(({ label, value }) => {
    ensureSpace(doc, 16);
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#333').text(`${label}: `, CONTENT_LEFT, doc.y, {
      continued: true,
    });
    doc.font('Helvetica').fillColor('black').text(value);
  });
  doc.moveDown(0.8);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > BOTTOM_LIMIT) doc.addPage();
}

/** Column x-offsets + widths from relative weight hints (or equal split). */
function columnLayout(section: ReportSection): { x: number[]; w: number[] } {
  const n = section.columns.length;
  const weights = section.widths && section.widths.length === n ? section.widths : Array(n).fill(1);
  const total = weights.reduce((a, c) => a + c, 0);
  const w = weights.map((wt) => (wt / total) * CONTENT_WIDTH);
  const x: number[] = [];
  let acc = CONTENT_LEFT;
  for (const width of w) {
    x.push(acc);
    acc += width;
  }
  return { x, w };
}

function rowHeight(doc: PDFKit.PDFDocument, cells: string[], w: number[], fontSize: number): number {
  doc.fontSize(fontSize).font('Helvetica');
  let max = 0;
  cells.forEach((c, i) => {
    const h = doc.heightOfString(c || '-', { width: w[i] - 8 });
    if (h > max) max = h;
  });
  return Math.max(max + 8, 18);
}

function drawRow(
  doc: PDFKit.PDFDocument,
  cells: string[],
  x: number[],
  w: number[],
  opts: { header?: boolean; fontSize: number },
) {
  const h = rowHeight(doc, cells, w, opts.fontSize);
  ensureSpaceWithRow(doc, h);
  const y = doc.y;

  if (opts.header) {
    doc.rect(CONTENT_LEFT, y, CONTENT_WIDTH, h).fill(BRAND_COLOR);
  }
  doc.fontSize(opts.fontSize)
    .font(opts.header ? 'Helvetica-Bold' : 'Helvetica')
    .fillColor(opts.header ? 'white' : 'black');

  cells.forEach((c, i) => {
    doc.text(c || '-', x[i] + 4, y + 4, { width: w[i] - 8 });
  });

  // cell borders
  doc.fillColor('black').strokeColor('#cccccc').lineWidth(0.5);
  doc.rect(CONTENT_LEFT, y, CONTENT_WIDTH, h).stroke();
  doc.strokeColor('black').lineWidth(1);
  doc.y = y + h;
}

/** Like ensureSpace but re-draws the section header row after a page break. */
let pendingHeader: { cells: string[]; x: number[]; w: number[]; fontSize: number } | null = null;
function ensureSpaceWithRow(doc: PDFKit.PDFDocument, h: number) {
  if (doc.y + h > BOTTOM_LIMIT) {
    doc.addPage();
    if (pendingHeader) {
      const ph = pendingHeader;
      pendingHeader = null; // avoid recursion
      drawRow(doc, ph.cells, ph.x, ph.w, { header: true, fontSize: ph.fontSize });
      pendingHeader = ph;
    }
  }
}

function tableSection(doc: PDFKit.PDFDocument, section: ReportSection) {
  ensureSpace(doc, 40);
  doc.moveDown(0.4);
  doc.fontSize(11).font('Helvetica-Bold').fillColor(BRAND_COLOR).text(section.heading, CONTENT_LEFT, doc.y);
  doc.fillColor('black').moveDown(0.3);

  const { x, w } = columnLayout(section);
  const fontSize = 8.5;

  pendingHeader = { cells: section.columns, x, w, fontSize };
  drawRow(doc, section.columns, x, w, { header: true, fontSize });

  if (section.rows.length === 0) {
    drawRow(doc, [section.columns.length > 1 ? '(tidak ada data)' : '-'], [CONTENT_LEFT], [CONTENT_WIDTH], {
      fontSize,
    });
  } else {
    section.rows.forEach((r) => drawRow(doc, r, x, w, { fontSize }));
  }
  pendingHeader = null;
  doc.moveDown(0.6);
}

/** Footer band on every page: note + page numbering + print timestamp. */
function stampFooters(doc: PDFKit.PDFDocument) {
  const b = getBranding();
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const y = 800;
    doc.moveTo(CONTENT_LEFT, y).lineTo(CONTENT_RIGHT, y).lineWidth(0.5).strokeColor('#cccccc').stroke();
    doc.fontSize(7).font('Helvetica').fillColor('#888');
    doc.text(b.footerNote, CONTENT_LEFT, y + 4, { width: 300, align: 'left' });
    doc.text(
      `${b.appName} · Hal ${i - range.start + 1}/${range.count} · ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
      CONTENT_LEFT,
      y + 4,
      { width: CONTENT_WIDTH, align: 'right' },
    );
    doc.fillColor('black');
  }
}

/**
 * Digital-signature validation block: a framed panel with the QR code, signer /
 * issuer, key fingerprint, content hash and a human verify URL. Rendered on its
 * own page so the proof of authenticity is always intact and legible. Anyone can
 * scan the QR (or open the URL) to verify the report offline against the
 * published Ed25519 public key — see docs/DIGITAL_SIGNATURE.md.
 */
function signatureBlock(doc: PDFKit.PDFDocument, sig: ReportSignatureBlock) {
  doc.addPage();
  const top = 60;

  doc.fontSize(13).font('Helvetica-Bold').fillColor(BRAND_COLOR).text('TANDA TANGAN DIGITAL', CONTENT_LEFT, top);
  doc.fontSize(9).font('Helvetica').fillColor('#555').text('Dokumen ini ditandatangani secara elektronik dan dapat diverifikasi keasliannya.', { width: CONTENT_WIDTH });
  doc.moveDown(0.6);

  const panelTop = doc.y + 4;
  const panelHeight = 200;
  doc.rect(CONTENT_LEFT, panelTop, CONTENT_WIDTH, panelHeight).lineWidth(1).strokeColor(BRAND_COLOR).stroke();
  doc.strokeColor('black').lineWidth(1);

  // QR on the left.
  const qrSize = 150;
  const qrX = CONTENT_LEFT + 16;
  const qrY = panelTop + 25;
  try {
    doc.image(sig.qrPng, qrX, qrY, { fit: [qrSize, qrSize] });
  } catch {
    /* QR render failure must not break the document */
  }
  doc.fontSize(7).font('Helvetica').fillColor('#888').text('Pindai untuk verifikasi', qrX, qrY + qrSize + 4, { width: qrSize, align: 'center' });

  // Details on the right.
  const dx = qrX + qrSize + 24;
  const dw = CONTENT_RIGHT - dx - 16;
  let dy = panelTop + 18;
  const line = (label: string, value: string) => {
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#333').text(label, dx, dy, { width: dw });
    dy = doc.y;
    doc.fontSize(8.5).font('Helvetica').fillColor('black').text(value, dx, dy, { width: dw });
    dy = doc.y + 4;
  };
  line('Penerbit', sig.issuer);
  if (sig.signerName) line('Penandatangan', sig.signerName);
  line('No. Dokumen', sig.reportNumber);
  line('Algoritma', `${sig.algorithm} · Key ${sig.keyId}`);
  line('Ditandatangani', new Date(sig.issuedAt).toISOString().slice(0, 19).replace('T', ' ') + ' UTC');

  doc.y = panelTop + panelHeight + 14;
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#333').text('Sidik Konten (SHA-256):', CONTENT_LEFT, doc.y);
  doc.fontSize(7.5).font('Courier').fillColor('#555').text(sig.contentHash, { width: CONTENT_WIDTH });
  doc.moveDown(0.4);
  doc.fontSize(8).font('Helvetica-Bold').fillColor('#333').text('URL Verifikasi:', CONTENT_LEFT, doc.y);
  doc.fontSize(8).font('Helvetica').fillColor(BRAND_COLOR).text(sig.verifyUrl, { width: CONTENT_WIDTH, link: sig.verifyUrl, underline: true });
  doc.fillColor('black');
}

/** Render a normalised ReportModel into a branded PDF buffer. */
export function buildReportPdf(
  model: ReportModel,
  reportNumber: string,
  signature?: ReportSignatureBlock,
): Promise<Buffer> {
  return render((doc) => {
    letterhead(doc, model, reportNumber);
    metaBlock(doc, model);
    model.sections.forEach((s) => tableSection(doc, s));
    if (signature) signatureBlock(doc, signature);
  });
}
