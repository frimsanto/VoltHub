import Anthropic from '@anthropic-ai/sdk';
import { GiReportStatus } from '@prisma/client';
import { env } from '../../config/env';
import prisma from '../../config/database';
import { dashboardService } from '../dashboard/dashboard.service';
import { scadaRealtimeService } from '../scada-realtime/scada-realtime.service';
import { assetRepository } from '../assets/asset.repository';
import { aiService } from './ai.service';
import type { TenantScope } from '../../utils/tenantScope';
import { loadUserContext, type UserContext } from './brain/memory/user-memory.repository';

/**
 * AI Assistant agent — natural-language understanding over the WHOLE database
 * via Claude tool-use. Claude reads the user's free-form question, decides which
 * data tool(s) to call, and answers in Bahasa Indonesia. The tools wrap the same
 * read services the rest of the app uses (dashboard overview, SCADA RC status,
 * OOP gardu list, whole-DB gardu search), so answers are grounded in live data.
 *
 * Disabled (no API key) → `isAgentEnabled()` returns false and the controller
 * tells the frontend to use its local deterministic engine instead. Data only
 * leaves the server when ANTHROPIC_API_KEY is set.
 */

export const isAgentEnabled = (): boolean => Boolean(env.ANTHROPIC_API_KEY);

let client: Anthropic | null = null;
const getClient = (): Anthropic => {
  if (!client) client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
};

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `Anda adalah AI Assistant untuk VoltHub — sistem manajemen aset telekomunikasi SCADA milik PT PLN (Persero). Anda adalah AHLI teknis SCADA kelistrikan distribusi dengan pengalaman lapangan, bukan hanya pembaca database.

=== DOMAIN & ISTILAH ===
- Gardu (lokasi/site): GI (Gardu Induk), GH (Gardu Hubung), Gardu Distribusi/MP
- Penyulang (feeder), Aset: RTU, FDI, Rectifier/penyearah, Bank Baterai, Router, Modem, Radio
- RC = Remote Control. Cubicle = panel kubikel di GH/GI.
- IN-SCAN: RTU/telekontrol aktif terhubung SCADA. OOP: Out of Point, telekontrol terputus.
- SP7 = software SCADA Siemens, tampilkan status warna gardu/RTU.
- CBO = Circuit Breaker Outdoor. LBS = Load Break Switch. ACO = Auto Change Over.
- Riley/Relay proteksi = perangkat pengaman (overcurrent, ground fault, dll).
- Selenoid = aktuator elektromagnetik untuk membuka/menutup cubicle secara remote.
- %AVA = availability (uptime RC dalam setahun). Target PLN ≥ 99.5%.

=== ATURAN JAWAB DATA ===
- Untuk pertanyaan angka/status/daftar gardu/laporan: WAJIB pakai tools, jangan mengarang.
- Jawaban data: ringkas, gunakan angka dan poin.
- Jika data tidak ditemukan: katakan apa adanya + sarankan kata kunci lain.

Bila laporan/data tidak ditemukan untuk gardu tertentu:
- Jawab singkat: "Belum ada laporan [jenis] untuk gardu [kode] di database."
- Langsung tawarkan alternatif spesifik berdasarkan konteks: bila tanya histori/kunjungan → tawarkan cek work order atau status RC; bila tanya kondisi → langsung query status RC gardu tersebut.
- Jangan tampilkan bullet point "Kemungkinan:" yang generik.
- Maksimal 3 kalimat untuk jawaban "tidak ditemukan".

=== ATURAN JAWAB TEKNIS ===
Untuk pertanyaan teknis/troubleshooting SCADA yang TIDAK ada di database,
jawab dari pengetahuan ahli teknis berikut:

BATERAI TIDAK BACKUP SAAT GANGGUAN:
Penyebab umum: (1) Sel baterai sulfat/rusak karena usia > 3 tahun atau jarang di-charge,
(2) MCB baterai 48V trip karena overcurrent, (3) Kabel koneksi baterai longgar/korosi,
(4) Rectifier tidak mengisi baterai (mode float gagal), (5) Kapasitas baterai turun
di bawah 20% karena discharge berulang tanpa recharge penuh.
Langkah cek: ukur tegangan sel (normal 2.15–2.17V/sel untuk lead-acid),
cek MCB baterai, cek arus charge rectifier, lakukan load test.

RTU SERING BERMASALAH (termasuk Advantech):
Penyebab umum: (1) Tegangan supply tidak stabil (harus 48VDC ±10%),
(2) Suhu lingkungan > 45°C tanpa AC/ventilasi yang cukup,
(3) Firmware outdated, (4) Interferensi EMI dari peralatan switching di sekitar,
(5) Koneksi terminal I/O longgar akibat getaran atau usia,
(6) Kapasitor internal aging pada unit > 7 tahun.
Saran merk RTU terbaik berdasarkan track record lapangan PLN:
1. Advantech ADAM/ARK — umum, spare part mudah, tapi rentan suhu
2. Red Lion — stabil, lebih tahan suhu ekstrem
3. Siemens SICAM — paling stabil untuk integrasi SP7 langsung, mahal
4. Schneider ION/Sepam — bagus untuk proteksi terintegrasi
5. Fransen/IEC FROG — alternatif lokal yang mulai banyak dipakai PLN

RELAY PROTEKSI ERROR SETELAH TRIP/GANGGUAN:
Penyebab: (1) Trip coil terkena arus balik (back EMF) saat CBO membuka/menutup cepat,
(2) Supply auxiliary 48/110VDC ke relay hilang sesaat, (3) Setting relay berubah
akibat interferensi surge/lightning, (4) Memory relay corrupt akibat power interruption
tanpa UPS, (5) Kontak binary input relay mengalami arc flash.
Langkah: cek event log relay, verifikasi setting vs setting sheet, reset + re-download
setting dari laptop, ganti relay bila setting tidak bisa dipertahankan.
Merk relay terbaik: 1. SEL (Schweitzer) — standar emas, sangat stabil,
2. ABB REF/REX series, 3. Siemens SIPROTEC 4/5, 4. GE Multilin, 5. Schneider Sepam.

RTU HANG/ERROR SETELAH GANGGUAN:
Penyebab: (1) Voltage sag/surge saat trip CBO masuk ke power supply RTU,
(2) Ground loop antara panel RTU dan cubicle, (3) Komunikasi ke master station
timeout → watchdog reset, (4) Memory overflow akibat burst event log saat gangguan.
Langkah yang HARUS dilakukan:
1. Catat waktu hang di log (penting untuk analisis)
2. Power cycle RTU (matikan 30 detik, nyalakan) — jangan langsung reset dari software
3. Cek koneksi komunikasi (kabel RS485/Ethernet/FO)
4. Cek IP address RTU tidak conflict
5. Lakukan cold start dari software master jika perlu
6. Jika berulang: pasang surge protector 48VDC di input power RTU
7. Lapor ke tim SCADA pusat untuk analisis log master station

SELENOID CUBICLE GOSONG/TERBAKAR:
Penyebab utama: (1) Tegangan coil tidak sesuai (selenoid 48V diberi 110V atau sebaliknya),
(2) Selenoid diaktifkan terlalu lama (coil tidak boleh energized > 3 detik),
(3) Mekanik cubicle macet sehingga selenoid kerja terus-menerus,
(4) Kualitas selenoid tidak sesuai spesifikasi (hindari merk tidak terstandar).
Setelah pergantian WAJIB: (1) Verifikasi tegangan supply selenoid,
(2) Test operasi manual dulu sebelum remote, (3) Cek mekanik interlocking,
(4) Ukur arus selenoid saat operasi (normal < 2A untuk 48VDC),
(5) Set timer relay pembatas waktu energize selenoid (< 2 detik),
(6) Catat di logbook dan laporan HAR, (7) Lakukan uji RC dari master station.

STATUS LOKAL TERBACA, SP7 TIDAK TERBACA:
Penyebab: (1) Alamat ASDU/LA (Link Address) di RTU tidak sesuai konfigurasi SP7,
(2) Protocol mismatch (IEC 101/104 parameter berbeda), (3) RTU tidak masuk
polling list di master station, (4) Firewall/router memblokir port SCADA (2404 untuk IEC104),
(5) IP RTU berubah tapi SP7 belum di-update, (6) Kualitas sinyal komunikasi
di bawah threshold (untuk media radio/GSM).
Langkah: cek ASDU di RTU vs SP7, ping RTU dari server SCADA, cek wireshark
apakah ada traffic IEC 104, verifikasi IP/port di konfigurasi SP7.

GAGAL RC PADA CUBICLE (EGA, Schneider, ABB, Merlin Gerin, dll):
Langkah umum (berlaku semua merk):
1. Cek status SP7: warna cubicle (lihat penjelasan warna di bawah)
2. Cek tegangan supply selenoid (48VDC atau 110VDC sesuai spek)
3. Cek posisi selector switch: harus di posisi REMOTE (bukan LOCAL/OFF)
4. Cek status interlocking (cubicle adjacent tidak boleh dalam posisi tertentu)
5. Cek alarm di relay proteksi: bila ada alarm aktif, RC bisa di-block
6. Untuk EGA: cek modul RC tambahan (biasanya terpisah dari panel utama)
7. Untuk Schneider/Merlin Gerin: cek modul Easergy atau Recloser Controller
8. Untuk ABB: cek modul SAM600 atau REF615 binary output status
9. Lakukan test lokal dulu: tekan tombol CLOSE/OPEN manual
10. Jika tetap gagal: cek binary output RTU dengan multimeter

WARNA SP7/SIEMENS SCADA:
BISA di-RC (telekontrol aktif):
- HIJAU terang/solid = peralatan CLOSED (ON), RC aktif, normal
- MERAH solid = peralatan OPEN (OFF), RC aktif, normal
- KUNING/AMBER berkedip = sedang dalam proses operasi RC

TIDAK BISA di-RC (telekontrol bermasalah):
- ABU-ABU = komunikasi terputus/RTU OOP (tidak ada sinyal dari lapangan)
- HIJAU PUDAR/MUTED = status lokal terbaca tapi RC tidak bisa dilakukan
- MERAH SILANG/X = RC di-disable (selector switch LOCAL atau interlock aktif)
- PUTIH/BLANK = data tidak ada di polling list SP7
- KUNING SOLID (non-berkedip) = error/alarm pada peralatan, RC di-block
- ORANGE = dalam mode test/maintenance, RC disabled

=== PANDUAN PENGGUNAAN APLIKASI VOLTHUB ===
Ketika pengguna bertanya cara menggunakan aplikasi, jawab berdasarkan ini:

STRUKTUR MENU:
- Dashboard → Dashboard SCADA (monitoring jaringan), Dashboard Lapangan (aktivitas tim)
- Monitoring SCADA → KPI Dashboard, GIS Monitoring, Pusat Monitoring (MASTER only)
- SCADA Upload → Upload file SP7 harian (NOC)
- Master Data → Gardu/GI, Bay, Penyulang, Aset
- Operasional Lapangan → Work Order, Monitoring Laporan, Approval Laporan,
  Laporan GI, Laporan HAR GI, Laporan Inspeksi GH, Laporan HAR GH, Inspeksi MP, HAR MP
- Data & Tools → Documents, Import
- Manajemen → User Management, Personil
- Sistem (MASTER only) → RTUPP, Teams, Audit Log

ALUR KERJA LAPORAN:
1. ADMIN buat Work Order → assign ke Team
2. PETUGAS terima WO → isi Laporan Awal (wajib sebelum laporan lain)
3. PETUGAS isi Laporan Inspeksi / HAR sesuai jenis gardu (GI/GH/MP)
4. PETUGAS submit → ADMIN validasi di menu Approval Laporan
5. Laporan APPROVED → muncul di Monitoring Laporan & KPI Dashboard

CARA CEK STATUS RC SCADA:
→ Dashboard → Dashboard SCADA → Tab "Inscan/OOP"
→ Menampilkan berapa gardu IN-SCAN vs OOP hari ini dari snapshot SP7 terbaru

CARA UPLOAD DATA SCADA HARIAN:
→ Menu SCADA Upload → pilih file SP7 export dari Siemens → Upload
→ Data otomatis ter-update di Dashboard Inscan/OOP

CARA TAMBAH ASET BARU:
→ Master Data → Aset → Tambah Aset → pilih lokasi gardu → isi detail

CARA LIHAT GARDU BERMASALAH (OOP):
→ Dashboard SCADA → Tab Inscan/OOP → tabel bawah → filter "OOP"
→ Atau tanya AI: "tampilkan gardu OOP" atau "list gardu OOP di UP3 Menteng"

CARA LIHAT LAPORAN TIM LAPANGAN:
→ Operasional Lapangan → Monitoring Laporan
→ Filter by status (DRAFT/SUBMITTED/APPROVED/REJECTED)
→ Atau tanya AI: "laporan inspeksi GH minggu ini"

ROLES:
- MASTER: akses penuh sistem (bukan untuk operasional harian)
- MANAGER: monitoring read-only seluruh data
- ADMIN: operasional harian (WO, approval, user management) — akses data global lintas RTUPP; menu sistem tetap khusus MASTER, user management tetap per RTUPP
- PETUGAS: input laporan lapangan saja
- NOC: upload SCADA + monitoring Inscan/OOP

=== FORMAT JAWABAN ===
- Data dari DB: ringkas, angka dengan pemisah ribuan, poin bila perlu
- Pertanyaan teknis: jawaban terstruktur (Penyebab → Langkah)
- Panduan aplikasi: langkah bernomor yang jelas
- Bahasa Indonesia, langsung ke inti
- Jangan tampilkan proses berpikir
- Jika pertanyaan gabungan (data + teknis): jawab data dulu dari tool, lalu tambah konteks teknis`;

