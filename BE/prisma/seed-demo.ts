/**
 * VoltHub — DEMO data seed (stakeholder presentation).
 *
 * Fills the database with realistic-but-fake operational data so the dashboard
 * (KPI, donut, sparkline, trend) comes alive for a PLN demo.
 *
 * SAFETY / REVERSIBILITY
 *  - 100% additive. Touches ONLY rows it owns, every one tagged with a `DEMO-`
 *    business code/id. Your real data and the production SQL template are never
 *    altered.
 *  - Idempotent: re-running updates the same DEMO rows (no duplicates).
 *  - Fully removable: `npm run seed:demo:clean` deletes exactly these rows.
 *
 * Run:   npm run seed:demo
 * Clean: npm run seed:demo:clean
 */
import {
  PrismaClient,
  LocationType,
  AssetType,
  AssetStatus,
  InspectionStatus,
  HarStatus,
  TicketPriority,
  TicketStatus,
  ReportStatus,
  UserRole,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const DEMO_PREFIX = 'DEMO-';

// ── Deterministic helpers (no randomness ⇒ stable re-runs) ───────────────────
const today = new Date();
const dateOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return dateOnly(d);
};
const pick = <T>(arr: T[], i: number): T => arr[i % arr.length];

// 12 Gardu around Jakarta Selatan (lat/lng real-ish for the GIS map).
const GARDU = [
  { code: 'DEMO-GD-001', name: 'GI Gandul', type: LocationType.GI, lat: -6.3735, lng: 106.7945 },
  { code: 'DEMO-GD-002', name: 'GH Cinere', type: LocationType.GH, lat: -6.3216, lng: 106.7890 },
  { code: 'DEMO-GD-003', name: 'Gardu Pondok Indah', type: LocationType.GARDU, lat: -6.2659, lng: 106.7840 },
  { code: 'DEMO-GD-004', name: 'Gardu Kebayoran', type: LocationType.GARDU, lat: -6.2440, lng: 106.7990 },
  { code: 'DEMO-GD-005', name: 'Gardu Senayan', type: LocationType.GARDU, lat: -6.2270, lng: 106.7990 },
  { code: 'DEMO-GD-006', name: 'Gardu Blok M', type: LocationType.GARDU, lat: -6.2440, lng: 106.7990 },
  { code: 'DEMO-GD-007', name: 'Gardu Tebet', type: LocationType.GARDU, lat: -6.2260, lng: 106.8570 },
  { code: 'DEMO-GD-008', name: 'Gardu Mampang', type: LocationType.GARDU, lat: -6.2430, lng: 106.8270 },
  { code: 'DEMO-GD-009', name: 'Gardu Cilandak', type: LocationType.GARDU, lat: -6.2880, lng: 106.7990 },
  { code: 'DEMO-GD-010', name: 'Gardu Pasar Minggu', type: LocationType.GARDU, lat: -6.2840, lng: 106.8440 },
  { code: 'DEMO-GD-011', name: 'Gardu Lebak Bulus', type: LocationType.GARDU, lat: -6.2890, lng: 106.7750 },
  { code: 'DEMO-GD-012', name: 'Gardu Fatmawati', type: LocationType.GARDU, lat: -6.2930, lng: 106.7960 },
];

const ASSET_TYPES = [
  AssetType.RTU,
  AssetType.RECTIFIER,
  AssetType.BATTERY_BANK,
  AssetType.MODEM,
  AssetType.ROUTER,
];
const ASSET_BRANDS = ['Schneider', 'Siemens', 'ABB', 'Hitachi', 'Tadiran', 'Cisco', 'Huawei'];
const ASSET_STATUS_CYCLE = [
  AssetStatus.ACTIVE, AssetStatus.ACTIVE, AssetStatus.ACTIVE, AssetStatus.ACTIVE,
  AssetStatus.WARNING, AssetStatus.ACTIVE, AssetStatus.DAMAGED, AssetStatus.ACTIVE,
  AssetStatus.ACTIVE, AssetStatus.RETIRED,
];

