import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from '../src/utils/password';
import { seedGisE2E } from './seed-gis-e2e';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Create RTUPP
  const rtupp = await prisma.rTUPP.upsert({
    where: { code: 'JAKSEL' },
    update: {},
    create: {
      code: 'JAKSEL',
      name: 'UP3 Jakarta Selatan',
      region: 'DKI Jakarta',
      address: 'Jl. Radio Dalam Raya No. 12, Jakarta Selatan',
      phone: '021-1234567',
    },
  });

  console.log('✅ RTUPP created');

  // Create Team
  const team = await prisma.team.upsert({
    where: { code: 'TEAM-A' },
    update: {},
    create: {
      code: 'TEAM-A',
      name: 'Tim Operasional A',
      rtuppId: rtupp.id,
    },
  });

  console.log('✅ Team created');

  // Hash password (same for all users)
  const password = await hashPassword('password123');

  // Create Super Admin
  const superadmin = await prisma.user.upsert({
    where: { email: 'superadmin@voltreport.com' },
    update: {},
    create: {
      email: 'superadmin@voltreport.com',
      password: password,
      name: 'Super Administrator',
      role: UserRole.SUPERADMIN,
      phone: '081234567890',
      isActive: true,
    },
  });

  // Create Admin
  const admin = await prisma.user.upsert({
    where: { email: 'admin@voltreport.com' },
    update: {},
    create: {
      email: 'admin@voltreport.com',
      password: password,
      name: 'Administrator',
      role: UserRole.ADMIN,
      phone: '081234567891',
      rtuppId: rtupp.id,
      isActive: true,
    },
  });

  // Create Petugas
  const petugas = await prisma.user.upsert({
    where: { email: 'petugas@voltreport.com' },
    update: {},
    create: {
      email: 'petugas@voltreport.com',
      password: password,
      name: 'Budi Santoso',
      role: UserRole.PETUGAS,
      phone: '081234567892',
      rtuppId: rtupp.id,
      teamId: team.id,
      isActive: true,
    },
  });

  console.log('✅ Users created');
  console.log('');
  console.log('🔑 Default login credentials:');
  console.log('  Super Admin: superadmin@voltreport.com / password123');
  console.log('  Admin:       admin@voltreport.com / password123');
  console.log('  Petugas:     petugas@voltreport.com / password123');
  console.log('');

  // Update team leader
  await prisma.team.update({
    where: { id: team.id },
    data: { leaderId: petugas.id },
  });

  console.log('✅ Team leader assigned');

  // Seed Master Personil (replaces the old hardcoded MOCK_PERSONIL_MASTER)
  const personilSeed = [
    { nip: '99001', nama: 'Budi Santoso', jabatan: 'Pekerja' },
    { nip: '99002', nama: 'Hendra Pratama', jabatan: 'Mandor' },
    { nip: '99003', nama: 'Rizki Aditya', jabatan: 'Pekerja' },
    { nip: '99004', nama: 'Joko Susilo', jabatan: 'Pengawas' },
    { nip: '99005', nama: 'Maya Sari', jabatan: 'Pekerja' },
  ];
  for (const p of personilSeed) {
    await prisma.personil.upsert({
      where: { nip: p.nip },
      update: {},
      create: { ...p, rtuppId: rtupp.id, isActive: true },
    });
  }
  console.log('✅ Master Personil seeded');

  // ============================================================
  // V2 (Phase 1, additive) — Gardu-Centric seed
  // Source of truth: docs/05_ERD.md, docs/07_PERMISSION_MATRIX.md, docs/04.
  // Approved roles: SUPER_ADMIN, ADMIN, PETUGAS. Seeded into the new `roles`
  // table; legacy `users.role` enum is left intact (controller migration phase).
  // ============================================================

  // 1) Approved roles as canonical rows
  const roleDefs = [
    { name: 'SUPER_ADMIN', description: 'Full system access across all RTUPP' },
    { name: 'ADMIN', description: 'Manages master data & operations within own RTUPP' },
    { name: 'PETUGAS', description: 'Field officer: inspection / HAR data entry' },
  ];
  const roleIdByName: Record<string, string> = {};
  for (const r of roleDefs) {
    const row = await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });
    roleIdByName[r.name] = row.id;
  }
  console.log('✅ Roles seeded (SUPER_ADMIN, ADMIN, PETUGAS)');

  // 2) Bridge legacy enum role -> roles table (backfill users.roleId)
  const enumToRole: Record<string, string> = {
    SUPERADMIN: 'SUPER_ADMIN',
    ADMIN: 'ADMIN',
    ADMIN_RTUPP: 'ADMIN',
    PETUGAS: 'PETUGAS',
  };
  for (const u of [superadmin, admin, petugas]) {
    const target = enumToRole[u.role ?? 'PETUGAS'] ?? 'PETUGAS';
    await prisma.user.update({
      where: { id: u.id },
      data: { roleId: roleIdByName[target] },
    });
  }
  console.log('✅ users.roleId backfilled from legacy enum');

  // 3) Organization tree: Organization -> RTUPP -> UP3
  const org = await prisma.organization.upsert({
    where: { code: 'UID-JKT' },
    update: {},
    create: { code: 'UID-JKT', name: 'UID Jakarta Raya' },
  });
  await prisma.rTUPP.update({
    where: { id: rtupp.id },
    data: { organizationId: org.id },
  });
  await prisma.up3.upsert({
    where: { rtuppId_code: { rtuppId: rtupp.id, code: 'JAKSEL' } },
    update: {},
    create: { rtuppId: rtupp.id, code: 'JAKSEL', name: 'UP3 Jakarta Selatan' },
  });
  console.log('✅ Organization + UP3 seeded');

  // 4) Asset taxonomy (docs/04 — 5 categories, full type list)
  const taxonomy: Record<string, string[]> = {
    Power: ['Battery', 'Power Supply', 'Rectifier', 'Charger', 'MCB', 'Panel DC', 'Panel AC', 'UPS'],
    Communication: ['Modem', 'Router', 'Switch', 'Antena', 'SIM Card', 'Gateway'],
    Control: ['RTU', 'RC', 'SCADA Device', 'Controller', 'PLC', 'IO Module'],
    Infrastructure: ['Rack', 'Cabinet', 'Shelter', 'Grounding', 'Lightning Protection'],
    Supporting: ['Sensor', 'CCTV', 'Access Door', 'Cooling System', 'Monitoring Device'],
  };
  for (const [cat, types] of Object.entries(taxonomy)) {
    const category = await prisma.assetCategory.upsert({
      where: { name: cat },
      update: {},
      create: { name: cat },
    });
    for (const t of types) {
      await prisma.assetTypeRef.upsert({
        where: { assetCategoryId_name: { assetCategoryId: category.id, name: t } },
        update: {},
        create: { assetCategoryId: category.id, name: t },
      });
    }
  }
  console.log('✅ Asset taxonomy seeded (5 categories, 30 types)');

  // 5) Deterministic GIS fixtures for the Playwright E2E suite (geocoded sites
  // with a Wilayah/UP3 region + a "Gardu"-matching name). Idempotent.
  await seedGisE2E(prisma);

  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
