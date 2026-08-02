/**
 * PHASE 6 — Conversation Memory (session scope) + cross-session warm start.
 *
 * Lets follow-ups resolve against the previous turn:
 *
 *   User: "berapa gardu pending"   → Brain answers, remembers {intent, slots}
 *   User: "yang kemarin bagaimana" → Brain inherits the prior intent+slots and
 *                                     only overrides the time slot.
 *
 * Session turns live in an in-process TTL map: zero infra, fine for a single
 * API node. The store is swappable (interface) so a Redis-backed implementation
 * can drop in for multi-node without touching callers.
 *
 * PERSONALISATION (additive): when `append()` receives a userId, the turn is
 * queued into a per-user debounced flush (one DB write per user per minute at
 * most) that folds it into `AiUserPreference.contextSnapshot` via
 * user-memory.repository. When a session starts cold, `warmStartTurns()`
 * reconstructs up to 3 synthetic prior turns from that snapshot so follow-ups
 * like "gardu tadi bagaimana?" survive a logout. All of it is fail-soft.
 */

import type { IntentId, IntentSlots } from '../brain.types';
import { INTENT_INDEX } from '../intent/intent-catalog';
import {
  loadUserContext,
  updateUserContextAfterTurns,
  type TurnFacts,
} from './user-memory.repository';

export interface ConversationTurn {
  at: number;
  question: string;
  intent: IntentId;
  slots: IntentSlots;
  /** Compact note of what was answered, for the LLM-fallback transcript. */
  answerSummary?: string;
}

interface SessionState {
  turns: ConversationTurn[];
  updatedAt: number;
}

export interface ConversationStore {
  get(sessionId: string): ConversationTurn[];
  /** `userId` (optional, additive) also queues the turn for the persisted
   *  cross-session snapshot via the debounced flusher below. */
  append(sessionId: string, turn: ConversationTurn, userId?: string): void;
  clear(sessionId: string): void;
}

const TTL_MS = 30 * 60 * 1000; // 30 min idle → forget
const MAX_TURNS = 12;

class InMemoryConversationStore implements ConversationStore {
  private sessions = new Map<string, SessionState>();

  get(sessionId: string): ConversationTurn[] {
    const s = this.sessions.get(sessionId);
    if (!s) return [];
    if (Date.now() - s.updatedAt > TTL_MS) {
      this.sessions.delete(sessionId);
      return [];
    }
    return s.turns;
  }

  append(sessionId: string, turn: ConversationTurn, userId?: string): void {
    this.sweep();
    const s = this.sessions.get(sessionId) ?? { turns: [], updatedAt: 0 };
    s.turns.push(turn);
    if (s.turns.length > MAX_TURNS) s.turns = s.turns.slice(-MAX_TURNS);
    s.updatedAt = Date.now();
    this.sessions.set(sessionId, s);
    if (userId) queueUserContextSave(userId, turn);
  }

  clear(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Drop idle sessions opportunistically (no timers, no leaks). */
  private sweep(): void {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.updatedAt > TTL_MS) this.sessions.delete(id);
    }
  }
}

export const conversationStore: ConversationStore = new InMemoryConversationStore();

/** Pure follow-up words that carry no intent of their own (need prior context). */
const FOLLOWUP_RE =
  /\b(yang itu|itu|tadi|sebelumnya|yang kemarin|yang tadi|bagaimana|gimana|kalau|lalu|terus|nya)\b/i;

/**
 * Decide whether the new turn is a follow-up that should inherit the previous
 * intent. Returns the merged slots (prior overlaid with any newly-detected
 * slots) when so, else null.
 */
export function resolveFollowUp(
  text: string,
  newSlots: IntentSlots,
  history: ConversationTurn[]
): { intent: IntentId; slots: IntentSlots } | null {
  const last = history[history.length - 1];
  if (!last) return null;

  // A follow-up either matches the cue words OR carries only a single delta slot
  // (e.g. just a new time window) on top of an existing conversation.
  const looksFollowUp = FOLLOWUP_RE.test(text);
  const onlyDelta =
    !newSlots.entity && !newSlots.keyword && (Boolean(newSlots.time) || Boolean(newSlots.status));

  if (!looksFollowUp && !onlyDelta) return null;

  return {
    intent: last.intent,
    slots: { ...last.slots, ...stripEmpty(newSlots) },
  };
}

