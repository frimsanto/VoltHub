/**
 * PHASE 5 — Role-aware Suggested Questions.
 *
 * Two jobs:
 *   1. Seed the empty-state of the assistant with things THIS role can ask.
 *   2. Power "guided suggestion mode" (Phase 3 SUGGEST band) so the Brain
 *      ALWAYS responds with actionable next steps instead of a dead end.
 *
 * Suggestions are filtered to the caller's role so a PETUGAS is never nudged
 * toward MANAGER/MASTER-only questions they couldn't run anyway.
 */

import type { CanonicalRole } from '../../../auth/roles';
import type { BrainReply } from './brain.types';

const SUGGESTIONS: Record<CanonicalRole, string[]> = {
  PETUGAS: [
    'Kunjungan hari ini',
    'Asset belum inspeksi',
    'Laporan pending',
    'Aset rusak di gardu saya',
    'Kondisi peralatan gardu dari hasil inspeksi',
  ],
  ADMIN: [
    'Validasi pending',
    'Gardu bermasalah',
    'Asset offline',
    'Laporan ditolak minggu ini',
    'Gardu bermasalah dari hasil inspeksi',
  ],
  MANAGER: [
    'KPI wilayah',
    'Trend laporan',
    'Approval performance',
    'Wilayah paling banyak gangguan',
    'Merk rectifier paling sering rusak',
  ],
  MASTER: [
    'Total user',
    'Total asset',
    'Audit activity',
    'Wilayah paling banyak gangguan',
    'Ringkasan data inspeksi gardu',
  ],
  // NOC — control-room monitoring surface only (SCADA/GIS/lokasi, no laporan).
  NOC: [
    'Gardu bermasalah',
    'Asset offline',
    'Lokasi gardu',
    'Wilayah paling banyak gangguan',
  ],
};

export function suggestedQuestions(role: CanonicalRole): string[] {
  return SUGGESTIONS[role] ?? SUGGESTIONS.PETUGAS;
}

/**
 * Build the guided-suggestion reply for low-confidence input. Friendly, never a
 * dead end — restates we're ready and offers role-appropriate starting points.
 */
export function buildSuggestion(role: CanonicalRole): BrainReply {
  const suggestions = suggestedQuestions(role);
  return {
    kind: 'suggest',
    text:
      'Saya belum yakin dengan maksud Anda, tapi saya bisa membantu hal-hal berikut. ' +
      'Coba salah satu, atau ketik ulang dengan kata kunci seperti gardu, aset, laporan, atau wilayah:',
    suggestions,
    meta: { intent: 'UNKNOWN', confidence: 0, mode: 'SUGGEST' },
  };
}