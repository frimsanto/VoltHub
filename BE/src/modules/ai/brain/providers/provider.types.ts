/**
 * PHASE 10 — LLM Provider Abstraction (architecture only, no integration).
 *
 * VoltHub AI must NEVER depend on a single vendor. The Brain's deterministic
 * core (dictionary + intent + query services) works with NO provider at all.
 * A provider is an OPTIONAL enhancement used for two things only:
 *   1. NLU fallback — rephrase a low-confidence question into Brain slots.
 *   2. Natural-language answer generation from STRUCTURED query results.
 *
 * A provider is NEVER given DB access, SQL, or the ability to bypass the
 * registry/RBAC. It only ever sees the question + the already-scoped, already-
 * fetched result data. This is the architectural guarantee behind Rule #1.
 */

import type { AiContext } from '../brain.types';

export type ProviderName = 'local' | 'claude' | 'openai' | 'gemini';

export interface ProviderChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ComposeAnswerInput {
  ctx: AiContext;
  question: string;
  /** The structured, already-scoped result from a query service. */
  data: unknown;
  /** Compact intent label for grounding (e.g. "ASSET_SEARCH"). */
  intent: string;
  history?: ProviderChatTurn[];
}

export interface LlmProvider {
  readonly name: ProviderName;
  /** Whether this provider is configured & usable right now. */
  isEnabled(): boolean;
  /**
   * Turn structured data into a grounded natural-language answer. The provider
   * MUST answer only from `data` — it has no other source of truth.
   */
  composeAnswer(input: ComposeAnswerInput): Promise<string>;
}