/**
 * PHASE 1 — VoltHub Domain Dictionary.
 *
 * The single source of truth that maps the *operational language* used by
 * PETUGAS / ADMIN / MANAGER / MASTER (Bahasa Indonesia, English, field slang)
 * onto stable machine concepts. Everything downstream (intent detection,
 * clarification, learning) reasons over `concept` ids, never raw words — so the
 * vocabulary can grow without touching the engine.
 *
 * EXPANDABLE BY DESIGN:
 *   - Add a surface form → push into an entry's `synonyms`.
 *   - Add a brand-new concept → push a new `DictionaryEntry`.
 *   - Add learned per-user aliases → see `ai_aliases` (Phase 7); the resolver
 *     merges them at runtime via `resolveConcepts(text, extraEntries)`.
 *
 * No DB, no I/O — pure data + a matcher. Keep it that way.
 */

import type { DictionaryEntry, ConceptMatch } from '../brain.types';

export const DOMAIN_DICTIONARY: DictionaryEntry[] = [
  // ── Entities ──────────────────────────────────────────────────────────────
  {
    concept: 'entity.gardu',
    category: 'entity',
    canonical: 'gardu',
    // NB: sengaja TIDAK memuat 'rtu' telanjang — entity.gardu adalah entri
    // pertama kamus, jadi firstOf(concepts,'entity') akan memenangkannya dan
    // "berapa rtu" berubah makna dari hitung aset RTU menjadi hitung gardu.
    synonyms: [
      'gardu', 'site', 'lokasi', 'lokasi gardu', 'gi', 'gh', 'substation', 'location',
      'rc gardu', 'gardu rc', 'gardu rc inscan', 'rc inscan', 'inscan rc',
    ],
  },
  {
    concept: 'entity.feeder',
    category: 'entity',
    canonical: 'penyulang',
    synonyms: ['penyulang', 'feeder', 'fdr', 'jaringan'],
  },
  {
    concept: 'entity.asset',
    category: 'entity',
    canonical: 'aset',
    synonyms: ['aset', 'asset', 'peralatan', 'perangkat', 'equipment', 'device'],
  },
  {
    concept: 'entity.router',
    category: 'entity',
    canonical: 'router',
    synonyms: ['router', 'modem', 'radio', 'media komunikasi', 'komunikasi', 'gateway'],
  },
  {
    concept: 'entity.rtu',
    category: 'entity',
    canonical: 'RTU',
    synonyms: ['rtu', 'remote terminal unit', 'remote terminal'],
  },
  {
    concept: 'entity.battery',
    category: 'entity',
    canonical: 'baterai',
    synonyms: ['baterai', 'battery', 'bank baterai', 'aki', 'baterei', 'batre'],
  },
  {
    concept: 'entity.rectifier',
    category: 'entity',
    canonical: 'rectifier',
    synonyms: ['rectifier', 'penyearah', 'charger'],
  },
  {
    concept: 'entity.report',
    category: 'entity',
    canonical: 'laporan',
    synonyms: ['laporan', 'report', 'lapran', 'laporan awal', 'laporan akhir', 'spj'],
  },
  {
    concept: 'entity.inspection',
    category: 'entity',
    canonical: 'inspeksi',
    synonyms: ['inspeksi', 'inspection', 'pemeriksaan', 'cek'],
  },
  {
    concept: 'entity.ticket',
    category: 'entity',
    canonical: 'tiket',
    synonyms: ['tiket', 'ticket', 'work order', 'wo', 'gangguan', 'perbaikan'],
  },
  {
    concept: 'entity.user',
    category: 'entity',
    canonical: 'pengguna',
    synonyms: ['user', 'pengguna', 'akun', 'petugas', 'admin', 'personil'],
  },
  {
    // Historical equipment-condition inspection data (bulk-imported from the
    // field team's Excel logs — see InspeksiGarduRecord). Deliberately keyed on
    // multi-word phrases only so it does NOT fire from a bare "inspeksi" or
    // "gardu" (which already belong to entity.inspection / entity.gardu and the
    // live-report / live-asset intents).
    concept: 'entity.inspection_record',
    category: 'entity',
    canonical: 'data inspeksi',
    synonyms: [
      'data inspeksi', 'hasil inspeksi', 'riwayat inspeksi', 'histori inspeksi',
      'kondisi peralatan', 'kondisi gardu', 'inspeksi peralatan',
      'inspeksi lapangan', 'catatan inspeksi',
      // "kunjungan"/"cek terakhir" are how field teams phrase an inspection
      // visit in practice ("kunjungan terakhir JS100") — same underlying
      // InspeksiGarduRecord data, just field slang instead of "inspeksi".
      'kunjungan terakhir', 'terakhir kunjungan', 'riwayat kunjungan',
      'jadwal kunjungan', 'kapan kunjungan', 'kunjungan lapangan',
      'terakhir dikunjungi', 'kapan dikunjungi',
      'terakhir cek', 'cek terakhir', 'kapan terakhir cek', 'terakhir dicek',
      'kapan dicek', 'jadwal inspeksi', 'kapan inspeksi', 'inspeksi terakhir',
      'visit terakhir', 'kunjungan',
    ],
  },
  {
    // Historical HAR (pemeliharaan/korektif) data (bulk-imported from the field
    // team's Excel logs — see HarGarduRecord). Same multi-word-phrases-only rule
    // as entity.inspection_record so a bare "har"/"pemeliharaan" inside other
    // report questions doesn't hijack the live-report intents.
    concept: 'entity.har_record',
    category: 'entity',
    canonical: 'data har',
    synonyms: [
      'data har', 'hasil har', 'riwayat har', 'histori har', 'kondisi har',
      'har gardu', 'data pemeliharaan', 'hasil pemeliharaan',
      'riwayat pemeliharaan', 'catatan har',
      // Additional phrasing for the same corrective-maintenance (HAR) data —
      // "histori pemeliharaan"/"maintenance" are common field/English variants
      // not covered by the phrases above.
      'histori pemeliharaan', 'jadwal pemeliharaan', 'kapan pemeliharaan',
      'pemeliharaan terakhir', 'maintenance terakhir', 'riwayat maintenance',
      'histori maintenance', 'jadwal maintenance', 'kapan maintenance',
      'data maintenance', 'hasil maintenance',
    ],
  },
  {
    // Page entities — app pages the NAVIGATE intent can open. Multi-word-only
    // phrases (same rule as the *_record entries) so a bare "gh"/"mp"/"har"
    // never fires a page concept from inside an ordinary data question.
    concept: 'entity.page_har_gh',
    category: 'entity',
    canonical: 'har-gh',
    synonyms: [
      'har gh', 'har gardu hubung', 'laporan har gh',
      'pemeliharaan gh', 'pemeliharaan gardu hubung',
    ],
  },
  {
    concept: 'entity.page_har_mp',
    category: 'entity',
    canonical: 'har-mp',
    synonyms: [
      'har mp', 'har gardu distribusi', 'laporan har mp',
      'pemeliharaan mp', 'pemeliharaan gardu distribusi',
      'har metering point',
    ],
  },
  {
    concept: 'entity.page_har_gi',
    category: 'entity',
    canonical: 'har-gi',
    synonyms: [
      'har gi', 'har gardu induk', 'laporan har gi',
      'pemeliharaan gi', 'pemeliharaan gardu induk',
    ],
  },
  {
    concept: 'entity.page_inspeksi_gh',
    category: 'entity',
    canonical: 'inspeksi-gh',
    synonyms: [
      'inspeksi gh', 'inspeksi gardu hubung', 'laporan inspeksi gh',
      'cek gh', 'pemeriksaan gh',
    ],
  },
  {
    concept: 'entity.page_inspeksi_mp',
    category: 'entity',
    canonical: 'inspeksi-mp',
    synonyms: [
      'inspeksi mp', 'inspeksi gardu distribusi', 'laporan inspeksi mp',
      'cek mp', 'pemeriksaan mp',
    ],
  },
  {
    concept: 'entity.page_work_order',
    category: 'entity',
    canonical: 'work-order',
    synonyms: [
      'work order', 'wo', 'penugasan', 'tugas lapangan',
      'halaman wo', 'daftar wo',
    ],
  },
  {
    concept: 'entity.page_dashboard',
    category: 'entity',
    canonical: 'dashboard',
    synonyms: [
      'dashboard', 'beranda', 'home', 'halaman utama',
      'dashboard lapangan', 'dashboard scada',
    ],
  },

  // ── Attributes ──────────────────────────────────────────────────────────────
  {
    concept: 'attribute.brand',
    category: 'attribute',
    canonical: 'merk',
    synonyms: ['merk', 'merek', 'brand'],
  },

  // ── Status / condition ─────────────────────────────────────────────────────
  {
    concept: 'status.pending',
    category: 'status',
    canonical: 'pending',
    synonyms: ['pending', 'belum selesai', 'antri', 'antrian', 'menunggu', 'menunggu validasi', 'belum divalidasi', 'tertunda'],
  },
  {
    concept: 'status.approved',
    category: 'status',
    canonical: 'disetujui',
    synonyms: ['approved', 'selesai', 'disetujui', 'acc', 'oke', 'beres', 'tervalidasi'],
  },
  {
    concept: 'status.rejected',
    category: 'status',
    canonical: 'ditolak',
    synonyms: ['rejected', 'ditolak', 'tolak', 'gagal validasi', 'dikembalikan'],
  },
  {
    concept: 'status.critical',
    category: 'status',
    canonical: 'kritis',
    synonyms: ['critical', 'kritis', 'merah', 'parah', 'bahaya', 'rusak parah', 'darurat'],
  },
  {
    concept: 'status.damaged',
    category: 'status',
    canonical: 'rusak',
    synonyms: ['rusak', 'damaged', 'broken', 'tidak berfungsi', 'mati total'],
  },
  {
    concept: 'status.warning',
    category: 'status',
    canonical: 'peringatan',
    synonyms: ['warning', 'peringatan', 'kuning', 'bermasalah', 'perlu perhatian'],
  },
  {
    // Frasa gabungan 'status rc' / 'status scada' / 'rc scada' sengaja ada di
    // status.offline DAN status.online: keduanya match frasa yang sama persis →
    // KPI_SCADA.buildSlots membacanya sebagai status.all_rc (jawab Inscan+OOP
    // sekaligus). Match yang identik/substring ditangani di buildSlots.
    concept: 'status.offline',
    category: 'status',
    canonical: 'offline',
    synonyms: [
      'offline', 'mati', 'putus', 'down', 'tidak terhubung', 'lost', 'oop',
      'out of operation', 'out of point', 'telekontrol putus', 'rc putus',
      'komunikasi putus', 'gardu oop', 'rtu oop', 'rtu mati', 'rtu offline',
      'tidak terhubung scada',
      'status rc', 'status scada', 'rc scada',
      // Frasa gabungan "inscan/oop" (normalizeText mengubah '/' jadi spasi) —
      // ada di offline DAN online, pola dual yang sama dengan 'status rc' →
      // KPI_SCADA membacanya sebagai status.all_rc (Inscan+OOP sekaligus).
      'inscan oop', 'oop inscan', 'inscane oop', 'oop inscane',
      'inscan dan oop', 'oop dan inscan',
    ],
  },
  {
    concept: 'status.online',
    category: 'status',
    canonical: 'online',
    // NB: tidak memuat 'terhubung scada' — itu substring dari frasa offline
    // 'tidak terhubung scada' dan akan membuat keduanya match bersamaan.
    synonyms: [
      'online', 'hidup', 'up', 'terhubung', 'in-scan', 'inscan', 'in scan',
      'inscane', 'in-skane', 'in skane',
      'sehat', 'normal', 'rc aktif', 'telekontrol aktif', 'komunikasi normal',
      'gardu inscan', 'rtu inscan', 'rtu aktif',
      'rc inscan', 'gardu rc inscan',
      'berapa inscan', 'berapa yang inscan', 'gardu yang inscan', 'rtu yang inscan',
      'status rc', 'status scada', 'rc scada',
      // Pasangan dual "inscan/oop" — lihat catatan di status.offline.
      'inscan oop', 'oop inscan', 'inscane oop', 'oop inscane',
      'inscan dan oop', 'oop dan inscan',
    ],
  },
  {
    concept: 'status.uninspected',
    category: 'status',
    canonical: 'belum inspeksi',
    synonyms: ['belum inspeksi', 'belum dicek', 'belum diperiksa', 'uninspected', 'tanpa inspeksi'],
  },

  // ── Metrics / measures ─────────────────────────────────────────────────────
  {
    concept: 'metric.count',
    category: 'metric',
    canonical: 'jumlah',
    synonyms: ['berapa', 'jumlah', 'total', 'count', 'banyaknya', 'how many', 'ada berapa'],
  },
  {
    concept: 'metric.availability',
    category: 'metric',
    canonical: 'availability',
    synonyms: ['availability', 'ava', '%ava', 'ketersediaan', 'avai'],
  },
  {
    concept: 'metric.trend',
    category: 'metric',
    canonical: 'tren',
    synonyms: ['tren', 'trend', 'grafik', 'perkembangan', 'naik turun'],
  },
  {
    concept: 'metric.most',
    category: 'metric',
    canonical: 'terbanyak',
    synonyms: ['terbanyak', 'paling banyak', 'tertinggi', 'most', 'top', 'paling sering'],
  },

  // ── Time windows ───────────────────────────────────────────────────────────
  {
    concept: 'time.today',
    category: 'time',
    canonical: 'hari ini',
    synonyms: ['hari ini', 'today', 'sekarang', 'hr ini'],
  },
  {
    concept: 'time.yesterday',
    category: 'time',
    canonical: 'kemarin',
    synonyms: ['kemarin', 'yesterday', 'kmrn'],
  },
  {
    concept: 'time.this_week',
    category: 'time',
    canonical: 'minggu ini',
    synonyms: ['minggu ini', 'this week', 'pekan ini', 'seminggu'],
  },
  {
    concept: 'time.this_month',
    category: 'time',
    canonical: 'bulan ini',
    synonyms: ['bulan ini', 'this month', 'sebulan'],
  },

  // ── Actions ────────────────────────────────────────────────────────────────
  {
    concept: 'action.list',
    category: 'action',
    canonical: 'daftar',
    synonyms: ['daftar', 'list', 'tampilkan', 'lihat', 'tunjukkan', 'mana aja', 'mana saja', 'apa saja'],
  },
  {
    concept: 'action.search',
    category: 'action',
    canonical: 'cari',
    synonyms: ['cari', 'search', 'temukan', 'find', 'detail'],
  },
  {
    concept: 'action.locate',
    category: 'action',
    canonical: 'cari lokasi',
    synonyms: [
      'dimana', 'di mana', 'ada dimana', 'ada di mana',
      'lokasinya dimana', 'letaknya dimana', 'posisinya dimana',
      'koordinat', 'titik koordinat', 'alamat', 'letak', 'posisi',
    ],
  },
  {
    // "tampilkan" also lives in action.list on purpose — both concepts fire and
    // the NAVIGATE intent only wins when a page entity is present (see the
    // requiredConcepts gate in intent-engine.ts); otherwise LIST behaves as before.
    concept: 'action.navigate',
    category: 'action',
    canonical: 'buka',
    synonyms: [
      'buka', 'pergi ke', 'ke halaman', 'tampilkan halaman',
      'navigasi ke', 'show', 'open', 'goto', 'go to',
      'tampilkan', 'lihat halaman', 'arahkan ke',
    ],
  },

  // ── Technical-knowledge entities & topics ──────────────────────────────────
  // Perangkat lapangan yang muncul di pertanyaan teknis/troubleshooting (bukan
  // aset ber-record di DB). NB: 'baterai' TIDAK dibuat concept baru — sudah
  // dimiliki entity.battery di atas; menduplikasinya membuat satu kata memicu
  // dua concept sekaligus.
  {
    concept: 'entity.cubicle',
    category: 'entity',
    canonical: 'cubicle',
    synonyms: ['cubicle', 'kubikel', 'kubikl', 'panel kubikel', 'cbo', 'lbs', 'acb'],
  },
  {
    concept: 'entity.selenoid',
    category: 'entity',
    canonical: 'selenoid',
    synonyms: ['selenoid', 'solenoid', 'aktuator', 'coil'],
  },
  {
    concept: 'entity.relay',
    category: 'entity',
    canonical: 'relay proteksi',
    synonyms: ['relay', 'riley', 'relay proteksi', 'relai', 'proteksi', 'overcurrent relay', 'ocr'],
  },

  // Kategori 'topic' sengaja TIDAK ada di boostCategories/triggerConcepts intent
  // mana pun — inert untuk scoring intent deterministik, murni penanda bahwa
  // pertanyaan mengarah ke knowledge teknis / panduan aplikasi (dijawab LLM dari
  // system prompt agent, bukan query DB). Beberapa sinonim juga milik concept
  // lain ('gangguan'→entity.ticket, 'bermasalah'→status.warning) — keduanya
  // match bersamaan, itu by design (satu match per concept).
  {
    concept: 'topic.troubleshoot',
    category: 'topic',
    canonical: 'troubleshoot',
    synonyms: [
      'bermasalah', 'sering error', 'hang', 'gangguan', 'penyebab', 'kenapa',
      'mengapa', 'tidak bisa', 'gagal', 'gosong', 'terbakar', 'trip',
      'tidak backup', 'tidak terbaca', 'tidak terdeteksi',
    ],
  },
  {
    concept: 'topic.recommendation',
    category: 'topic',
    canonical: 'rekomendasi',
    synonyms: [
      'saran', 'rekomendasi', 'merk terbaik', 'merk apa', 'ganti dengan',
      'pilihan terbaik', 'sebaiknya pakai', 'yang bagus',
    ],
  },
  {
    concept: 'topic.app_guide',
    category: 'topic',
    canonical: 'panduan aplikasi',
    synonyms: [
      'cara', 'bagaimana', 'gimana', 'langkah', 'tutorial', 'cara pakai',
      'cara menggunakan', 'cara buat', 'cara tambah', 'cara lihat',
      'cara upload', 'cara cek', 'cara input', 'menu apa', 'fitur apa',
    ],
  },
  {
    concept: 'topic.sp7_color',
    category: 'topic',
    canonical: 'warna sp7',
    synonyms: [
      'warna sp7', 'warna siemens', 'warna scada', 'warna hijau', 'warna merah',
      'warna abu', 'warna kuning', 'bisa rc', 'tidak bisa rc',
    ],
  },
];

