/**
 * DB CLEANUP + USER RESET (VoltReport)
 * ------------------------------------------------------------------
 * Menghapus HANYA data uji/transaksional, lalu mereset user ke 17 akun fresh.
 * MASTER (locations/feeders/assets/rtupps/up3s/organizations/roles/scada_gardu/
 * performance_daily, asset_categories/asset_types, communication_media,
 * telemetry_points/values, personil) DIPERTAHANKAN.
 * system-bot@voltreport.local DIPERTAHANKAN (id utuh, ~28k referensi master).
 *
 * ADITIF terhadap skema: TIDAK mengubah struktur tabel/kolom.
 * Transaksional + idempotent + guarded (butuh CONFIRM=YES).
 *
 * Keputusan (di-ACC user 2026-07-04):
 *  - Hapus tabel legacy inspections/inspection_findings/har_reports/har_details.
 *  - performance_daily KEEP.
 *  - Buat 10 teams (Tim A/B x RTUPP-1..5) lalu isi teamId petugas.
 *  - Users: DROP & RECREATE (uuid baru), system-bot dikecualikan.
 *
 * Jalankan:  CONFIRM=YES npx tsx prisma/cleanup-reset.ts
 */
import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const PASSWORD = 'Volthub123!';
const BOT_EMAIL = 'system-bot@voltreport.local';

// Tabel KEEP untuk verifikasi "tak berubah" sebelum & sesudah.
const KEEP_TABLES = [
  'locations', 'feeders', 'assets', 'asset_categories', 'asset_types',
  'asset_sim_cards', 'bays', 'communication_media', 'scada_gardu', 'rtupps',
  'up3s', 'organizations', 'roles', 'site_geometries', 'telemetry_points',
  'telemetry_values', 'performance_daily', 'personil',
];

// Hitung baris. `db` bisa PrismaClient ATAU tx client (agar snapshot after
// dibaca di dalam transaksi yang sama → melihat state uncommitted).
async function countRaw(db: any, t: string): Promise<number> {
  const r: any = await db.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${t}\``);
  return Number(r[0].c);
}

async function snapshotKeep(db: any, label: string) {
  const snap: Record<string, number> = {};
  for (const t of KEEP_TABLES) snap[t] = await countRaw(db, t);
  console.log(`\n📸 KEEP snapshot [${label}]:`);
  for (const t of KEEP_TABLES) console.log(`   ${t.padEnd(22)} ${snap[t]}`);
  return snap;
}

const RCODES = ['RTUPP-1', 'RTUPP-2', 'RTUPP-3', 'RTUPP-4', 'RTUPP-5'];

