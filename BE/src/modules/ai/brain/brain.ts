/**
 * VoltHub AI Brain — Orchestrator.
 *
 * The pipeline from the spec, end to end:
 *
 *   User
 *    ↓  guardPrompt          (Phase 8 — prompt-injection screen, fail-closed)
 *    ↓  detectIntent         (Phase 2 — concepts → ranked intents)
 *    ↓  resolveFollowUp      (Phase 6 — session memory inheritance)
 *    ↓  confidence band      (Phase 3 — EXECUTE / CLARIFY / SUGGEST)
 *    ↓  authorizeQuery       (Phase 8 — Allowed Query Registry + AI RBAC filter)
 *    ↓  query services       (Phase 9 — scoped service-layer reads only)
 *    ↓  provider.composeAnswer (Phase 10 — local renderer or vendor)
 *   Database
 *
 * The Brain NEVER generates SQL, NEVER bypasses RBAC, and reaches data ONLY
 * through the registry → query services, which carry the caller's TenantScope.
 * Every turn is audited (Phase 8) and collected for learning (Phase 7).
 */

import type { AiContext, BrainReply, IntentSlots } from './brain.types';
import { detectIntent } from './intent/intent-engine';
import { modeForConfidence } from './intent/confidence';
import { buildClarification } from './clarification';
import { buildSuggestion } from './suggestions';
import { guardPrompt, INJECTION_REPLY } from './security/prompt-guard';
import { authorizeQuery } from './security/query-registry';
import { auditAiTurn } from './security/ai-audit';
import { conversationStore, resolveFollowUp, warmStartTurns } from './memory/conversation-memory';
import { loadAvoidIntents } from './memory/user-memory.repository';
import { learningRepository } from './learning/learning.repository';
import { trackAliasLearning } from './learning/alias-learning';
import { selectProvider } from './providers';
import { INTENT_INDEX } from './intent/intent-catalog';

/**
 * Handle one assistant turn. Returns a BrainReply the controller serialises.
 * `conversationId` (when present) lets the client attach feedback to this turn.
 */
export async function handleTurn(
  ctx: AiContext,
  message: string
): Promise<BrainReply & { conversationId?: string }> {
  const startedAt = Date.now();

  // ── Phase 8: prompt-injection screen (before anything else) ───────────────
  const guard = guardPrompt(message);
  if (!guard.ok) {
    const reply: BrainReply = {
      kind: 'denied',
      text: INJECTION_REPLY,
      meta: { intent: 'UNKNOWN', confidence: 0, mode: 'SUGGEST' },
    };
    const conversationId = await auditAiTurn({
      ctx,
      question: message,
      intent: 'UNKNOWN',
      confidence: 0,
      mode: 'SUGGEST',
      replyKind: 'denied',
      blocked: true,
      latencyMs: Date.now() - startedAt,
    });
    return { ...reply, conversationId: conversationId ?? undefined };
  }

  // ── Phase 2: intent detection (with learned aliases from Phase 7) ─────────
  const aliases = await learningRepository.loadAliases(ctx.userId);
  const detection = detectIntent(message, ctx.role, aliases);
  let { top } = detection;
  let slots: IntentSlots = top.slots;

  // ── Phase 6: follow-up inheritance from session memory ────────────────────
  // Cold session → warm-start from the user's persisted snapshot (fail-soft),
  // so "gardu tadi bagaimana?" still resolves after a logout/new day.
  let history = conversationStore.get(ctx.sessionId);
  if (history.length === 0) {
    history = await warmStartTurns(ctx.userId);
  }
  const followUp = resolveFollowUp(message, slots, history);
  if (followUp && top.intent === 'UNKNOWN') {
    // The new message had no intent of its own → inherit the previous one.
    top = { ...top, intent: followUp.intent, confidence: 0.92, label: INTENT_INDEX.get(followUp.intent)?.label ?? top.label };
    slots = followUp.slots;
  } else if (followUp && top.confidence < 0.9) {
    // Refinement of the same topic → merge slots, lift confidence.
    slots = followUp.slots;
    top = { ...top, intent: followUp.intent, confidence: Math.max(top.confidence, 0.9) };
  }

  const mode = modeForConfidence(top.confidence) === 'EXECUTE' && detection.mode === 'CLARIFY'
    ? 'CLARIFY'
    : modeForConfidence(top.confidence);

  // ── Phase 7b: alias self-learning (candidate collection, fail-soft) ───────
  if (top.intent !== 'SMALLTALK') {
    trackAliasLearning({
      sessionId: ctx.sessionId,
      userId: ctx.userId,
      message,
      confidence: top.confidence,
      concepts: top.concepts,
    });
  }

  // ── Smalltalk shortcut ────────────────────────────────────────────────────
  if (top.intent === 'SMALLTALK') {
    return finish(ctx, message, {
      kind: 'smalltalk',
      text: 'Halo! Saya asisten VoltHub. Tanyakan tentang gardu, aset, laporan, KPI, atau wilayah — saya jawab sesuai hak akses Anda.',
      suggestions: undefined,
      meta: { intent: 'SMALLTALK', confidence: top.confidence, mode: 'EXECUTE' },
    }, top.intent, top.confidence, startedAt);
  }

  // ── Phase 3: SUGGEST band → guided suggestions (never a dead end) ─────────
  if (mode === 'SUGGEST' || top.intent === 'UNKNOWN') {
    const reply = buildSuggestion(ctx.role);
    return finish(ctx, message, reply, top.intent, top.confidence, startedAt);
  }

  // ── Phase 3/4: CLARIFY band → clarification menu ──────────────────────────
  if (mode === 'CLARIFY') {
    const clar = buildClarification(message, detection);
    if (clar) {
      // Learned preference: drop options this user repeatedly rated -1, as long
      // as at least one option survives (never leave an empty menu).
      if (clar.options?.length) {
        const avoid = await loadAvoidIntents(ctx.userId);
        if (avoid.length > 0) {
          const kept = clar.options.filter((o) => !avoid.includes(o.intent));
          if (kept.length > 0) clar.options = kept;
        }
      }
      return finish(ctx, message, clar, top.intent, top.confidence, startedAt);
    }
    // Nothing to clarify → degrade to suggestions rather than guess.
    const reply = buildSuggestion(ctx.role);
    return finish(ctx, message, reply, top.intent, top.confidence, startedAt);
  }

  // ── EXECUTE band ──────────────────────────────────────────────────────────
  return executeIntent(ctx, message, top.intent, top.confidence, slots, startedAt);
}

