/**
 * PHASE 2 — Intent Detection Engine.
 *
 * Pure function: (text, role, learned aliases) → ranked IntentResult.
 * Deterministic, dependency-light and fully unit-testable. It NEVER touches the
 * database or an LLM — it only reasons over dictionary concepts. The LLM (when
 * enabled) is a *fallback* for low-confidence input, wired in the orchestrator.
 */

import type { CanonicalRole } from '../../../../auth/roles';
import type {
  DictionaryEntry,
  IntentCandidate,
  IntentResult,
  ConceptMatch,
} from '../brain.types';
import { resolveConcepts } from '../dictionary/domain-dictionary';
import { INTENT_CATALOG, extractLocationCode } from './intent-catalog';
import { scoreCandidate, modeForConfidence, AMBIGUITY_MARGIN } from './confidence';

const SMALLTALK_RE =
  /^\s*(hai|halo|hallo|hello|hi|pagi|siang|sore|malam|terima kasih|makasih|thanks|thank you|oke|ok|siap|test|tes)\b/i;

/** Detect the structural intent of a single user message. */
export function detectIntent(
  text: string,
  role: CanonicalRole,
  learnedAliases: DictionaryEntry[] = []
): IntentResult {
  const concepts = resolveConcepts(text, learnedAliases);

  // Greeting / smalltalk shortcut — answered directly, no query, no clarify.
  if (concepts.length === 0 && SMALLTALK_RE.test(text)) {
    const top: IntentCandidate = {
      intent: 'SMALLTALK',
      confidence: 0.95,
      slots: {},
      concepts: [],
      label: 'Sapaan',
    };
    return { top, candidates: [top], mode: 'EXECUTE' };
  }

  const candidates: IntentCandidate[] = [];

  for (const def of INTENT_CATALOG) {
    // Role gate at detection time too — a PETUGAS never even gets an
    // OPERATIONAL_INSIGHT candidate, so it can't surface in clarification.
    if (!def.allowedRoles.includes(role)) continue;

    const triggerMatches = concepts.filter((c) => def.triggerConcepts.includes(c.concept));
    if (triggerMatches.length === 0) continue;

    // Hard gate: every required concept must be present (e.g. NAVIGATE demands
    // an explicit navigate verb — a mere page mention is not a navigation ask).
    if (def.requiredConcepts?.some((rc) => !concepts.some((c) => c.concept === rc))) continue;

    const boostMatches = concepts.filter(
      (c) => def.boostCategories.includes(c.category) && !def.triggerConcepts.includes(c.concept)
    );
    const slots = def.buildSlots(concepts, text);
    const hasStrongSlot = Boolean(slots.status || slots.entity || slots.place);

    const confidence = scoreCandidate({
      triggerHits: triggerMatches.length,
      triggerWeightSum: triggerMatches.reduce((s, c) => s + c.weight, 0),
      boostHits: boostMatches.length,
      hasStrongSlot,
    });

    candidates.push({
      intent: def.id,
      confidence,
      slots,
      concepts: triggerMatches.concat(boostMatches),
      label: def.label,
    });
  }

  // Explicit gardu code (PM46/GH0033/…) is an unambiguous single-location
  // signal: lift the single-lookup candidates into the EXECUTE band so the
  // question never falls into CLARIFY, whose top option is GIS_SEARCH (a
  // place-name search that loses this tie only by catalog order). ASSET_SEARCH
  // is lifted only when the user actually named an asset entity ("aset di
  // GH0033") — and slightly above LOCATION_DETAIL so it wins when both fire.
  // Questions carrying an inspection/HAR-record concept are left alone: the
  // EQUIPMENT_INSPECTION_*/HAR_* intents own code lookups in that domain.
  const locationCode = extractLocationCode(text);
  const hasInspectionRecordConcept = concepts.some((c) => c.concept === 'entity.inspection_record');
  const hasRecordConcept =
    hasInspectionRecordConcept || concepts.some((c) => c.concept === 'entity.har_record');
  if (locationCode && hasInspectionRecordConcept) {
    // "kondisi gardu KN22" / "riwayat inspeksi PM46": EQUIPMENT_INSPECTION_
    // SUMMARY/PROBLEMS/BRANDS/DETAIL all share the same trigger concept
    // (entity.inspection_record) and tie in score, so a stable sort always
    // picked SUMMARY (first in catalog order) even though the user named a
    // specific gardu — silently ignoring the code and answering with a
    // whole-scope tally instead. Only DETAIL's buildSlots actually resolves a
    // gardu code (inspeksi.detail filters InspeksiGarduRecord by kodeGardu);
    // the other three have no per-gardu filter to lift into, so an explicit
    // code should always win the tie in DETAIL's favour.
    for (const c of candidates) {
      if (c.intent === 'EQUIPMENT_INSPECTION_DETAIL') {
        c.confidence = Math.max(c.confidence, 0.92);
      } else if (
        c.intent === 'EQUIPMENT_INSPECTION_SUMMARY' ||
        c.intent === 'EQUIPMENT_INSPECTION_PROBLEMS' ||
        c.intent === 'EQUIPMENT_INSPECTION_BRANDS'
      ) {
        c.confidence = Math.min(c.confidence, 0.9);
      }
    }
  }
  if (locationCode && !hasRecordConcept) {
    const ASSET_ENTITY_CONCEPTS = [
      'entity.asset', 'entity.router', 'entity.rtu', 'entity.battery', 'entity.rectifier',
    ];
    for (const c of candidates) {
      if (c.intent === 'LOCATION_DETAIL') {
        c.confidence = Math.max(c.confidence, 0.92);
      } else if (c.intent === 'ASSET_SEARCH') {
        // With an asset entity named ("aset/rtu di GH0033") this is the best
        // answer — lift above LOCATION_DETAIL. Triggered by status words alone
        // ("status rc gardu BT87" fires status.online+offline → 0.99) it would
        // answer a gardu question with an asset list — cap it below instead.
        c.confidence = c.concepts.some((m) => ASSET_ENTITY_CONCEPTS.includes(m.concept))
          ? Math.max(c.confidence, 0.93)
          : Math.min(c.confidence, 0.9);
      } else if (
        (c.intent === 'KPI_SCADA' || c.intent === 'KPI_COUNT') &&
        c.confidence > 0.9
      ) {
        // Global-count intents can't answer a single-gardu question ("status
        // rc gardu BT87" would return the whole-network Inscan/OOP totals) —
        // cap them below the lifted single-lookup candidates above.
        c.confidence = 0.9;
      }
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);

  if (candidates.length === 0) {
    const top: IntentCandidate = {
      intent: 'UNKNOWN',
      confidence: 0,
      slots: { keyword: text.trim() },
      concepts: concepts as ConceptMatch[],
      label: 'Tidak dikenali',
    };
    return { top, candidates: [top], mode: 'SUGGEST' };
  }

  const top = candidates[0];
  let mode = modeForConfidence(top.confidence);

  // Ambiguity override: two strong, near-tied candidates → clarify rather than
  // silently pick the first. Keeps the "yang merah mana aja" case honest.
  // Exception: a NAVIGATE that resolved a concrete page carries an explicit
  // navigate verb + page name ("buka har gh") — opening a page is cheap and
  // instantly reversible, so we never bounce that to a clarification menu.
  const second = candidates[1];
  if (
    mode === 'EXECUTE' &&
    second &&
    second.confidence >= CONFIDENCE_FLOOR &&
    top.confidence - second.confidence < AMBIGUITY_MARGIN &&
    !(top.intent === 'NAVIGATE' && top.slots.entity) &&
    // A concrete gardu code is specific enough — never bounce it to a menu
    // (same rationale as the NAVIGATE exception above).
    !top.slots.locationCode
  ) {
    mode = 'CLARIFY';
  }

  return { top, candidates, mode };
}

const CONFIDENCE_FLOOR = 0.6;