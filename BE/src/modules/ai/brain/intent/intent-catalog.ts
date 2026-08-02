/**
 * PHASE 2 — Intent Catalog.
 *
 * Declarative definition of every operational intent the Brain understands.
 * The engine (intent-engine.ts) scores user text against these definitions; it
 * contains no per-intent logic, so adding a capability = adding a catalog entry.
 *
 * Each intent maps (eventually) to ONE entry in the Allowed Query Registry
 * (Phase 8/9) via `queryId` — the Brain may never run anything not declared here.
 */

import type { CanonicalRole } from '../../../../auth/roles';
import type { IntentId, IntentSlots, ConceptMatch } from '../brain.types';

export interface IntentDefinition {
  id: IntentId;
  /** Short Bahasa Indonesia label used in clarification menus. */
  label: string;
  /** Concepts that, when present, strongly indicate this intent. */
  triggerConcepts: string[];
  /**
   * Concepts that must ALL be present or the candidate is skipped entirely.
   * Lets an intent list broad triggers (for scoring) while still demanding an
   * explicit cue word — e.g. NAVIGATE never fires without a navigate verb.
   */
  requiredConcepts?: string[];
  /** Concept *categories* that boost this intent (softer signal). */
  boostCategories: string[];
  /** The registered query this intent resolves to (null for SMALLTALK/UNKNOWN). */
  queryId: string | null;
  /** Roles allowed to even *attempt* this intent. */
  allowedRoles: CanonicalRole[];
  /** Example utterances — power suggestions, tests and few-shot prompting. */
  examples: string[];
  /** Build query slots from the matched concepts + raw text. */
  buildSlots: (concepts: ConceptMatch[], text: string) => IntentSlots;
}

const firstOf = (concepts: ConceptMatch[], category: string) =>
  concepts.find((c) => c.category === category)?.concept;

/**
 * Explicit gardu code in free text: 1–4 letters + 2–4 digits + optional letter
 * (PM46, GH0033, DK208, BT87, PM48A; "GH-023" → GH023). Case-insensitive —
 * users type "pm46" — and the optional hyphen is stripped so the result matches
 * the hyphen-less codes stored in `locations.code`. Deliberately requires ≥2
 * digits so SP7 / UP3 / V2 never match. Lower-cased like every other slot
 * (queries use case-insensitive `contains`).
 */
export function extractLocationCode(text: string): string | undefined {
  const m = /\b([a-zA-Z]{1,4})-?(\d{2,4})([a-zA-Z]?)\b/.exec(text);
  return m ? `${m[1]}${m[2]}${m[3]}`.toLowerCase() : undefined;
}

