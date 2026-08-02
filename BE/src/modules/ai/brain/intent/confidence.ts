/**
 * PHASE 3 — Confidence scoring & decision bands.
 *
 * Confidence is computed deterministically from concept evidence so the same
 * question always lands in the same band — auditable, testable, no LLM needed.
 *
 *   > 0.90  → EXECUTE  (run the query directly)
 *   0.60–0.90 → CLARIFY (ask the user to disambiguate close candidates)
 *   < 0.60  → SUGGEST  (guided suggestion mode — NEVER "saya tidak mengerti")
 */

import type { ConfidenceMode } from '../brain.types';

export const CONFIDENCE_THRESHOLDS = {
  EXECUTE: 0.9,
  CLARIFY: 0.6,
} as const;

export function modeForConfidence(confidence: number): ConfidenceMode {
  if (confidence >= CONFIDENCE_THRESHOLDS.EXECUTE) return 'EXECUTE';
  if (confidence >= CONFIDENCE_THRESHOLDS.CLARIFY) return 'CLARIFY';
  return 'SUGGEST';
}

/**
 * Score one intent candidate.
 *
 * - `triggerHits` — count of trigger concepts matched (primary, weighted).
 * - `boostHits`   — count of boost-category concepts matched (secondary).
 * - `totalConcepts` — concepts found overall (ambiguity penalty if scattered).
 *
 * Returns 0..1. The shape rewards a clean trigger match and is dampened when
 * the user's words spray across many unrelated concepts.
 */
export function scoreCandidate(params: {
  triggerHits: number;
  triggerWeightSum: number;
  boostHits: number;
  hasStrongSlot: boolean;
}): number {
  const { triggerHits, triggerWeightSum, boostHits, hasStrongSlot } = params;
  if (triggerHits === 0) return 0;

  // Base: saturating function of weighted trigger evidence.
  let score = 1 - Math.exp(-1.15 * triggerWeightSum);

  // A second corroborating trigger or a boost concept lifts confidence.
  if (triggerHits >= 2) score += 0.08;
  if (boostHits > 0) score += 0.05;
  // A concrete slot (explicit status/entity) makes the query unambiguous.
  if (hasStrongSlot) score += 0.05;

  return Math.min(score, 0.99);
}

/**
 * When two top candidates are within this margin AND both above the CLARIFY
 * floor, the Brain prefers clarification over guessing.
 */
export const AMBIGUITY_MARGIN = 0.12;