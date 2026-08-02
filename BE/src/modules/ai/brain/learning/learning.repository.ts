/**
 * PHASE 7 — Learning data collection (write-mostly).
 *
 * Persists the learning corpus defined in schema.prisma (ai_conversations,
 * ai_feedback, ai_user_preferences, ai_aliases, ai_intents). We ONLY collect —
 * there is no auto-training here by design.
 *
 * FAIL-SOFT: every method swallows DB errors. The assistant must keep working
 * even if the learning tables haven't been migrated yet (e.g. fresh dev DB) —
 * collecting telemetry must never degrade the user-facing answer.
 */

import prisma from '../../../../config/database';
import type { DictionaryEntry } from '../brain.types';
import { loadLearnedPrefs, saveLearnedPrefs } from '../memory/user-memory.repository';

export interface ConversationRecord {
  sessionId: string;
  userId?: string;
  role?: string | null;
  rtuppId?: string | null;
  channel: string;
  question: string;
  intent?: string;
  confidence?: number;
  mode?: string;
  finalAction?: string;
  clarification?: string;
  provider?: string;
  replyKind?: string;
  blocked?: boolean;
  latencyMs?: number;
}

class LearningRepository {
  /** Record one assistant turn. Returns the row id (or null on failure). */
  async recordConversation(rec: ConversationRecord): Promise<string | null> {
    try {
      const row = await prisma.aiConversation.create({
        data: {
          sessionId: rec.sessionId,
          userId: rec.userId ?? null,
          role: rec.role ?? null,
          rtuppId: rec.rtuppId ?? null,
          channel: rec.channel,
          question: rec.question.slice(0, 2000),
          intent: rec.intent ?? null,
          confidence: rec.confidence ?? null,
          mode: rec.mode ?? null,
          finalAction: rec.finalAction ?? null,
          clarification: rec.clarification ?? null,
          provider: rec.provider ?? null,
          replyKind: rec.replyKind ?? null,
          blocked: rec.blocked ?? false,
          latencyMs: rec.latencyMs ?? null,
        },
        select: { id: true },
      });
      return row.id;
    } catch (err) {
      console.warn(`[ai.learning] recordConversation skipped: ${(err as Error).message}`);
      return null;
    }
  }

  async recordFeedback(conversationId: string, userId: string | undefined, rating: number, note?: string): Promise<boolean> {
    try {
      await prisma.aiFeedback.create({
        data: { conversationId, userId: userId ?? null, rating: rating >= 0 ? 1 : -1, note: note ?? null },
      });
      return true;
    } catch (err) {
      console.warn(`[ai.learning] recordFeedback skipped: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Record feedback AND learn from it: a -1 triggers the negative-feedback
   * analyser (fire-and-forget) so repeated complaints about the same intent
   * land in `learnedPrefs.avoidIntents`. Fail-soft like everything here.
   */
  async processFeedback(
    conversationId: string,
    userId: string | undefined,
    rating: number,
    note?: string
  ): Promise<boolean> {
    const ok = await this.recordFeedback(conversationId, userId, rating, note);
    if (ok && rating < 0 && userId) {
      void this.processNegativeFeedback(userId, conversationId);
    }
    return ok;
  }

  /**
   * When the SAME intent collects ≥ 2 negative ratings from the SAME user, add
   * it to their `learnedPrefs.avoidIntents` — the Brain then drops it from
   * clarification menus for that user (it never blocks an explicit EXECUTE).
   */
  async processNegativeFeedback(userId: string, conversationId: string): Promise<void> {
    try {
      const conv = await prisma.aiConversation.findUnique({
        where: { id: conversationId },
        select: { intent: true },
      });
      const intent = conv?.intent;
      if (!intent || intent === 'UNKNOWN') return;

      const negatives = await prisma.aiFeedback.count({
        where: { userId, rating: -1, conversation: { intent } },
      });
      if (negatives < 2) return;

      const prefs = (await loadLearnedPrefs(userId)) ?? {};
      const avoid = prefs.avoidIntents ?? [];
      if (avoid.includes(intent)) return;
      await saveLearnedPrefs(userId, { ...prefs, avoidIntents: [...avoid, intent] });
    } catch (err) {
      console.warn(`[ai.learning] processNegativeFeedback skipped: ${(err as Error).message}`);
    }
  }

  /**
   * Store a self-learned alias candidate (phrase → concept) awaiting MASTER
   * approval. Never overwrites an existing mapping for the same phrase.
   */
  async suggestAlias(userId: string | undefined, phrase: string, concept: string): Promise<void> {
    const p = phrase.trim().toLowerCase().slice(0, 120);
    if (!p || !concept) return;
    try {
      const existing = await prisma.aiAlias.findFirst({
        where: { phrase: p, OR: [{ userId: userId ?? null }, { userId: null }] },
        select: { id: true },
      });
      if (existing) return;
      await prisma.aiAlias.create({
        data: { userId: userId ?? null, phrase: p, concept, source: 'learned', approved: false },
      });
    } catch (err) {
      // Unique-constraint races land here too — losing a suggestion is fine.
      console.warn(`[ai.learning] suggestAlias skipped: ${(err as Error).message}`);
    }
  }

  /**
   * Load approved aliases visible to a user (their own + global curated) as
   * dictionary entries the matcher can fold in. Fail-soft → [].
   */
  async loadAliases(userId?: string): Promise<DictionaryEntry[]> {
    try {
      const rows = await prisma.aiAlias.findMany({
        where: {
          approved: true,
          OR: [{ userId: null }, ...(userId ? [{ userId }] : [])],
        },
        select: { phrase: true, concept: true },
        take: 200,
      });
      return rows.map((r) => ({
        concept: r.concept,
        category: conceptCategory(r.concept),
        canonical: r.phrase,
        synonyms: [r.phrase.toLowerCase()],
      }));
    } catch {
      return [];
    }
  }
}

/** Derive a concept's category from its id prefix (e.g. "status.offline"). */
function conceptCategory(concept: string): DictionaryEntry['category'] {
  const prefix = concept.split('.')[0];
  const allowed = ['entity', 'status', 'attribute', 'metric', 'place', 'time', 'action'];
  return (allowed.includes(prefix) ? prefix : 'entity') as DictionaryEntry['category'];
}

export const learningRepository = new LearningRepository();