/** Strip known concept surface forms + filler words to isolate a free-text keyword. */
export function extractKeyword(text: string, concepts: ConceptMatch[]): string | undefined {
  let rest = ` ${text.toLowerCase()} `;
  // Strip the LONGEST matched phrases first — a longer phrase from one concept
  // can fully contain a shorter one matched by another (e.g. "kondisi gardu"
  // contains entity.gardu's bare "gardu"). Removing the short one first would
  // maim the long phrase mid-string and leave a mangled leftover ("kondisi")
  // in the extracted keyword instead of stripping it clean.
  const byLengthDesc = [...concepts].sort((a, b) => b.matched.length - a.matched.length);
  for (const c of byLengthDesc) rest = rest.replace(new RegExp(`\\b${c.matched}\\b`, 'gi'), ' ');
  const filler = ['di', 'yang', 'mana', 'aja', 'saja', 'ada', 'tolong', 'coba', 'apa', 'dong', 'kah', 'untuk', 'dengan'];
  const words = rest
    .replace(/[^\p{L}\p{N}\s%-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !filler.includes(w));
  const kw = words.join(' ').trim();
  return kw.length >= 2 ? kw : undefined;
}

/** Page entity concepts the NAVIGATE intent can resolve to (most specific wins). */
const PAGE_ENTITY_CONCEPTS = [
  'entity.page_har_gh', 'entity.page_har_mp', 'entity.page_har_gi',
  'entity.page_inspeksi_gh', 'entity.page_inspeksi_mp',
  'entity.page_work_order', 'entity.page_dashboard',
];

export const INTENT_CATALOG: IntentDefinition[] = [
  {
    id: 'NAVIGATE',
    label: 'Navigasi Halaman',
    // Page entities are triggers so "buka har gh" scores into the EXECUTE band,
    // but the requiredConcepts gate means a data question that merely MENTIONS a
    // page ("har gh rusak") never produces a NAVIGATE candidate at all.
    triggerConcepts: ['action.navigate', ...PAGE_ENTITY_CONCEPTS],
    requiredConcepts: ['action.navigate'],
    boostCategories: ['entity'],
    queryId: 'navigate',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS', 'NOC'],
    examples: ['buka har gh', 'ke halaman work order', 'tampilkan inspeksi mp'],
    buildSlots: (concepts, text) => {
      // Cari page entity yang paling spesifik.
      const pageMatch = concepts.find((c) => PAGE_ENTITY_CONCEPTS.includes(c.concept));
      // Fallback: entity.har_record + entity.gardu → derive page dari teks.
      const hasHar = concepts.some((c) => c.concept === 'entity.har_record');
      const hasGh = concepts.some(
        (c) => c.concept === 'entity.gardu' && /\bgh\b|gardu hubung/i.test(text)
      );
      const hasMp = concepts.some(
        (c) => c.concept === 'entity.gardu' && /\bmp\b|distribusi/i.test(text)
      );

      let page = pageMatch?.canonical ?? null;
      if (!page && hasHar && hasGh) page = 'har-gh';
      if (!page && hasHar && hasMp) page = 'har-mp';

      return { entity: page ?? undefined };
    },
  },
  {
    id: 'KPI_SCADA',
    label: 'Status RTU SCADA (Inscan/OOP)',
    // Sengaja DI ATAS ASSET_SEARCH/KPI_COUNT: sort kandidat stabil, jadi saat
    // skor seri (mis. "berapa gardu inscan" seri dengan KPI_COUNT) intent ini
    // yang jadi top pick — angkanya dari snapshot SP7, bukan hitung tabel.
    triggerConcepts: ['status.online', 'status.offline'],
    boostCategories: ['entity', 'metric'],
    queryId: 'kpi.count',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'NOC'],
    examples: ['berapa gardu inscan saat ini', 'berapa yang oop', 'status rc scada'],
    buildSlots: (concepts) => {
      const on = concepts.find((c) => c.concept === 'status.online');
      const off = concepts.find((c) => c.concept === 'status.offline');
      if (on && off) {
        // Satu match adalah substring match lainnya ("tidak terhubung" memuat
        // "terhubung") → frasa yang lebih panjang yang dimaksud user. Match
        // identik = frasa gabungan ('status rc') → minta Inscan+OOP sekaligus.
        if (off.matched.length > on.matched.length && off.matched.includes(on.matched)) {
          return { entity: 'entity.gardu', status: 'status.offline' };
        }
        if (on.matched.length > off.matched.length && on.matched.includes(off.matched)) {
          return { entity: 'entity.gardu', status: 'status.online' };
        }
        return { entity: 'entity.gardu', status: 'status.all_rc' };
      }
      if (on) return { entity: 'entity.gardu', status: 'status.online' };
      if (off) return { entity: 'entity.gardu', status: 'status.offline' };
      return { entity: 'entity.gardu' };
    },
  },
  {
    id: 'ASSET_SEARCH',
    label: 'Pencarian Aset',
    triggerConcepts: [
      'entity.asset', 'entity.router', 'entity.rtu', 'entity.battery', 'entity.rectifier',
      'status.offline', 'status.online', 'status.damaged', 'status.warning', 'status.uninspected',
    ],
    boostCategories: ['status'],
    queryId: 'assets.search',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    examples: ['router rusak', 'asset offline', 'aset belum inspeksi', 'rtu mati', 'baterai kritis'],
    buildSlots: (concepts, text) => {
      const locationCode = extractLocationCode(text);
      let keyword = extractKeyword(text, concepts);
      // The code filters by locations.code, not assetCode/assetName — leaving
      // it in `keyword` would AND an impossible asset-name match on top.
      if (locationCode && keyword) {
        keyword = keyword.replace(new RegExp(`\\b${locationCode}\\b`, 'i'), '').trim() || undefined;
      }
      return {
        entity: firstOf(concepts, 'entity'),
        status: firstOf(concepts, 'status'),
        keyword,
        locationCode,
      };
    },
  },
  {
    id: 'REPORT_SEARCH',
    label: 'Pencarian Laporan',
    triggerConcepts: [
      'entity.report', 'entity.inspection',
      'status.pending', 'status.approved', 'status.rejected',
    ],
    boostCategories: ['status', 'time'],
    queryId: 'reports.search',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    examples: ['laporan pending', 'laporan minggu ini', 'laporan ditolak', 'laporan belum selesai'],
    buildSlots: (concepts) => ({
      status: firstOf(concepts, 'status'),
      time: firstOf(concepts, 'time'),
    }),
  },
  {
    id: 'KPI_COUNT',
    label: 'Hitung / KPI',
    triggerConcepts: ['metric.count', 'metric.availability'],
    boostCategories: ['entity', 'metric'],
    queryId: 'kpi.count',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    examples: ['berapa gardu', 'berapa asset', 'berapa laporan', 'total user', 'jumlah tiket'],
    buildSlots: (concepts) => ({
      entity: firstOf(concepts, 'entity'),
      status: firstOf(concepts, 'status'),
    }),
  },
  {
    id: 'GIS_SEARCH',
    label: 'Pencarian Lokasi (GIS)',
    triggerConcepts: ['entity.gardu', 'place'],
    boostCategories: ['place'],
    queryId: 'gis.search',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    examples: ['gardu jakarta selatan', 'asset di depok', 'gardu di bekasi'],
    buildSlots: (concepts, text) => ({
      entity: firstOf(concepts, 'entity') ?? 'entity.gardu',
      place: extractKeyword(text, concepts),
      keyword: extractKeyword(text, concepts),
      locationCode: extractLocationCode(text),
    }),
  },
  {
    id: 'LOCATION_DETAIL',
    label: 'Detail Lokasi Gardu',
    // Requires the explicit "locate" cue (dimana/koordinat/alamat/…) alongside
    // the gardu mention so a plain "gardu di X" area search still resolves to
    // GIS_SEARCH — this intent is for a SINGLE gardu's detail, not a list.
    triggerConcepts: ['action.locate', 'entity.gardu'],
    boostCategories: [],
    queryId: 'gis.detail',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    examples: ['dimana lokasi gardu GI001', 'alamat gardu Cibinong', 'koordinat gardu GH-023'],
    buildSlots: (concepts, text) => {
      const locationCode = extractLocationCode(text);
      return {
        entity: 'entity.gardu',
        // An explicit code beats the leftover-text keyword ("kenapa gardu PM46
        // OOP" leaves non-concept words like "kenapa"-variants in the keyword).
        keyword: locationCode ?? extractKeyword(text, concepts),
        locationCode,
        // RC-status words (oop/inscan/status rc/…) → gis.detail also attaches
        // the gardu's live RC status from the latest SP7 snapshot.
        status: firstOf(concepts, 'status'),
      };
    },
  },
  {
    id: 'OPERATIONAL_INSIGHT',
    label: 'Insight Operasional',
    triggerConcepts: ['metric.most', 'metric.trend'],
    boostCategories: ['metric', 'entity'],
    queryId: 'insight.top',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN'],
    examples: [
      'wilayah paling banyak gangguan',
      'laporan paling banyak pending',
      'gardu paling sering offline',
    ],
    buildSlots: (concepts) => ({
      entity: firstOf(concepts, 'entity'),
      status: firstOf(concepts, 'status'),
    }),
  },
  {
    id: 'EQUIPMENT_INSPECTION_SUMMARY',
    label: 'Ringkasan Kondisi Peralatan (Inspeksi)',
    triggerConcepts: ['entity.inspection_record'],
    boostCategories: ['metric'],
    queryId: 'inspeksi.summary',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    examples: [
      'ringkasan hasil inspeksi gardu',
      'berapa banyak data inspeksi yang rusak',
      'kondisi peralatan gardu secara umum',
    ],
    // Sets `entity` for parity with EQUIPMENT_INSPECTION_DETAIL's hasStrongSlot
    // bonus — otherwise DETAIL would always edge out this intent on ties (an
    // asymmetry bug, not an intentional preference for DETAIL).
    buildSlots: () => ({ entity: 'entity.inspection_record' }),
  },
  {
    id: 'EQUIPMENT_INSPECTION_PROBLEMS',
    label: 'Gardu Bermasalah (dari Hasil Inspeksi)',
    triggerConcepts: ['entity.inspection_record', 'status.damaged', 'status.critical', 'status.warning'],
    boostCategories: ['entity'],
    queryId: 'inspeksi.problems',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    examples: [
      'gardu apa saja yang bermasalah dari hasil inspeksi',
      'daftar gardu paling kritis untuk diperbaiki berdasarkan data inspeksi',
      'rectifier rusak apa saja menurut riwayat inspeksi',
    ],
    // NOT `place: extractKeyword(...)` — that is virtually always truthy (any
    // leftover text), which made this intent's hasStrongSlot bonus fire even
    // with no real status word present, wrongly outranking SUMMARY/DETAIL for
    // unrelated phrasing. `status` alone is the genuine signal here.
    buildSlots: (concepts) => ({
      status: firstOf(concepts, 'status'),
    }),
  },
  {
    id: 'EQUIPMENT_INSPECTION_BRANDS',
    label: 'Analisis Merk (dari Hasil Inspeksi)',
    triggerConcepts: ['entity.inspection_record', 'attribute.brand'],
    // NOT 'entity' — entity.gardu appears in almost every question in this
    // domain, so boosting on it would make this intent tie with SUMMARY/DETAIL
    // even with no "merk" word anywhere in the message.
    boostCategories: ['metric'],
    queryId: 'inspeksi.brands',
    // Cross-site brand/failure-rate analysis — managerial tiers only, same gate
    // as OPERATIONAL_INSIGHT.
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN'],
    examples: [
      'merk rectifier apa yang paling sering rusak',
      'rekomendasikan merk baterai terbaik berdasarkan data inspeksi',
      'merk media yang paling banyak bermasalah',
    ],
    buildSlots: () => ({ entity: 'entity.inspection_record' }),
  },
  {
    id: 'EQUIPMENT_INSPECTION_DETAIL',
    label: 'Detail Kondisi Gardu (dari Hasil Inspeksi)',
    // NOT 'entity.gardu' — that word appears in almost every question in this
    // domain, which previously made DETAIL wrongly outrank SUMMARY/PROBLEMS
    // for generic phrasing (e.g. "ringkasan hasil inspeksi gardu" would try to
    // look up a gardu literally named "ringkasan"). The 'action' boost below
    // (cari/detail/temukan/dimana) is the real signal for a single-gardu lookup.
    triggerConcepts: ['entity.inspection_record'],
    boostCategories: ['action'],
    queryId: 'inspeksi.detail',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    examples: ['detail kondisi gardu BK81', 'riwayat inspeksi gardu GH0076', 'hasil inspeksi terakhir gardu D318'],
    buildSlots: (concepts, text) => ({
      entity: 'entity.inspection_record',
      keyword: extractKeyword(text, concepts),
    }),
  },
  {
    id: 'HAR_SUMMARY',
    label: 'Ringkasan Kondisi Peralatan (HAR)',
    triggerConcepts: ['entity.har_record'],
    boostCategories: ['metric'],
    queryId: 'har.summary',
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN', 'PETUGAS'],
    examples: [
      'ringkasan kondisi har',
      'berapa gardu har bermasalah',
      'ringkasan hasil har gardu',
    ],
    // Sets `entity` for parity with the inspeksi twins' hasStrongSlot bonus
    // (same tie-break rationale as EQUIPMENT_INSPECTION_SUMMARY).
    buildSlots: () => ({ entity: 'entity.har_record' }),
  },
  {
    id: 'HAR_MERK_RUSAK',
    label: 'Analisis Merk (dari Hasil HAR)',
    triggerConcepts: ['entity.har_record', 'attribute.brand'],
    // NOT 'entity' — same reasoning as EQUIPMENT_INSPECTION_BRANDS: entity
    // concepts fire on almost every question in this domain.
    boostCategories: ['metric'],
    queryId: 'har.brands',
    // Cross-site brand/failure-rate analysis — managerial tiers only, same gate
    // as EQUIPMENT_INSPECTION_BRANDS.
    allowedRoles: ['MASTER', 'MANAGER', 'ADMIN'],
    examples: [
      'merk rectifier sering rusak di har',
      'merk rtu paling banyak rusak menurut data pemeliharaan',
      'merk media bermasalah dari hasil har',
    ],
    buildSlots: () => ({ entity: 'entity.har_record' }),
  },
];

export const INTENT_INDEX = new Map<IntentId, IntentDefinition>(
  INTENT_CATALOG.map((d) => [d.id, d])
);