/** Identity/context of the asking user, threaded from the controller (JWT). */
export interface AgentUserInfo {
  userId?: string;
  name?: string;
  role?: string;
  rtuppId?: string | null;
  up3List?: string[];
}

/**
 * Personalised system prompt: the shared SYSTEM_PROMPT (unchanged) plus a
 * dynamic section describing who is asking and what they usually ask about
 * (from the persisted cross-session snapshot). `ctx` null → base prompt only.
 */
export function buildSystemPrompt(user: AgentUserInfo, ctx: UserContext | null): string {
  if (!ctx) return SYSTEM_PROMPT;

  const lines = [
    '',
    '=== KONTEKS PENGGUNA ===',
    `Anda sedang berbicara dengan ${user.name ?? 'pengguna'} (role: ${user.role ?? 'user'}).`,
  ];
  if (ctx.lastGardu) lines.push(`Gardu yang sering ditanyakan: ${ctx.lastGardu}.`);
  if (ctx.lastUp3) lines.push(`UP3 yang relevan: ${ctx.lastUp3}.`);
  if (ctx.topIntents.length > 0) {
    lines.push(
      `Topik yang paling sering ditanyakan: ${ctx.topIntents.slice(0, 3).map((i) => i.id).join(', ')}.`
    );
  }
  lines.push(
    'Gunakan informasi ini untuk mempersonalisasi jawaban, tapi jangan menyebutkan',
    'bahwa Anda "mengingat" data sebelumnya secara eksplisit — cukup jadikan',
    'konteks latar belakang.',
    '=== AKHIR KONTEKS ==='
  );
  return SYSTEM_PROMPT + lines.join('\n');
}

