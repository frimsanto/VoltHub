/**
 * RBAC test reset — wipes all existing user accounts and creates exactly ONE
 * account per canonical VoltHub role (MASTER / MANAGER / ADMIN / PETUGAS), each
 * with a known password, so role-based access can be tested cleanly.
 *
 * SAFE deletion: several tables hold a REQUIRED foreign key to users with no
 * cascade (laporan_awal/akhir.createdById, attachments.uploadedById,
 * report_validations.validatorId, activity_logs.userId, inspections.inspectorId).
 * A raw delete would violate those constraints, so we first REASSIGN every
 * user reference from the soon-to-be-deleted accounts onto the new MASTER
 * account (or NULL for optional links), then delete. Cascade-linked rows
 * (device_tokens, refresh_tokens, notifications) are removed automatically.
 *
 * Re-runnable: the 4 accounts are upserted by email.
 *
 * Run:  npm run reset:roles
 */
import { PrismaClient, UserRole } from '@prisma/client';
import { hashPassword } from '../src/utils/password';
import { seedGisE2E } from './seed-gis-e2e';

const prisma = new PrismaClient();

// Shared known password for every test account.
const PASSWORD = 'Volthub123!';

const ACCOUNTS: { email: string; name: string; role: UserRole; scoped: boolean }[] = [
  { email: 'master@voltreport.com', name: 'Master Test', role: 'MASTER', scoped: false },
  { email: 'manager@voltreport.com', name: 'Manager Test', role: 'MANAGER', scoped: false },
  { email: 'admin@voltreport.com', name: 'Admin Test', role: 'ADMIN', scoped: true },
  { email: 'petugas@voltreport.com', name: 'Petugas Test', role: 'PETUGAS', scoped: true },
];

async function main() {
  const passwordHash = await hashPassword(PASSWORD);

  // 0) Ensure the DB role enum matches schema.prisma. Older dev DBs predate the
  // 4-role migration and lack MASTER/MANAGER, which makes a MANAGER account
  // impossible to insert. This ALTER is additive (keeps every legacy value) and
  // idempotent — safe to re-run.
  await prisma.$executeRawUnsafe(
    "ALTER TABLE `users` MODIFY COLUMN `role` " +
      "ENUM('MASTER','MANAGER','SUPERADMIN','ADMIN','ADMIN_RTUPP','PETUGAS') NULL DEFAULT 'PETUGAS'"
  );
  console.log('🔧 Enum users.role disiapkan (MASTER/MANAGER ditambahkan bila belum ada)');

  // RTUPP/Team to scope ADMIN & PETUGAS (first available, if any).
  const rtupp = await prisma.rTUPP.findFirst({ select: { id: true, name: true } });
  const team = await prisma.team.findFirst({ select: { id: true, name: true } });
  console.log(`📍 Scope: RTUPP=${rtupp?.name ?? '—'} Team=${team?.name ?? '—'}`);

  // 1) Upsert the 4 canonical accounts.
  const newIds: string[] = [];
  let master!: { id: string };
  for (const a of ACCOUNTS) {
    const data = {
      name: a.name,
      password: passwordHash,
      role: a.role,
      isActive: true,
      mustChangePassword: false,
      rtuppId: a.scoped ? (rtupp?.id ?? null) : null,
      teamId: a.scoped && a.role === 'PETUGAS' ? (team?.id ?? null) : null,
    };
    const user = await prisma.user.upsert({
      where: { email: a.email },
      update: data,
      create: { email: a.email, ...data },
      select: { id: true, role: true },
    });
    newIds.push(user.id);
    if (a.role === 'MASTER') master = user;
    console.log(`  ✓ ${a.role.padEnd(8)} ${a.email}`);
  }

  // 2) Identify every OTHER user (to be removed).
  const old = await prisma.user.findMany({
    where: { id: { notIn: newIds } },
    select: { id: true },
  });
  const oldIds = old.map((u) => u.id);
  console.log(`\n🧹 ${oldIds.length} akun lama akan dihapus`);

  if (oldIds.length > 0) {
    const inOld = { in: oldIds };
    const toMaster = master.id;

    // 3) Reassign required references → MASTER; null optional ones.
    await prisma.$transaction([
      // laporan_awal
      prisma.laporanAwal.updateMany({ where: { createdById: inOld }, data: { createdById: toMaster } }),
      prisma.laporanAwal.updateMany({ where: { updatedById: inOld }, data: { updatedById: null } }),
      prisma.laporanAwal.updateMany({ where: { approvedById: inOld }, data: { approvedById: null } }),
      prisma.laporanAwal.updateMany({ where: { rejectedById: inOld }, data: { rejectedById: null } }),
      // laporan_akhir
      prisma.laporanAkhir.updateMany({ where: { createdById: inOld }, data: { createdById: toMaster } }),
      prisma.laporanAkhir.updateMany({ where: { updatedById: inOld }, data: { updatedById: null } }),
      prisma.laporanAkhir.updateMany({ where: { approvedById: inOld }, data: { approvedById: null } }),
      prisma.laporanAkhir.updateMany({ where: { rejectedById: inOld }, data: { rejectedById: null } }),
      // other required FKs → MASTER
      prisma.attachment.updateMany({ where: { uploadedById: inOld }, data: { uploadedById: toMaster } }),
      prisma.reportValidation.updateMany({ where: { validatorId: inOld }, data: { validatorId: toMaster } }),
      prisma.activityLog.updateMany({ where: { userId: inOld }, data: { userId: toMaster } }),
      prisma.inspection.updateMany({ where: { inspectorId: inOld }, data: { inspectorId: toMaster } }),
      // optional FKs → NULL
      prisma.team.updateMany({ where: { leaderId: inOld }, data: { leaderId: null } }),
      prisma.ticket.updateMany({ where: { assignedTo: inOld }, data: { assignedTo: null } }),
      prisma.auditLog.updateMany({ where: { performedBy: inOld }, data: { performedBy: null } }),
      prisma.workflowTransition.updateMany({ where: { performedBy: inOld }, data: { performedBy: null } }),
    ]);

    // 4) Delete old users (device_tokens / refresh_tokens / notifications cascade).
    const del = await prisma.user.deleteMany({ where: { id: inOld } });
    console.log(`   …${del.count} akun lama dihapus`);
  }

  // Deterministic GIS fixtures (geocoded sites + Wilayah/UP3) so the GIS E2E
  // specs have real data to assert against. Pins these accounts' RTUPP if unset.
  await seedGisE2E(prisma);

  const total = await prisma.user.count();
  console.log(`\n✅ Selesai. Total user sekarang: ${total}`);
  console.log(`\n🔑 Kredensial (password sama untuk semua):  ${PASSWORD}`);
  for (const a of ACCOUNTS) console.log(`   ${a.role.padEnd(8)}  ${a.email}`);
}

main()
  .catch((e) => {
    console.error('❌ reset-roles failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
