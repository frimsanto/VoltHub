/**
 * Deterministic GIS fixtures for the Playwright E2E suite (e2e/gis.spec.ts).
 *
 * The two previously-skipped GIS tests need REAL, on-map seed data to assert
 * against rather than self-skipping:
 *   1. "filters by Wilayah when regions are available" — needs ≥1 geocoded site
 *      whose `up3` (Wilayah/UP3 region) is non-null, so the Wilayah <select>
 *      renders. The FE derives the region list from the loaded sites
 *      (GisMap → onRegions), there is no regions endpoint.
 *   2. "opens a site detail panel via search" — needs ≥1 geocoded site whose
 *      name matches the literal search term "Gardu", so the search query flies
 *      to it and auto-opens the detail panel.
 *
 * Determinism guarantees:
 *   - Sites are UPSERTED by a fixed `code` (re-runnable, no duplicates).
 *   - They are attached to the SAME rtuppId the PETUGAS test account is scoped
 *     to, because GIS is tenant-scoped (fail-closed) and the GIS specs run as
 *     PETUGAS. If the petugas account has no RTUPP yet (fresh DB), we find or
 *     create one and pin PETUGAS + ADMIN to it.
 *   - Coordinates are fixed (central Jakarta), so the initial fitBounds always
 *     frames them and the viewport-bound feature query returns them.
 *
 * Safe to run after either seed path (`seed.ts` or `reset-roles.ts`) — it only
 * needs the petugas@voltreport.com account to exist.
 *
 * Run standalone:  npm run seed:gis-e2e
 */
import { PrismaClient, LocationType } from '@prisma/client';

/** Fixed Wilayah/UP3 label asserted by the Wilayah-filter test. */
const E2E_UP3 = 'UP3 Jakarta Pusat (E2E)';

/**
 * Three geocoded sites around Monas, central Jakarta. At least one name starts
 * with "Gardu" so the search test matches. All share the E2E_UP3 region.
 */
const SITES: {
  code: string;
  name: string;
  locationType: LocationType;
  latitude: number;
  longitude: number;
}[] = [
  {
    code: 'E2E-GD-001',
    name: 'Gardu Distribusi Monas (E2E)',
    locationType: LocationType.GARDU,
    latitude: -6.175392,
    longitude: 106.827153,
  },
  {
    code: 'E2E-GD-002',
    name: 'Gardu Distribusi Thamrin (E2E)',
    locationType: LocationType.GARDU,
    latitude: -6.193125,
    longitude: 106.82326,
  },
  {
    code: 'E2E-GI-001',
    name: 'Gardu Induk Gambir (E2E)',
    locationType: LocationType.GI,
    latitude: -6.166667,
    longitude: 106.816667,
  },
];

/**
 * Seed the GIS E2E fixtures. Accepts an existing client so callers (seed.ts,
 * reset-roles.ts) can reuse their connection; creates its own when run as a CLI.
 */
export async function seedGisE2E(prisma: PrismaClient): Promise<void> {
  // Resolve the tenant the PETUGAS spec runs under. GIS is fail-closed, so the
  // fixtures MUST share the petugas account's rtuppId to be visible.
  const petugas = await prisma.user.findUnique({
    where: { email: 'petugas@voltreport.com' },
    select: { id: true, rtuppId: true },
  });
  if (!petugas) {
    console.warn(
      '⚠️  GIS E2E seed skipped: petugas@voltreport.com not found (run `npm run seed` or `npm run reset:roles` first).'
    );
    return;
  }

  let rtuppId = petugas.rtuppId;
  if (!rtuppId) {
    // Fresh DB with no RTUPP scoping yet — find or create one and pin the
    // scoped test accounts to it so their GIS reads resolve.
    const rtupp =
      (await prisma.rTUPP.findFirst({ select: { id: true } })) ??
      (await prisma.rTUPP.create({
        data: { code: 'RTUPP-E2E', name: 'RTUPP E2E', region: 'Jakarta', isActive: true },
        select: { id: true },
      }));
    rtuppId = rtupp.id;
    await prisma.user.updateMany({
      where: { email: { in: ['petugas@voltreport.com', 'admin@voltreport.com'] } },
      data: { rtuppId },
    });
    console.log(`🔧 Scoped PETUGAS/ADMIN test accounts to RTUPP ${rtuppId}`);
  }

  for (const s of SITES) {
    await prisma.location.upsert({
      where: { code: s.code },
      update: {
        name: s.name,
        locationType: s.locationType,
        up3: E2E_UP3,
        latitude: s.latitude,
        longitude: s.longitude,
        status: true,
        deletedAt: null,
        rtuppId,
      },
      create: {
        code: s.code,
        name: s.name,
        locationType: s.locationType,
        up3: E2E_UP3,
        latitude: s.latitude,
        longitude: s.longitude,
        status: true,
        rtuppId,
      },
    });
  }
  console.log(`✅ GIS E2E fixtures seeded: ${SITES.length} geocoded sites under "${E2E_UP3}"`);
}

// CLI entry — only runs when invoked directly (not when imported by a seeder).
const invokedDirectly =
  typeof process.argv[1] === 'string' && /seed-gis-e2e\.ts$/.test(process.argv[1].replace(/\\/g, '/'));

if (invokedDirectly) {
  const prisma = new PrismaClient();
  seedGisE2E(prisma)
    .catch((e) => {
      console.error('❌ GIS E2E seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
