/**
 * Link every distribution gardu → its supplying penyulang (feeder), from the
 * "GD" sheet of DAFTAR ISI GH_PENYULANG. Sets locations.supplyFeederId.
 *
 * A distribution gardu row gives: GARDU DISTRIBUSI, GARDU INDUK, PENYULANG,
 * GARDU HUBUNG. The supplying penyulang is registered at its GH (when hubbed)
 * or at its GI (when express, GH = GI). We reuse the GH-registered feeders from
 * seed-penyulang and CREATE the missing (mostly express) ones under the GI.
 *
 * SAFE / idempotent: column add is guarded; feeders via createMany skipDuplicates;
 * links via UPDATE (re-runnable). Uses raw SQL for the new column so it works
 * even when the Prisma engine predates the migration.
 *
 * Run:  npm run seed:gardu-penyulang
 */
import path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const FILE = path.resolve(__dirname, '../../dataset_scada/DAFTAR ISI GH_PENYULANG UID JAYA.xlsx');

const norm = (v: unknown) => (v == null ? '' : String(v).trim());
const up = (s: string) => s.trim().toUpperCase();
const isUuid = (s: string) => /^[0-9a-fA-F-]{36}$/.test(s);

async function ensureColumn() {
  const rows = await prisma.$queryRawUnsafe<{ c: bigint }[]>(
    `SELECT COUNT(*) c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='locations' AND COLUMN_NAME='supplyFeederId'`
  );
  if (Number(rows[0].c) === 0) {
    await prisma.$executeRawUnsafe('ALTER TABLE `locations` ADD COLUMN `supplyFeederId` VARCHAR(36) NULL');
    await prisma.$executeRawUnsafe('CREATE INDEX `idx_locations_supply_feeder` ON `locations`(`supplyFeederId`)');
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `locations` ADD CONSTRAINT `locations_supply_feeder_fk` ' +
        'FOREIGN KEY (`supplyFeederId`) REFERENCES `feeders`(`id`) ON UPDATE RESTRICT'
    );
    console.log('🔧 Kolom locations.supplyFeederId dibuat');
  } else {
    console.log('🔧 Kolom locations.supplyFeederId sudah ada');
  }
}

async function loadFeederMap() {
  const feeders = await prisma.feeder.findMany({ select: { id: true, locationId: true, feederCode: true } });
  const m = new Map<string, string>();
  for (const f of feeders) m.set(`${f.locationId}::${up(f.feederCode)}`, f.id);
  return m;
}

async function main() {
  await ensureColumn();

  // Location lookups.
  const locs = await prisma.location.findMany({ select: { id: true, code: true, name: true, locationType: true } });
  const byCode = new Map<string, string>(); // code → id (gardu + GH)
  const giByName = new Map<string, string>(); // GI name → id
  for (const l of locs) {
    if (l.code) byCode.set(up(l.code), l.id);
    if (l.locationType === 'GI') giByName.set(up(l.name), l.id);
  }
  let feederMap = await loadFeederMap();
  console.log(`📍 ${locs.length} lokasi, ${feederMap.size} feeder awal`);

  // Read GD.
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);
  const ws = wb.getWorksheet('GD');
  if (!ws) throw new Error('Sheet GD tidak ditemukan');
  const H = new Map<string, number>();
  ws.getRow(1).eachCell({ includeEmpty: false }, (c, col) => {
    const h = norm(c.text).toLowerCase();
    if (h && !H.has(h)) H.set(h, col);
  });
  const cGardu = H.get('gardu distribusi')!;
  const cGI = H.get('gardu induk')!;
  const cPyl = H.get('penyulang')!;
  const cGH = H.get('gardu hubung')!;

  const newFeeders = new Map<string, { locationId: string; feederCode: string; feederName: string }>();
  const links: { garduId: string; key: string }[] = [];
  let noGardu = 0,
    noPyl = 0,
    noParent = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const garduCode = norm(row.getCell(cGardu).text);
    const gi = norm(row.getCell(cGI).text);
    const pyl = norm(row.getCell(cPyl).text);
    const gh = norm(row.getCell(cGH).text);
    if (!garduCode) continue;
    const garduId = byCode.get(up(garduCode));
    if (!garduId) { noGardu++; continue; }
    if (!pyl) { noPyl++; continue; }

    // Parent of the penyulang feeder: GH if hubbed, else GI (express).
    const parentId = (gh && byCode.get(up(gh))) || giByName.get(up(gi));
    if (!parentId) { noParent++; continue; }

    const feederCode = pyl.slice(0, 50);
    const key = `${parentId}::${up(feederCode)}`;
    if (!feederMap.has(key) && !newFeeders.has(key)) {
      newFeeders.set(key, {
        locationId: parentId,
        feederCode,
        feederName: gi ? `${pyl} (${gi})`.slice(0, 255) : pyl.slice(0, 255),
      });
    }
    links.push({ garduId, key });
  }

  console.log(
    `🧮 ${links.length} gardu→penyulang, feeder baru (express dll): ${newFeeders.size}, ` +
      `skip: ${noGardu} gardu tak cocok / ${noPyl} tanpa penyulang / ${noParent} GI&GH tak cocok`
  );

  // Create missing feeders, then refresh the map to capture their ids.
  const toCreate = [...newFeeders.values()];
  for (let i = 0; i < toCreate.length; i += 1000) {
    await prisma.feeder.createMany({ data: toCreate.slice(i, i + 1000), skipDuplicates: true });
  }
  if (toCreate.length) feederMap = await loadFeederMap();
  console.log(`   feeder total kini: ${feederMap.size}`);

  // Resolve links → {garduId: feederId}, last write wins (a gardu has one penyulang).
  const updates = new Map<string, string>();
  let unresolved = 0;
  for (const { garduId, key } of links) {
    const fid = feederMap.get(key);
    if (!fid) { unresolved++; continue; }
    if (isUuid(garduId) && isUuid(fid)) updates.set(garduId, fid);
  }
  console.log(`🔗 ${updates.size} gardu siap ditautkan (${unresolved} tak ter-resolve)`);

  // Batched UPDATE … CASE (raw SQL; UUIDs are safe to interpolate).
  const entries = [...updates.entries()];
  let done = 0;
  for (let i = 0; i < entries.length; i += 500) {
    const chunk = entries.slice(i, i + 500);
    const cases = chunk.map(([g, f]) => `WHEN '${g}' THEN '${f}'`).join(' ');
    const ids = chunk.map(([g]) => `'${g}'`).join(',');
    await prisma.$executeRawUnsafe(
      `UPDATE \`locations\` SET \`supplyFeederId\` = CASE \`id\` ${cases} END WHERE \`id\` IN (${ids})`
    );
    done += chunk.length;
  }
  console.log(`\n✅ Selesai. ${done} gardu distribusi tertaut ke penyulang penyuplainya.`);
}

main()
  .catch((e) => { console.error('❌ seed-gardu-penyulang gagal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