async function resolveUsers() {
  // Prefer the canonical seed users; fall back to creating a demo petugas/admin
  // so this script is self-contained even on a fresh DB.
  let petugas = await prisma.user.findFirst({ where: { role: UserRole.PETUGAS } });
  let admin = await prisma.user.findFirst({ where: { role: { in: [UserRole.ADMIN, UserRole.SUPERADMIN] } } });

  if (!petugas || !admin) {
    const password = await bcrypt.hash('password123', 10);
    if (!admin) {
      admin = await prisma.user.upsert({
        where: { email: 'demo.admin@voltreport.com' },
        update: {},
        create: { email: 'demo.admin@voltreport.com', password, name: 'Demo Admin', role: UserRole.ADMIN, isActive: true },
      });
    }
    if (!petugas) {
      petugas = await prisma.user.upsert({
        where: { email: 'demo.petugas@voltreport.com' },
        update: {},
        create: { email: 'demo.petugas@voltreport.com', password, name: 'Demo Petugas', role: UserRole.PETUGAS, isActive: true },
      });
    }
  }
  return { petugas, admin };
}

/** Remove transient demo children that lack a natural unique key (re-created below). */
async function cleanTransient(demoLocationIds: string[]) {
  if (demoLocationIds.length === 0) return;
  const insp = await prisma.inspection.findMany({ where: { locationId: { in: demoLocationIds } }, select: { id: true } });
  const inspIds = insp.map((i) => i.id);
  if (inspIds.length) {
    await prisma.inspectionFinding.deleteMany({ where: { inspectionId: { in: inspIds } } });
    await prisma.inspection.deleteMany({ where: { id: { in: inspIds } } });
  }
  const har = await prisma.harReport.findMany({ where: { locationId: { in: demoLocationIds } }, select: { id: true } });
  const harIds = har.map((h) => h.id);
  if (harIds.length) {
    await prisma.harDetail.deleteMany({ where: { harReportId: { in: harIds } } });
    await prisma.harReport.deleteMany({ where: { id: { in: harIds } } });
  }
}