const tools: Anthropic.Tool[] = [
  {
    name: 'get_network_overview',
    description:
      'Ringkasan seluruh jaringan dari database: jumlah gardu, penyulang, aset; rincian aset per jenis & per status; jumlah tiket terbuka/selesai; total & contoh aset kritis (WARNING/DAMAGED). Pakai untuk "ringkasan jaringan", "berapa total aset/gardu", "berapa RTU/modem/baterai", "aset rusak/kritis".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_rc_scada_status',
    description:
      'Status RC/telekontrol SCADA nyata untuk seluruh gardu RC: jumlah IN-SCAN, OOP, belum-ada-data, rata-rata %AVA, dan unit organisasi dengan OOP terbanyak. Termasuk angka hari ini berdasarkan snapshot SP7 terbaru yang diupload NOC. Pakai untuk pertanyaan tentang OOP, IN-SCAN, telekontrol, atau availability.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_laporan_lapangan',
    description:
      'Ambil ringkasan laporan tim lapangan terbaru: Inspeksi GH, HAR GH, HAR GI, HAR MP. Berisi status RC, status cubicle, kondisi rectifier/baterai/RTU/media, catatan masalah, dan saran penanganan dari laporan yang sudah disubmit/tervalidasi. Gunakan untuk pertanyaan tentang kondisi lapangan, isi laporan, masalah yang ditemukan, atau saran perbaikan.',
    input_schema: {
      type: 'object',
      properties: {
        locationCode: {
          type: 'string',
          description: 'Kode gardu/GH untuk filter laporan gardu tertentu (opsional).',
        },
        limit: { type: 'integer', description: 'Jumlah laporan terbaru (default 5, maks 20).' },
        type: {
          type: 'string',
          enum: ['inspeksi', 'har', 'all'],
          description: 'Jenis laporan: inspeksi / har / all (default all).',
        },
      },
    },
  },
  {
    name: 'list_oop_gardu',
    description:
      'Daftar gardu RC yang berstatus OOP (telekontrol terputus). Bisa difilter dengan kata kunci (kode gardu / UP3 / RTUPP). Pakai saat pengguna ingin melihat gardu OOP yang spesifik atau daftarnya.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Kata kunci opsional: kode gardu, UP3, atau RTUPP.' },
        limit: { type: 'integer', description: 'Maksimum baris (default 15, maks 50).' },
      },
    },
  },
  {
    name: 'search_gardu',
    description:
      'Cari satu gardu mana pun di database berdasarkan kode atau nama, dan kembalikan detailnya: UP3, jumlah & daftar aset terpasang, media komunikasi, jumlah dokumen, inspeksi/HAR terakhir. Pakai untuk "lokasi gardu X", "detail gardu X", "aset di gardu X".',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Kode atau nama gardu yang dicari, mis. "PM46".' },
      },
      required: ['query'],
    },
  },
];