function stripEmpty(slots: IntentSlots): IntentSlots {
  const out: IntentSlots = {};
  (Object.keys(slots) as (keyof IntentSlots)[]).forEach((k) => {
    if (slots[k]) out[k] = slots[k];
  });
  return out;
}

// ── Cross-session persistence (debounced) ───────────────────────────────────

const SAVE_DEBOUNCE_MS = 60 * 1000; // ≤1 DB write per user per minute

interface PendingSave {
  timer: ReturnType<typeof setTimeout>;
  turns: TurnFacts[];
}

const pendingSaves = new Map<string, PendingSave>();

/** Distil the persistable facts out of a session turn. */
function turnFacts(turn: ConversationTurn): TurnFacts {
  const keyword = turn.slots.keyword?.trim();
  // Only short keywords are plausibly a gardu code/name — a long keyword is
  // usually the raw question echoed into the slot, useless as memory.
  const gardu = keyword && keyword.length <= 20 ? keyword.toUpperCase() : undefined;
  return { intent: turn.intent, gardu, up3: turn.slots.place?.trim() || undefined };
}

/**
 * Queue a turn for the user's persisted snapshot. The first turn arms a timer;
 * later turns pile onto the same batch (throttle, not reset — a chatty session
 * still persists within a minute). The flush folds the whole batch in one
 * load-merge-save. Fail-soft end to end.
 */
function queueUserContextSave(userId: string, turn: ConversationTurn): void {
  const facts = turnFacts(turn);
  const pending = pendingSaves.get(userId);
  if (pending) {
    pending.turns.push(facts);
    return;
  }
  const timer = setTimeout(() => {
    const batch = pendingSaves.get(userId);
    pendingSaves.delete(userId);
    if (batch) void updateUserContextAfterTurns(userId, batch.turns);
  }, SAVE_DEBOUNCE_MS);
  timer.unref?.(); // never keep the process alive for a telemetry write
  pendingSaves.set(userId, { timer, turns: [facts] });
}

/** Drop any queued snapshot write — used by "Hapus Riwayat AI" so a pending
 *  flush cannot resurrect data the user just deleted. */
export function discardPendingUserContext(userId: string): void {
  const pending = pendingSaves.get(userId);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingSaves.delete(userId);
}

// ── Cross-session warm start ─────────────────────────────────────────────────

/** Snapshots older than this start cold — a week-old "gardu tadi" misleads. */
const WARM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Reconstruct up to 3 synthetic prior turns from the persisted snapshot, for
 * sessions that start with no in-memory history. The LAST turn carries the
 * snapshot's lastIntent/lastGardu/lastUp3 so `resolveFollowUp` inherits it
 * exactly like a same-session follow-up. Fail-soft → [].
 */
export async function warmStartTurns(userId: string): Promise<ConversationTurn[]> {
  const ctx = await loadUserContext(userId);
  if (!ctx?.lastIntent) return [];

  const lastActive = Date.parse(ctx.lastActiveAt);
  if (!Number.isFinite(lastActive) || Date.now() - lastActive > WARM_MAX_AGE_MS) return [];

  const validIntent = (id: string): id is IntentId => INTENT_INDEX.has(id as IntentId);
  const turns: ConversationTurn[] = [];

  // Background turns from the user's most-asked intents (context, no slots).
  for (const ti of ctx.topIntents) {
    if (turns.length >= 2) break;
    if (ti.id === ctx.lastIntent || !validIntent(ti.id)) continue;
    turns.push({ at: lastActive, question: `(sesi sebelumnya) ${ti.id}`, intent: ti.id, slots: {} });
  }

  // Primary turn: what the user was last talking about (drives follow-ups).
  if (validIntent(ctx.lastIntent)) {
    const slots: IntentSlots = {};
    if (ctx.lastGardu) slots.keyword = ctx.lastGardu.toLowerCase();
    if (ctx.lastUp3) slots.place = ctx.lastUp3;
    turns.push({
      at: lastActive,
      question: '(sesi sebelumnya)',
      intent: ctx.lastIntent,
      slots,
      answerSummary: undefined,
    });
  }

  return turns.slice(-3);
}