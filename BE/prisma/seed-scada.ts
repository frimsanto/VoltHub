/**
 * Load REAL gardu/GI/GH locations from the master SCADA workbook into `locations`
 * so they appear on the GIS map and Gardu list.
 *
 * Source: dokumen_lengkap/TELEKOMUNIKASI SCADA 2026 V2 (3).xlsx, sheet "Data Penyulang"
 *   columns: Gardu | UP3 | Address | Koordinat("lat, lng") | Jenis Gardu(GI/GH/GD) | Penyulang
 *
 * SAFETY
 *  - Additive & idempotent: inserts with createMany({ skipDuplicates }) keyed on the
 *    derived unique `code`. Re-running adds only new gardu; existing rows untouched.
 *  - Does NOT touch DEMO-* rows or anything else.
 *
 * Run:  npm run seed:scada            (uses default file path)
 *       npm run seed:scada -- "C:/path/to/file.xlsx"
 */
import path from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient, LocationType } from '@prisma/client';
import { slugifyCode } from '../src/utils/generateCode';

const prisma = new PrismaClient();

const DEFAULT_FILE = path.resolve(
  __dirname,
  '../../dokumen_lengkap/TELEKOMUNIKASI SCADA 2026 V2 (3).xlsx',
);
const SHEET = 'Data Penyulang';

const norm = (v: unknown) => (v == null ? '' : v.toString().trim());

/** Parse a "lat, lng" cell into rounded coordinates, or null when invalid. */
function parseCoord(s: string): { lat: number; lng: number } | null {
  const m = s.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  let lat = parseFloat(m[1]);
  const lng = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  // Sign-error guard: this is Jakarta/UP2D data (lng ~106–108, southern hemisphere).
  // A positive latitude in that longitude band is a dropped minus sign — fix it
  // so the gardu doesn't plot near Malaysia (e.g. GH0320, GI RAWA DENOK).
  if (lat > 0 && lat < 8 && lng > 105 && lng < 109) lat = -lat;
  return { lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7 };
}

/** Map the workbook's "Jenis Gardu" to the canonical LocationType enum. */
function mapType(jenis: string): LocationType {
  const t = jenis.toUpperCase();
  if (t === 'GI') return LocationType.GI;
  if (t === 'GH') return LocationType.GH;
  return LocationType.GARDU; // GD and everything else
}

async function main() {
  const file = process.argv[2] || DEFAULT_FILE;
  console.log(`📖 Reading ${file}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(SHEET);
  if (!ws) throw new Error(`Sheet "${SHEET}" not found`);

  // Build unique rows (dedupe by gardu name) with collision-free codes.
  const usedCodes = new Set<string>();
  const byName = new Map<string, { name: string; type: LocationType; up3: string | null; address: string | null; lat: number | null; lng: number | null; code: string }>();

  const uniqueCode = (name: string) => {
    const root = slugifyCode(name, 'GARDU').slice(0, 50);
    if (!usedCodes.has(root)) { usedCodes.add(root); return root; }
    for (let i = 2; i < 100000; i++) {
      const suffix = `-${i}`;
      const c = `${root.slice(0, 50 - suffix.length)}${suffix}`;
      if (!usedCodes.has(c)) { usedCodes.add(c); return c; }
    }
    return `${root.slice(0, 44)}-${Date.now().toString(36)}`;
  };

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = norm(row.getCell(1).text);
    if (!name || byName.has(name)) continue;
    const coord = parseCoord(norm(row.getCell(4).text));
    byName.set(name, {
      name,
      type: mapType(norm(row.getCell(5).text)),
      up3: norm(row.getCell(2).text) || null,
      address: norm(row.getCell(3).text) || null,
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      code: uniqueCode(name),
    });
  }

  const all = [...byName.values()];
  const withCoord = all.filter((r) => r.lat != null).length;
  const counts = all.reduce<Record<string, number>>((a, r) => ((a[r.type] = (a[r.type] || 0) + 1), a), {});
  console.log(`🧮 Parsed ${all.length} unique locations (${withCoord} with coordinates) — ${JSON.stringify(counts)}`);

  // Skip rows already present (by code), then bulk insert the rest.
  const existing = new Set(
    (await prisma.location.findMany({ select: { code: true } })).map((l) => l.code),
  );
  const toInsert = all.filter((r) => !existing.has(r.code));
  console.log(`➕ ${toInsert.length} new, ${all.length - toInsert.length} already present`);

  const CHUNK = 1000;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const slice = toInsert.slice(i, i + CHUNK);
    const res = await prisma.location.createMany({
      data: slice.map((r) => ({
        code: r.code,
        name: r.name,
        locationType: r.type,
        up3: r.up3,
        address: r.address,
        latitude: r.lat,
        longitude: r.lng,
        status: true,
      })),
      skipDuplicates: true,
    });
    inserted += res.count;
    console.log(`   …${Math.min(i + CHUNK, toInsert.length)}/${toInsert.length}`);
  }

  console.log(`✅ Done. Inserted ${inserted} locations.`);
}

main()
  .catch((e) => {
    console.error('❌ seed-scada failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