// ── Matcher ───────────────────────────────────────────────────────────────--

/** Lower-case, collapse whitespace, strip most punctuation (keeps letters/digits). */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s%-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Weight longer multi-word synonyms higher — they are far less ambiguous. */
function synonymWeight(synonym: string): number {
  const words = synonym.split(' ').length;
  if (words >= 3) return 1;
  if (words === 2) return 0.85;
  if (synonym.length <= 3) return 0.5; // very short tokens (gi/gh/wo) are weak alone
  return 0.7;
}

/**
 * Resolve all dictionary concepts present in free text. Whole-word / phrase
 * matching (no substring false positives like "ava" inside "available"). Extra
 * entries (e.g. learned per-user aliases) are matched alongside the base set.
 */
export function resolveConcepts(
  text: string,
  extraEntries: DictionaryEntry[] = []
): ConceptMatch[] {
  const haystack = ` ${normalizeText(text)} `;
  const matches: ConceptMatch[] = [];
  const seen = new Set<string>();

  for (const entry of [...DOMAIN_DICTIONARY, ...extraEntries]) {
    // Longest synonyms first so "belum selesai" wins over "belum".
    const syns = [...entry.synonyms].sort((a, b) => b.length - a.length);
    for (const syn of syns) {
      const needle = ` ${normalizeText(syn)} `;
      if (haystack.includes(needle)) {
        if (seen.has(entry.concept)) break; // one match per concept is enough
        seen.add(entry.concept);
        matches.push({
          concept: entry.concept,
          category: entry.category,
          canonical: entry.canonical,
          matched: syn,
          weight: synonymWeight(syn),
        });
        break;
      }
    }
  }
  return matches;
}

/** Index for O(1) concept → entry lookups (used by clarification labels etc.). */
export const CONCEPT_INDEX: Map<string, DictionaryEntry> = new Map(
  DOMAIN_DICTIONARY.map((e) => [e.concept, e])
);