async function main() {
  console.log('🌱 Seeding DEMO data (tagged "DEMO-", fully reversible)…');
  const { petugas, admin } = await resolveUsers();

  // ── 1) Gardu (locations) + 2) Penyulang (feeders) + 3) Assets ──────────────
  const locationByCode = new Map<string, { id: string; name: string }>();
  const assetsByLocation = new Map<string, { id: string; type: AssetType }[]>();

  for (let g = 0; g < GARDU.length; g++) {
    const gd = GARDU[g];
    const loc = await prisma.location.upsert({
      where: { code: gd.code },
      update: { name: gd.name, locationType: gd.type, latitude: gd.lat, longitude: gd.lng, status: true },
      create: {
        code: gd.code,
        name: gd.name,
        locationType: gd.type,
        up3: 'UP3 Jakarta Selatan',
        address: `Jl. ${gd.name.replace(/^G[IH]?\s|Gardu\s/, '')}, Jakarta Selatan`,
        latitude: gd.lat,
        longitude: gd.lng,
        status: true,
      },
    });
    locationByCode.set(gd.code, { id: loc.id, name: loc.name });

    // 1–2 feeders per gardu.
    const feederCount = 1 + (g % 2);
    const feederIds: string[] = [];
    for (let f = 0; f < feederCount; f++) {
      const feederCode = `DEMO-PNY-${String(g + 1).padStart(2, '0')}${f + 1}`;
      const feeder = await prisma.feeder.upsert({
        where: { locationId_feederCode: { locationId: loc.id, feederCode } },
        update: {},
        create: {
          locationId: loc.id,
          feederCode,
          feederName: `Penyulang ${gd.name.replace(/^G[IH]?\s|Gardu\s/, '')} ${f + 1}`,
        },
      });
      feederIds.push(feeder.id);
    }

    // 4–6 assets per gardu.
    const assetCount = 4 + (g % 3);
    const created: { id: string; type: AssetType }[] = [];
    for (let a = 0; a < assetCount; a++) {
      const type = pick(ASSET_TYPES, a);
      const assetCode = `DEMO-AST-${String(g + 1).padStart(2, '0')}${String(a + 1).padStart(2, '0')}`;
      const asset = await prisma.asset.upsert({
        where: { assetCode },
        update: { status: pick(ASSET_STATUS_CYCLE, g + a) },
        create: {
          locationId: loc.id,
          feederId: feederIds[a % feederIds.length],
          assetType: type,
          assetCode,
          assetName: `${type.replace('_', ' ')} ${gd.name.replace(/^G[IH]?\s|Gardu\s/, '')}`,
          brand: pick(ASSET_BRANDS, g + a),
          model: `MDL-${1000 + g * 10 + a}`,
          tahunOperasi: 2016 + ((g + a) % 8),
          status: pick(ASSET_STATUS_CYCLE, g + a),
        },
      });
      created.push({ id: asset.id, type });
    }
    assetsByLocation.set(loc.id, created);
  }
  console.log(`✅ ${GARDU.length} Gardu, feeders & assets`);

  const demoLocationIds = [...locationByCode.values()].map((l) => l.id);
  await cleanTransient(demoLocationIds);

  // ── 4) Inspections (+ findings) across the last 30 days ────────────────────
  const inspectionStatuses = [InspectionStatus.NORMAL, InspectionStatus.WARNING, InspectionStatus.CRITICAL];
  let inspCount = 0;
  for (let i = 0; i < 20; i++) {
    const loc = [...locationByCode.values()][i % locationByCode.size];
    const assets = assetsByLocation.get(loc.id) ?? [];
    const inspection = await prisma.inspection.create({
      data: {
        locationId: loc.id,
        inspectionDate: daysAgo((i * 3) % 28), // many fall in the current month
        inspectorId: petugas.id,
        notes: `Inspeksi rutin ${loc.name}`,
        findings: {
          create: assets.slice(0, 2 + (i % 3)).map((as, k) => ({
            assetId: as.id,
            status: pick(inspectionStatuses, i + k),
            finding: pick(
              ['Kondisi normal', 'Indikator tegangan turun', 'Koneksi modem intermittent', 'Suhu rectifier tinggi'],
              i + k,
            ),
            recommendation: pick(['Tidak ada tindakan', 'Monitor berkala', 'Jadwalkan HAR', 'Ganti komponen'], i + k),
          })),
        },
      },
    });
    inspCount += 1;
    void inspection;
  }
  console.log(`✅ ${inspCount} Inspeksi (+ temuan)`);

  // ── 5) HAR reports (+ details) this month ──────────────────────────────────
  const harStatuses = [HarStatus.NORMAL, HarStatus.WARNING, HarStatus.CRITICAL, HarStatus.OFFLINE];
  let harCount = 0;
  for (let h = 0; h < 14; h++) {
    const loc = [...locationByCode.values()][h % locationByCode.size];
    const assets = assetsByLocation.get(loc.id) ?? [];
    const slice = assets.slice(0, 2 + (h % 2));
    if (slice.length === 0) continue;
    await prisma.harReport.create({
      data: {
        locationId: loc.id,
        reportDate: daysAgo(h % 25),
        details: {
          create: slice.map((as, k) => ({
            assetId: as.id,
            status: pick(harStatuses, h + k),
            analysis: pick(['Pengukuran dalam batas normal', 'Tegangan baterai menurun', 'Rectifier perlu kalibrasi'], h + k),
            notes: `HAR ${as.type}`,
          })),
        },
      },
    });
    harCount += 1;
  }
  console.log(`✅ ${harCount} HAR (+ detail)`);

  // ── 6) Tickets (Work Orders) — mixed status & priority ─────────────────────
  const priorities = [TicketPriority.LOW, TicketPriority.MEDIUM, TicketPriority.HIGH, TicketPriority.CRITICAL];
  const statuses = [
    TicketStatus.OPEN, TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS,
    TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.OPEN, TicketStatus.CLOSED,
  ];
  const categories = ['Gangguan RTU', 'Baterai Lemah', 'Modem Offline', 'Rectifier', 'Preventive'];
  for (let t = 0; t < 18; t++) {
    const loc = [...locationByCode.values()][t % locationByCode.size];
    const status = pick(statuses, t);
    const opened = daysAgo((t * 2) % 30);
    const closed = status === TicketStatus.RESOLVED || status === TicketStatus.CLOSED ? daysAgo((t * 2) % 30 > 3 ? (t % 3) : 0) : null;
    await prisma.ticket.upsert({
      where: { ticketNumber: `DEMO-WO-${String(t + 1).padStart(4, '0')}` },
      update: { status, priority: pick(priorities, t) },
      create: {
        locationId: loc.id,
        ticketNumber: `DEMO-WO-${String(t + 1).padStart(4, '0')}`,
        category: pick(categories, t),
        priority: pick(priorities, t),
        status,
        assignedTo: t % 2 === 0 ? petugas.id : null,
        notes: `Work order ${pick(categories, t)} di ${loc.name}`,
        openedAt: opened,
        closedAt: closed,
      },
    });
  }
  console.log('✅ 18 Work Order');

  // ── 7) Performance daily (last 30 days, a few gardu) → ~90% availability ────
  const perfLocations = demoLocationIds.slice(0, 8);
  let perfRows = 0;
  for (const locId of perfLocations) {
    for (let d = 0; d < 30; d++) {
      const ok = (d + perfRows) % 10 !== 0; // ~90% berhasil
      await prisma.performanceDaily.upsert({
        where: { locationId_performanceDate: { locationId: locId, performanceDate: daysAgo(d) } },
        update: { performanceStatus: ok ? 1 : 0, score: ok ? 82 + (d % 17) : 40 + (d % 20) },
        create: {
          locationId: locId,
          performanceDate: daysAgo(d),
          performanceStatus: ok ? 1 : 0,
          score: ok ? 82 + (d % 17) : 40 + (d % 20),
        },
      });
      perfRows += 1;
    }
  }
  console.log(`✅ ${perfRows} baris Performance harian`);

  // ── 8) Laporan Awal & Akhir (drives the KPI Dashboard) ─────────────────────
  const reportStatuses = [ReportStatus.APPROVED, ReportStatus.PENDING, ReportStatus.APPROVED, ReportStatus.REJECTED, ReportStatus.REVISED, ReportStatus.DRAFT];
  const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
  for (let i = 0; i < 15; i++) {
    const loc = [...locationByCode.values()][i % locationByCode.size];
    const tgl = daysAgo((i * 2) % 28);
    const status = pick(reportStatuses, i);
    await prisma.laporanAwal.upsert({
      where: { reportId: `DEMO-LA-${String(i + 1).padStart(3, '0')}` },
      update: { status },
      create: {
        reportId: `DEMO-LA-${String(i + 1).padStart(3, '0')}`,
        hari: pick(HARI, tgl.getDay()),
        tanggal: tgl,
        nomorSPJ: `SPJ/DEMO/${String(i + 1).padStart(3, '0')}`,
        up3: 'UP3 Jakarta Selatan',
        pekerjaan: `Pemeliharaan ${loc.name}`,
        lokasiGardu: loc.name,
        pelaksana: 'Tim Operasional A',
        penanggungJawab: 'Hendra Pratama',
        pengawasPekerjaan: 'Joko Susilo',
        potensiBahaya: 'Tegangan tinggi, bekerja di ketinggian',
        pengendalianRisiko: 'Gunakan APD lengkap, LOTO, briefing K3',
        jumlahPersonil: 3,
        personilSnapshot: [
          { nama: 'Budi Santoso', jabatan: 'Pekerja' },
          { nama: 'Rizki Aditya', jabatan: 'Pekerja' },
          { nama: 'Joko Susilo', jabatan: 'Pengawas' },
        ],
        status,
        submittedAt: status === ReportStatus.DRAFT ? null : tgl,
        approvedAt: status === ReportStatus.APPROVED ? tgl : null,
        createdById: petugas.id,
        approvedById: status === ReportStatus.APPROVED ? admin.id : null,
      },
    });
  }
  for (let i = 0; i < 12; i++) {
    const loc = [...locationByCode.values()][i % locationByCode.size];
    const tgl = daysAgo((i * 2) % 26);
    const status = pick(reportStatuses, i + 1);
    await prisma.laporanAkhir.upsert({
      where: { reportId: `DEMO-LK-${String(i + 1).padStart(3, '0')}` },
      update: { status },
      create: {
        reportId: `DEMO-LK-${String(i + 1).padStart(3, '0')}`,
        nomorSPJ: `SPJ/DEMO/${String(i + 1).padStart(3, '0')}`,
        tanggalSelesai: tgl,
        up3: 'UP3 Jakarta Selatan',
        pekerjaan: `Pemeliharaan ${loc.name}`,
        namaAset: `RTU ${loc.name}`,
        gardu: loc.name,
        detailLangkah: '1) Isolasi 2) Pemeriksaan 3) Penggantian komponen 4) Pengujian 5) Normalisasi',
        hasilTahananIsolasi: `${50 + (i % 40)} MΩ`,
        hasilPengukuranBeban: `${30 + (i % 50)} A`,
        durasiPekerjaan: `${2 + (i % 5)} jam`,
        pelaksana: 'Tim Operasional A',
        pengawas: 'Joko Susilo',
        status,
        approvedAt: status === ReportStatus.APPROVED ? tgl : null,
        createdById: petugas.id,
        approvedById: status === ReportStatus.APPROVED ? admin.id : null,
      },
    });
  }
  console.log('✅ 15 Laporan Awal + 12 Laporan Akhir');

  console.log('\n🎉 DEMO seed selesai. Dashboard siap untuk presentasi.');
  console.log('   Hapus kapan saja dengan: npm run seed:demo:clean');
}

main()
  .catch((e) => {
    console.error('❌ DEMO seed gagal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