// ── Tool execution — maps each tool to the existing read services ─────────────
// `search_gardu` reaches ai.service.ts, which is tenant-scoped (RTUPP-fail-closed);
// `get_laporan_lapangan` queries the laporan tables directly and applies the
// RTUPP scope itself via location.rtuppId (laporan is tenant-bound data). The
// remaining tools mirror /dashboard/overview and /scada-realtime, which are
// intentionally global for every authenticated role (see their route comments) —
// no scope narrowing is applied there, by the same design.
// Exported for direct verification in tests/scripts; runtime callers go through runAgent.
export async function execTool(name: string, input: Record<string, unknown>, scope: TenantScope): Promise<unknown> {
  switch (name) {
    case 'get_network_overview': {
      const o = await dashboardService.getOverview();
      return {
        counts: o.counts,
        assetByType: o.assetByType,
        assetByStatus: o.assetByStatus,
        ticketByStatus: o.ticketByStatus,
        criticalAssets: {
          total: o.criticalAssets.total,
          sample: o.criticalAssets.items.slice(0, 10).map((a) => ({
            code: a.assetCode,
            name: a.assetName,
            type: a.assetType,
            status: a.status,
            location: a.locationName,
          })),
        },
      };
    }
    case 'get_rc_scada_status': {
      // Hitung dari BARIS scada_rtu_rows snapshot SP7 terbaru — sumber yang sama
      // dengan Dashboard SCADA (asset.service.scadaRtuSummary). scada_gardu tidak
      // di-populate dari upload SP7 sehingga getSummary selalu mengembalikan 0.
      const statusRows = await assetRepository.latestScadaRtuStatusCounts();
      if (!statusRows || statusRows.length === 0) {
        return {
          available: false,
          note: 'Data SCADA belum tersedia. Tim NOC perlu upload file SP7 terbaru via menu SCADA Upload.',
        };
      }
      let inScan = 0;
      let oop = 0;
      let total = 0;
      for (const r of statusRows) {
        const n = r._count._all;
        if (r.operState === 'UP') inScan += n;
        else if (r.operState === 'DOWN') oop += n;
        total += n;
      }
      return {
        available: true,
        total,
        inScan,
        oop,
        unknown: total - inScan - oop,
        avaAvgPercent: null, // scada_rtu_rows tidak punya avaYtd
        asOfDate: null,
        topOopUnits: [], // scada_rtu_rows tidak punya dimensi up3/rtupp
        note: `Data dari snapshot SP7 terbaru (${total.toLocaleString('id-ID')} RTU termonitor).`,
      };
    }
    case 'list_oop_gardu': {
      const limit = Math.min(Math.max(Number(input.limit) || 15, 1), 50);
      const search = typeof input.search === 'string' && input.search.trim() ? input.search.trim() : undefined;
      const { items, meta } = await scadaRealtimeService.listGardu({
        type: 'RC',
        status: 'OOP',
        search,
        page: 1,
        limit,
      });
      return {
        total: meta.total,
        shown: items.length,
        gardu: items.map((g) => ({
          code: g.code,
          up3: g.up3,
          rtupp: g.rtupp,
          avaYtdPercent: g.avaYtd == null ? null : Math.round(g.avaYtd * 1000) / 10,
          asOfDate: g.asOfDate,
        })),
      };
    }
    case 'get_laporan_lapangan': {
      const limit = Math.min(Math.max(Number(input.limit) || 5, 1), 20);
      const locCodeRaw = typeof input.locationCode === 'string' ? input.locationCode.trim() : '';
      // LLM callers sometimes send locationCode "all"/"semua" meaning "no
      // filter" — that is not a code; treat it as absent instead of silently
      // filtering to (near) zero rows via `code contains "all"`.
      const locCode =
        locCodeRaw && !['all', 'semua', '*'].includes(locCodeRaw.toLowerCase())
          ? locCodeRaw
          : undefined;
      const type = typeof input.type === 'string' ? input.type : 'all';

      // Enum GiReportStatus tidak punya APPROVED — laporan "disetujui" = VALIDATED.
      const whereBase = {
        deletedAt: null,
        status: { in: [GiReportStatus.SUBMITTED, GiReportStatus.VALIDATED] },
        location: {
          ...(scope.global ? {} : { rtuppId: scope.rtuppId }),
          ...(locCode ? { code: { contains: locCode } } : {}),
        },
      };
      const locationSelect = { select: { code: true, name: true } };

      const jsonCatatan = (label: string, v: unknown): string | null => {
        if (v && typeof v === 'object' && 'catatan' in v) {
          const c = (v as Record<string, unknown>).catatan;
          if (typeof c === 'string' && c.trim()) return `${label}: ${c.trim()}`;
        }
        return null;
      };

      const extractFindings = (lap: {
        status?: string;
        reportDate?: Date | null;
        statusRc?: string | null;
        statusCubicle?: string | null;
        statusGarduSebelum?: string | null;
        statusGarduSesudah?: string | null;
        penyebabGangguan?: unknown;
        penanganan?: unknown;
        rectifier?: unknown;
        baterai?: unknown;
        rtu?: unknown;
        catatan?: string | null;
        notes?: string | null;
        location?: { code?: string | null; name?: string | null };
      }) => ({
        gardu: lap.location?.code ?? '-',
        nama: lap.location?.name ?? '-',
        tanggal: lap.reportDate ? lap.reportDate.toISOString().slice(0, 10) : '-',
        status: lap.status ?? '-',
        statusRc: lap.statusRc ?? '-',
        statusCubicle: lap.statusCubicle ?? '-',
        masalah:
          [
            lap.catatan,
            lap.notes,
            jsonCatatan('Rectifier', lap.rectifier),
            jsonCatatan('Baterai', lap.baterai),
            jsonCatatan('RTU', lap.rtu),
          ]
            .filter(Boolean)
            .join('; ') || '-',
        penyebabGangguan:
          lap.penyebabGangguan == null ? null : JSON.stringify(lap.penyebabGangguan),
        penanganan: lap.penanganan == null ? null : JSON.stringify(lap.penanganan),
        statusSebelum: lap.statusGarduSebelum ?? null,
        statusSesudah: lap.statusGarduSesudah ?? null,
      });

      const [inspGh, harGh, harGi, harMp] = await Promise.all([
        type === 'all' || type === 'inspeksi'
          ? prisma.laporanInspeksiGh.findMany({
              where: whereBase,
              orderBy: { reportDate: 'desc' },
              take: limit,
              select: {
                status: true, reportDate: true, statusRc: true, statusCubicle: true,
                rectifier: true, baterai: true, rtu: true,
                catatan: true, notes: true,
                location: locationSelect,
              },
            })
          : [],
        type === 'all' || type === 'har'
          ? prisma.laporanHarGh.findMany({
              where: whereBase,
              orderBy: { reportDate: 'desc' },
              take: limit,
              select: {
                status: true, reportDate: true, statusRc: true, statusCubicle: true,
                statusGarduSebelum: true, statusGarduSesudah: true,
                rectifier: true, baterai: true, rtu: true,
                penyebabGangguan: true, penanganan: true,
                catatan: true, notes: true,
                location: locationSelect,
              },
            })
          : [],
        type === 'all' || type === 'har'
          ? prisma.laporanHarGi.findMany({
              // LaporanHarGi tidak punya statusRc/statusCubicle/rtu/catatan/notes —
              // payload per-section-nya io/relay/serialDevice/cctv (lihat schema).
              where: whereBase,
              orderBy: { reportDate: 'desc' },
              take: limit,
              select: {
                status: true, reportDate: true,
                statusGarduSebelum: true, statusGarduSesudah: true,
                rectifier: true, baterai: true,
                penyebabGangguan: true, penanganan: true,
                location: locationSelect,
              },
            })
          : [],
        type === 'all' || type === 'har'
          ? prisma.laporanHarMp.findMany({
              where: whereBase,
              orderBy: { reportDate: 'desc' },
              take: limit,
              select: {
                status: true, reportDate: true, statusRc: true, statusCubicle: true,
                statusGarduSebelum: true, statusGarduSesudah: true,
                rectifier: true, baterai: true, rtu: true,
                penyebabGangguan: true, penanganan: true,
                catatan: true, notes: true,
                location: locationSelect,
              },
            })
          : [],
      ]);

      return {
        total: inspGh.length + harGh.length + harGi.length + harMp.length,
        inspeksiGh: inspGh.map(extractFindings),
        harGh: harGh.map(extractFindings),
        harGi: harGi.map(extractFindings),
        harMp: harMp.map(extractFindings),
      };
    }
    case 'search_gardu': {
      const query = String(input.query ?? '').trim();
      if (!query) return { found: false, reason: 'query kosong' };
      try {
        const r = await aiService.searchAssets(query, scope);
        return {
          found: true,
          gardu: {
            code: r.location.code,
            name: r.location.name,
            type: r.location.locationType,
            up3: r.location.up3,
            assetCount: r.assetCount,
            communicationMediaCount: r.communicationMedia.length,
            documentCount: r.documentCount,
            lastInspectionDate: r.lastInspection?.inspectionDate ?? null,
            lastHarDate: r.lastHar?.reportDate ?? null,
          },
          assets: r.assets.slice(0, 20).map((a) => ({
            code: a.assetCode,
            name: a.assetName,
            type: a.assetType,
            status: a.status,
          })),
        };
      } catch {
        return { found: false, reason: `Tidak ada gardu yang cocok dengan "${query}".` };
      }
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export interface AgentResult {
  text: string;
  toolsUsed: string[];
}

/** Run one assistant turn: Claude + tool loop, returns the final answer text.
 *  `user` (optional, additive) personalises the system prompt from the caller's
 *  persisted snapshot — absent or on any load failure, the base prompt is used. */
export async function runAgent(
  message: string,
  history: ChatTurn[] = [],
  scope: TenantScope,
  user?: AgentUserInfo,
): Promise<AgentResult> {
  const anthropic = getClient();
  const userCtx = user?.userId ? await loadUserContext(user.userId) : null;
  const system = buildSystemPrompt(user ?? {}, userCtx);
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-8).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ];
  const toolsUsed: string[] = [];

  // Bounded agentic loop — a handful of tool round-trips is plenty for this domain.
  for (let i = 0; i < 6; i++) {
    const res = await anthropic.messages.create({
      model: env.AI_MODEL,
      max_tokens: 4096,
      system,
      tools,
      messages,
      thinking: { type: 'adaptive' },
      // Low effort keeps the chat widget snappy; tool routing doesn't need deep thinking.
      output_config: { effort: 'low' },
    } as Anthropic.MessageCreateParamsNonStreaming);

    if (res.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: res.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type === 'tool_use') {
          toolsUsed.push(block.name);
          const out = await execTool(block.name, (block.input ?? {}) as Record<string, unknown>, scope);
          results.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(out),
          });
        }
      }
      messages.push({ role: 'user', content: results });
      continue;
    }

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    return {
      text: text || 'Maaf, saya tidak dapat menyusun jawaban untuk pertanyaan itu.',
      toolsUsed,
    };
  }

  return { text: 'Maaf, pertanyaan ini terlalu kompleks untuk diproses saat ini.', toolsUsed };
}
