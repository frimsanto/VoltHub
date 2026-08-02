/**
 * PHASE 8 — AI Audit Logging.
 *
 * Records every Brain turn into the dedicated AI audit + learning trail
 * (ai_conversations). Each row carries who asked (userId + role + tenant), what
 * was interpreted (intent/confidence/mode), what ran (queryId), and crucially
 * whether it was BLOCKED (prompt injection / RBAC denial) — exactly what a
 * security reviewer needs. We use ai_conversations rather than the generic
 * audit_logs table so no new AuditAction enum value / migration is required and
 * AI telemetry stays queryable in one place.
 *
 * FAIL-SOFT: auditing never throws into the request path.
 */

import type { AiContext, IntentId, ConfidenceMode, BrainReplyKind } from '../brain.types';
import { learningRepository } from '../learning/learning.repository';

export interface AiAuditEntry {
  ctx: AiContext;
  question: string;
  intent: IntentId;
  confidence: number;
  mode: ConfidenceMode;
  replyKind: BrainReplyKind;
  queryId?: string | null;
  provider?: string;
  clarification?: string;
  blocked?: boolean;
  latencyMs?: number;
}

/** Persist one AI turn to the AI audit + learning trail (returns the row id). */
export async function auditAiTurn(entry: AiAuditEntry): Promise<string | null> {
  const { ctx } = entry;
  return learningRepository.recordConversation({
    sessionId: ctx.sessionId,
    userId: ctx.userId,
    role: ctx.role,
    rtuppId: ctx.scope.global ? null : ctx.scope.rtuppId,
    channel: ctx.channel,
    question: entry.question,
    intent: entry.intent,
    confidence: entry.confidence,
    mode: entry.mode,
    finalAction: entry.queryId ?? entry.replyKind,
    clarification: entry.clarification,
    provider: entry.provider,
    replyKind: entry.replyKind,
    blocked: entry.blocked,
    latencyMs: entry.latencyMs,
  });
}