async function main() {
  if (process.env.CONFIRM !== 'YES') {
    throw new Error('Guard: set CONFIRM=YES untuk menjalankan. Batal.');
  }

  // ── PRA-FLIGHT (di luar transaksi; hanya baca + DDL idempotent) ──────────
  // Guard system-bot: bila tak ada → BATAL TOTAL, tak menyentuh apa pun.
  const bot = await prisma.user.findUnique({ where: { email: BOT_EMAIL }, select: { id: true } });
  if (!bot) throw new Error(`system-bot (${BOT_EMAIL}) TIDAK ditemukan — BATAL TOTAL (tak ada user dihapus).`);
  console.log(`🤖 system-bot ditemukan (dipertahankan): ${bot.id}`);

  // Guard master data: semua RTUPP target harus ada.
  const rtupps = await prisma.rTUPP.findMany({ select: { id: true, code: true } });
  const rtuppByCode = new Map(rtupps.map((r) => [r.code, r.id]));
  for (const rc of RCODES) if (!rtuppByCode.get(rc)) throw new Error(`RTUPP ${rc} tak ditemukan — BATAL.`);

  // Snapshot KEEP SEBELUM (baca murni, sebelum transaksi).
  const before = await snapshotKeep(prisma, 'SEBELUM');

  // DDL (implicit commit — tak bisa di dalam tx). Idempotent & aditif: pastikan
  // enum users.role memuat MASTER/MANAGER. No-op bila sudah ada.
  await prisma.$executeRawUnsafe(
    "ALTER TABLE `users` MODIFY COLUMN `role` " +
      "ENUM('MASTER','MANAGER','SUPERADMIN','ADMIN','ADMIN_RTUPP','PETUGAS') NULL DEFAULT 'PETUGAS'"
  );

  const hash = bcrypt.hashSync(PASSWORD, bcrypt.genSaltSync(10));

  // ── TRANSAKSI TUNGGAL (all-or-nothing) ──────────────────────────────────
  // Semua delete + user reset + teams + create + cek drift KEEP di dalam SATU
  // interactive transaction. Bila drift KEEP terdeteksi → throw → ROLLBACK total.
  const deletedCounts: Record<string, number> = {};
  const result = await prisma.$transaction(async (tx) => {
    console.log('\n🧹 Menghapus data transaksional…');
    // A. leaf / attachment / log
    deletedCounts.work_order_attachments = (await tx.workOrderAttachment.deleteMany({})).count;
    deletedCounts.laporan_gi_attachments = (await tx.laporanGiAttachment.deleteMany({})).count;
    deletedCounts.laporan_inspeksi_gh_attachments = (await tx.laporanInspeksiGhAttachment.deleteMany({})).count;
    deletedCounts.laporan_har_gh_attachments = (await tx.laporanHarGhAttachment.deleteMany({})).count;
    deletedCounts.inspection_photos = (await tx.inspectionPhoto.deleteMany({})).count;
    deletedCounts.inspection_findings = (await tx.inspectionFinding.deleteMany({})).count;
    deletedCounts.inspections = (await tx.inspection.deleteMany({})).count;
    deletedCounts.har_details = (await tx.harDetail.deleteMany({})).count;
    deletedCounts.har_reports = (await tx.harReport.deleteMany({})).count;
    deletedCounts.notification_deliveries = (await tx.notificationDelivery.deleteMany({})).count;
    deletedCounts.notifications = (await tx.notification.deleteMany({})).count;
    deletedCounts.report_downloads = (await tx.reportDownload.deleteMany({})).count;
    deletedCounts.report_signatures = (await tx.reportSignature.deleteMany({})).count;
    deletedCounts.generated_reports = (await tx.generatedReport.deleteMany({})).count;
    deletedCounts.workflow_transitions = (await tx.workflowTransition.deleteMany({})).count;
    deletedCounts.workflow_instances = (await tx.workflowInstance.deleteMany({})).count;
    deletedCounts.import_errors = (await tx.importError.deleteMany({})).count;
    deletedCounts.import_jobs = (await tx.importJob.deleteMany({})).count;
    deletedCounts.ai_feedback = (await tx.aiFeedback.deleteMany({})).count;
    deletedCounts.ai_conversations = (await tx.aiConversation.deleteMany({})).count;
    deletedCounts.report_validations = (await tx.reportValidation.deleteMany({})).count;
    deletedCounts.attachments = (await tx.attachment.deleteMany({})).count;
    deletedCounts.activity_logs = (await tx.activityLog.deleteMany({})).count;
    // B. laporan yang refer work_orders (Restrict) — sebelum work_orders
    deletedCounts.laporan_gi = (await tx.laporanGi.deleteMany({})).count;
    deletedCounts.laporan_har_gi = (await tx.laporanHarGi.deleteMany({})).count;
    deletedCounts.laporan_inspeksi_gh = (await tx.laporanInspeksiGh.deleteMany({})).count;
    deletedCounts.laporan_har_gh = (await tx.laporanHarGh.deleteMany({})).count;
    deletedCounts.laporan_akhir = (await tx.laporanAkhir.deleteMany({})).count;
    deletedCounts.laporan_awal = (await tx.laporanAwal.deleteMany({})).count;
    // C. work_orders
    deletedCounts.work_orders = (await tx.workOrder.deleteMany({})).count;
    // D. sisa transaksional yg refer users
    deletedCounts.audit_logs = (await tx.auditLog.deleteMany({})).count;
    deletedCounts.tickets = (await tx.ticket.deleteMany({})).count;
    deletedCounts.device_tokens = (await tx.deviceToken.deleteMany({})).count;
    deletedCounts.refresh_tokens = (await tx.refreshToken.deleteMany({})).count;
    deletedCounts.idempotency_keys = (await tx.idempotencyKey.deleteMany({})).count;

    // Hapus semua user KECUALI system-bot.
    const delUsers = (await tx.user.deleteMany({ where: { email: { not: BOT_EMAIL } } })).count;
    console.log(`🧹 ${delUsers} user (non-bot) dihapus`);

    // Buat 10 teams (Tim A/B x RTUPP-1..5), upsert by code.
    const teamIdByKey = new Map<string, string>();
    for (const rc of RCODES) {
      const n = rc.split('-')[1];
      for (const tim of ['A', 'B'] as const) {
        const code = `TIM-${tim}-RTUPP${n}`;
        const team = await tx.team.upsert({
          where: { code },
          update: { name: `Tim ${tim} RTUPP ${n}`, rtuppId: rtuppByCode.get(rc)!, isActive: true },
          create: { name: `Tim ${tim} RTUPP ${n}`, code, rtuppId: rtuppByCode.get(rc)!, isActive: true },
          select: { id: true },
        });
        teamIdByKey.set(`${rc}|${tim}`, team.id);
      }
    }
    console.log(`👥 ${teamIdByKey.size} teams siap`);

    // Buat 17 akun fresh.
    type Acc = { email: string; name: string; role: UserRole; rtuppCode?: string; tim?: 'A' | 'B' };
    const accounts: Acc[] = [
      { email: 'master@voltreport.com', name: 'Master Utama', role: 'MASTER' },
      { email: 'manager@voltreport.com', name: 'Manager Utama', role: 'MANAGER' },
    ];
    for (const rc of RCODES) {
      const n = rc.split('-')[1];
      accounts.push({ email: `admin.rtupp${n}@voltreport.com`, name: `Admin RTUPP ${n}`, role: 'ADMIN', rtuppCode: rc });
    }
    for (const rc of RCODES) {
      const n = rc.split('-')[1];
      accounts.push({ email: `petugas.rtupp${n}.tima@voltreport.com`, name: `Petugas RTUPP ${n} Tim A`, role: 'PETUGAS', rtuppCode: rc, tim: 'A' });
      accounts.push({ email: `petugas.rtupp${n}.timb@voltreport.com`, name: `Petugas RTUPP ${n} Tim B`, role: 'PETUGAS', rtuppCode: rc, tim: 'B' });
    }
    for (const a of accounts) {
      await tx.user.create({
        data: {
          email: a.email, name: a.name, password: hash, role: a.role,
          isActive: true, mustChangePassword: false,
          rtuppId: a.rtuppCode ? rtuppByCode.get(a.rtuppCode)! : null,
          teamId: a.tim ? teamIdByKey.get(`${a.rtuppCode}|${a.tim}`)! : null,
        },
      });
      console.log(`   ✓ ${a.role.padEnd(8)} ${a.email}`);
    }

    // ── CEK DRIFT KEEP DI DALAM TX → bila beda 1 baris pun, throw = ROLLBACK ──
    const after = await snapshotKeep(tx, 'SESUDAH (dalam tx)');
    const drift = KEEP_TABLES.filter((t) => before[t] !== after[t]);
    if (drift.length) {
      const detail = drift.map((t) => `${t}: ${before[t]}→${after[t]}`).join('; ');
      throw new Error(`KEEP DRIFT terdeteksi (${detail}) — ROLLBACK TOTAL.`);
    }
    console.log('\n✅ Snapshot KEEP identik di dalam tx — commit diizinkan.');

    const totalUsers = await tx.user.count();
    return { delUsers, totalUsers, botId: bot.id, teams: teamIdByKey.size };
  }, { maxWait: 15000, timeout: 180000 });

  // ── LAPORAN ──────────────────────────────────────────────────────────────
  console.log('\n════════ LAPORAN EKSEKUSI ════════');
  console.log('Baris terhapus per tabel:');
  let total = 0;
  for (const [t, n] of Object.entries(deletedCounts)) { total += n; if (n) console.log(`   ${t.padEnd(34)} ${n}`); }
  console.log(`   ${'TOTAL'.padEnd(34)} ${total}`);
  console.log(`\nUser non-bot dihapus : ${result.delUsers}`);
  console.log(`Teams dibuat/diperbarui: ${result.teams}`);
  console.log(`Total user sekarang  : ${result.totalUsers} (harus 18 = 17 fresh + system-bot)`);
  console.log(`system-bot ID utuh   : ${result.botId}`);

  // Verifikasi ulang KEEP setelah commit (post-commit read).
  const afterCommit = await snapshotKeep(prisma, 'SESUDAH (post-commit)');
  const drift2 = KEEP_TABLES.filter((t) => before[t] !== afterCommit[t]);
  console.log(drift2.length
    ? `\n⚠️  KEEP berubah post-commit: ${drift2.join(', ')}`
    : '\n✅ Master/KEEP utuh (snapshot cocok sebelum vs sesudah).');
  console.log(`🔑 Password semua akun baru: ${PASSWORD}`);
}

main()
  .catch((e) => { console.error('❌ cleanup-reset gagal:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