/**
 * Execute a resolved intent: authorize via registry → run scoped query →
 * compose answer. Also the entry point for a clarification pick (Phase 4).
 */
export async function executeIntent(
  ctx: AiContext,
  message: string,
  intent: BrainReply['meta']['intent'],
  confidence: number,
  slots: IntentSlots,
  startedAt: number = Date.now()
): Promise<BrainReply & { conversationId?: string }> {
  const def = INTENT_INDEX.get(intent);
  const queryId = def?.queryId ?? null;

  // ── Phase 8: AI RBAC filter + Allowed Query Registry ──────────────────────
  const auth = authorizeQuery(queryId, ctx.role);
  if (!auth.ok || !auth.query) {
    const reply: BrainReply = {
      kind: 'denied',
      text:
        auth.reason === 'role-denied'
          ? 'Maaf, peran Anda tidak memiliki akses untuk informasi tersebut.'
          : 'Maaf, permintaan itu belum dapat saya proses.',
      meta: { intent, confidence, mode: 'EXECUTE', queryId: queryId ?? undefined },
    };
    const conversationId = await auditAiTurn({
      ctx, question: message, intent, confidence, mode: 'EXECUTE',
      replyKind: 'denied', queryId, blocked: auth.reason === 'role-denied',
      latencyMs: Date.now() - startedAt,
    });
    return { ...reply, conversationId: conversationId ?? undefined };
  }

  // ── Phase 9: scoped query (carries ctx.scope into the service layer) ───────
  const data = await auth.query.run(ctx, slots);

  // ── Phase 10: compose natural-language answer (local or vendor) ───────────
  const provider = selectProvider();
  const text = await provider.composeAnswer({
    ctx, question: message, data, intent,
  });

  const reply: BrainReply = {
    kind: 'answer',
    text,
    data,
    meta: { intent, confidence, mode: 'EXECUTE', queryId: auth.query.id, provider: provider.name },
  };

  // NAVIGATE: surface the resolved FE route so the client can redirect.
  const nav = data as { kind?: string; found?: boolean; path?: string } | null;
  if (intent === 'NAVIGATE' && nav?.kind === 'navigate' && nav.found && nav.path) {
    reply.navigateTo = nav.path;
  }

  return finish(ctx, message, reply, intent, confidence, startedAt, slots);
}

/** Persist memory + audit, then return the reply with its conversationId. */
async function finish(
  ctx: AiContext,
  message: string,
  reply: BrainReply,
  intent: BrainReply['meta']['intent'],
  confidence: number,
  startedAt: number,
  slots: IntentSlots = {}
): Promise<BrainReply & { conversationId?: string }> {
  // Session memory (Phase 6) — only remember resolved, answerable turns.
  // Passing the userId also queues the turn into the debounced cross-session
  // snapshot (AiUserPreference.contextSnapshot) — the personalisation layer.
  // NAVIGATE is excluded: a page-open is an action, not a data topic — letting a
  // follow-up ("yang tadi bagaimana?") inherit it would re-redirect the user.
  if (reply.kind === 'answer' && intent !== 'NAVIGATE') {
    conversationStore.append(
      ctx.sessionId,
      {
        at: Date.now(),
        question: message,
        intent,
        slots,
        answerSummary: reply.text.slice(0, 160),
      },
      ctx.userId
    );
  }

  const conversationId = await auditAiTurn({
    ctx,
    question: message,
    intent,
    confidence,
    mode: reply.meta.mode,
    replyKind: reply.kind,
    queryId: reply.meta.queryId,
    provider: reply.meta.provider,
    latencyMs: Date.now() - startedAt,
  });

  return { ...reply, conversationId: conversationId ?? undefined };
}