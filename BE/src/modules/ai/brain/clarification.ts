/**
 * PHASE 4 — Clarification Framework.
 *
 * Reusable: given a ranked IntentResult in the CLARIFY band (or an ambiguous
 * concept like "merah" → critical asset / rejected report / OOP), produce a
 * short numbered menu the user can pick from. The chosen option carries the
 * exact intent+slots to execute, so picking is a zero-NLU round-trip.
 *
 * Hard rule (Phase 3): we NEVER emit "Saya tidak mengerti". Worst case we fall
 * through to SUGGEST mode (see suggestions.ts).
 */

import type {
  IntentResult,
  ClarifyOption,
  BrainReply,
  IntentSlots,
  IntentId,
} from './brain.types';

/** Ambiguous surface forms that intentionally span multiple intents. */
const AMBIGUOUS_TERMS: Record<string, ClarifyOption[]> = {
  merah: [
    { id: 'asset-critical', label: 'Aset Kritis (rusak/peringatan)', intent: 'ASSET_SEARCH', slots: { status: 'status.critical' } },
    { id: 'asset-offline', label: 'Aset Offline (telekontrol putus)', intent: 'ASSET_SEARCH', slots: { status: 'status.offline' } },
    { id: 'report-rejected', label: 'Laporan Ditolak', intent: 'REPORT_SEARCH', slots: { status: 'status.rejected' } },
  ],
};

const MAX_OPTIONS = 4;

function optionFromCandidate(intent: IntentId, label: string, slots: IntentSlots): ClarifyOption {
  return { id: `${intent}:${slots.status ?? slots.entity ?? 'any'}`, label, intent, slots };
}

/**
 * Build a clarification reply from a detection result. Returns null when there
 * is nothing meaningful to clarify (caller should fall back to SUGGEST).
 */
export function buildClarification(text: string, result: IntentResult): BrainReply | null {
  const lower = text.toLowerCase();

  // 1) Hard-coded ambiguous term takes priority — explicit, curated options.
  for (const [term, options] of Object.entries(AMBIGUOUS_TERMS)) {
    if (new RegExp(`\\b${term}\\b`).test(lower)) {
      return clarifyReply(options.slice(0, MAX_OPTIONS), result);
    }
  }

  // 2) Otherwise offer the top near-tied candidates.
  const viable = result.candidates.filter((c) => c.confidence >= 0.45 && c.intent !== 'UNKNOWN');
  if (viable.length >= 2) {
    const options = viable
      .slice(0, MAX_OPTIONS)
      .map((c) => optionFromCandidate(c.intent, c.label, c.slots));
    return clarifyReply(options, result);
  }

  return null;
}

function clarifyReply(options: ClarifyOption[], result: IntentResult): BrainReply {
  const lines = options.map((o, i) => `${i + 1}. ${o.label}`);
  return {
    kind: 'clarify',
    text: `Saya menemukan beberapa kemungkinan:\n\n${lines.join('\n')}\n\nYang Anda maksud yang mana?`,
    options,
    meta: {
      intent: result.top.intent,
      confidence: result.top.confidence,
      mode: 'CLARIFY',
    },
  };
}