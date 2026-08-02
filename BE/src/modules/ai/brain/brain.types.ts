/**
 * VoltHub AI Brain — shared type contracts.
 *
 * These types are the stable seam between every layer of the Brain pipeline:
 *
 *   User → Intent Detection → Context Resolver → AI Permission Layer
 *        → VoltHub Query Services → Database
 *
 * Nothing in this file imports Prisma, Express or any vendor SDK on purpose —
 * the contracts must stay transport- and provider-agnostic so the same Brain
 * can drive the In-App Assistant today and WhatsApp / Voice channels later.
 */

import type { CanonicalRole } from '../../../auth/roles';
import type { TenantScope } from '../../../utils/tenantScope';

// ── Channels ────────────────────────────────────────────────────────────────
/** Where a request originates. Drives formatting + rate/safety policy, never RBAC. */
export type AiChannel = 'in_app' | 'whatsapp' | 'voice';

// ── Identity / context ──────────────────────────────────────────────────────
/**
 * The resolved caller context handed to every Brain layer. It is built ONCE,
 * server-side, from the authenticated principal — never from model output — so
 * the LLM can neither inflate its role nor cross a tenant boundary.
 */
export interface AiContext {
  userId: string;
  role: CanonicalRole;
  /** Tenant boundary already resolved (fail-closed) via tenantScope util. */
  scope: TenantScope;
  channel: AiChannel;
  /** Opaque per-conversation id (session memory key). */
  sessionId: string;
  locale: 'id' | 'en';
}

// ── Domain dictionary ───────────────────────────────────────────────────────
export type ConceptCategory =
  | 'entity' // gardu, asset, router, report…
  | 'status' // pending, approved, offline, critical…
  | 'attribute' // brand, capacity…
  | 'metric' // count, availability…
  | 'place' // jakarta selatan, depok (free-text place qualifier)
  | 'time' // hari ini, minggu ini, kemarin…
  | 'action' // search, count, list…
  | 'topic'; // knowledge-routing: troubleshoot, rekomendasi merk, panduan aplikasi…

export interface DictionaryEntry {
  /** Stable machine id, e.g. `status.pending`. */
  concept: string;
  category: ConceptCategory;
  /** Human canonical label (Bahasa Indonesia). */
  canonical: string;
  /** All surface forms (id/en/slang) that resolve to this concept, lower-case. */
  synonyms: string[];
}

export interface ConceptMatch {
  concept: string;
  category: ConceptCategory;
  canonical: string;
  /** The surface form that matched in the user's text. */
  matched: string;
  /** 0..1 — longer / exact phrase matches score higher. */
  weight: number;
}

// ── Intent ──────────────────────────────────────────────────────────────────
export type IntentId =
  | 'NAVIGATE'
  | 'ASSET_SEARCH'
  | 'REPORT_SEARCH'
  | 'KPI_COUNT'
  | 'KPI_SCADA'
  | 'GIS_SEARCH'
  | 'LOCATION_DETAIL'
  | 'OPERATIONAL_INSIGHT'
  | 'EQUIPMENT_INSPECTION_SUMMARY'
  | 'EQUIPMENT_INSPECTION_PROBLEMS'
  | 'EQUIPMENT_INSPECTION_BRANDS'
  | 'EQUIPMENT_INSPECTION_DETAIL'
  | 'HAR_SUMMARY'
  | 'HAR_MERK_RUSAK'
  | 'SMALLTALK'
  | 'UNKNOWN';

/** Normalised slots distilled from concept matches + free text. */
export interface IntentSlots {
  /** e.g. `status.offline`, `status.pending`, `status.critical`. */
  status?: string;
  /** Entity concept the user is asking about, e.g. `entity.asset`. */
  entity?: string;
  /** Free-text place qualifier ("jakarta selatan"), passed to query as search. */
  place?: string;
  /** Relative time window concept, e.g. `time.this_week`. */
  time?: string;
  /** Raw search keyword (gardu code / name) when present. */
  keyword?: string;
  /** Explicit gardu code detected in the text (PM46, GH0033, …) — an
   *  unambiguous single-location signal; see extractLocationCode. */
  locationCode?: string;
}

export interface IntentCandidate {
  intent: IntentId;
  /** 0..1 confidence. */
  confidence: number;
  slots: IntentSlots;
  /** Concepts that drove this candidate (for explainability + learning). */
  concepts: ConceptMatch[];
  /** Short human label used in clarification menus. */
  label: string;
}

export interface IntentResult {
  /** Best candidate (may be UNKNOWN). */
  top: IntentCandidate;
  /** All ranked candidates (incl. top), highest first. */
  candidates: IntentCandidate[];
  /** The decision band derived from confidence (see confidence.ts). */
  mode: ConfidenceMode;
}

// ── Confidence (Phase 3) ────────────────────────────────────────────────────
/**
 * EXECUTE   (>0.90) — run the resolved query directly.
 * CLARIFY   (0.60–0.90) — ask the user to pick between close candidates.
 * SUGGEST   (<0.60) — guided suggestion mode (never "I don't understand").
 */
export type ConfidenceMode = 'EXECUTE' | 'CLARIFY' | 'SUGGEST';

// ── Brain response envelope ─────────────────────────────────────────────────
export type BrainReplyKind = 'answer' | 'clarify' | 'suggest' | 'denied' | 'smalltalk';

export interface ClarifyOption {
  id: string;
  label: string;
  /** The intent+slots that will be executed if the user picks this option. */
  intent: IntentId;
  slots: IntentSlots;
}

export interface BrainReply {
  kind: BrainReplyKind;
  /** Bahasa Indonesia text shown to the user. */
  text: string;
  /** Structured data the UI can render (tables/cards). Present for `answer`. */
  data?: unknown;
  /** Options for `clarify`; suggested questions for `suggest`. */
  options?: ClarifyOption[];
  suggestions?: string[];
  /** FE route path to redirect to (NAVIGATE intent). The client intercepts this. */
  navigateTo?: string;
  /** Debug/telemetry — never required by the client. */
  meta: {
    intent: IntentId;
    confidence: number;
    mode: ConfidenceMode;
    queryId?: string;
    toolsUsed?: string[];
    provider?: string;
  };
}