/**
 * PERSONALISATION — Cross-session user memory.
 *
 * The ConversationStore (conversation-memory.ts) only lives for one session
 * (in-memory, 30 min TTL). This repository persists a COMPACT snapshot of what
 * the user talks about — never a full transcript — into
 * `AiUserPreference.contextSnapshot`, plus learned output preferences into
 * `AiUserPreference.learnedPrefs`. A new session loads the snapshot back as
 * "warm context" so the assistant can resolve "gardu tadi bagaimana?" across
 * sessions.
 *
 * FAIL-SOFT: every function swallows DB errors. Personalisation must never
 * degrade the user-facing answer — worst case the assistant simply starts cold.
 */

import { Prisma } from '@prisma/client';
import prisma from '../../../../config/database';

export interface UserContext {
  lastIntent?: string;
  lastGardu?: string;
  lastUp3?: string;
  /** Topic slugs derived from intent prefixes ('asset', 'har', …), last 10 unique. */
  lastTopics: string[];
  /** Most-asked intents, kept to the top 5 by count. */
  topIntents: { id: string; count: number }[];
  lastActiveAt: string; // ISO date
}

export interface LearnedPrefs {
  preferDetail?: boolean;
  preferBahasa?: 'id' | 'formal' | 'singkat';
  /** Intents this user rated -1 at least twice — skipped in clarify options. */
  avoidIntents?: string[];
  topGardu?: string[];
  topPenyulang?: string[];
  /** Internal frequency counters backing topGardu/topPenyulang (capped). */
  garduHits?: Record<string, number>;
  penyulangHits?: Record<string, number>;
}

/** Facts distilled from one successful turn, fed into the snapshot. */
export interface TurnFacts {
  intent: string;
  gardu?: string;
  up3?: string;
  penyulang?: string;
}

const TOP_INTENTS_MAX = 5;
const TOPICS_MAX = 10;
const HIT_KEYS_MAX = 20;

export function defaultContext(): UserContext {
  return { lastTopics: [], topIntents: [], lastActiveAt: new Date().toISOString() };
}

// ── contextSnapshot ──────────────────────────────────────────────────────────

export async function loadUserContext(userId: string): Promise<UserContext | null> {
  if (!userId) return null;
  try {
    const row = await prisma.aiUserPreference.findUnique({
      where: { userId },
      select: { contextSnapshot: true },
    });
    const raw = row?.contextSnapshot;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const snap = raw as Record<string, unknown>;
    return {
      lastIntent: typeof snap.lastIntent === 'string' ? snap.lastIntent : undefined,
      lastGardu: typeof snap.lastGardu === 'string' ? snap.lastGardu : undefined,
      lastUp3: typeof snap.lastUp3 === 'string' ? snap.lastUp3 : undefined,
      lastTopics: Array.isArray(snap.lastTopics)
        ? snap.lastTopics.filter((t): t is string => typeof t === 'string')
        : [],
      topIntents: Array.isArray(snap.topIntents)
        ? snap.topIntents
            .filter(
              (i): i is { id: string; count: number } =>
                !!i && typeof i === 'object' && typeof (i as { id?: unknown }).id === 'string'
            )
            .map((i) => ({ id: i.id, count: Number(i.count) || 0 }))
        : [],
      lastActiveAt:
        typeof snap.lastActiveAt === 'string' ? snap.lastActiveAt : new Date(0).toISOString(),
    };
  } catch (err) {
    console.warn(`[ai.memory] loadUserContext skipped: ${(err as Error).message}`);
    return null;
  }
}

export async function saveUserContext(userId: string, ctx: UserContext): Promise<void> {
  if (!userId) return;
  try {
    const snapshot = ctx as unknown as Prisma.InputJsonValue;
    await prisma.aiUserPreference.upsert({
      where: { userId },
      create: { userId, contextSnapshot: snapshot },
      update: { contextSnapshot: snapshot },
    });
  } catch (err) {
    console.warn(`[ai.memory] saveUserContext skipped: ${(err as Error).message}`);
  }
}

// ── learnedPrefs ─────────────────────────────────────────────────────────────

export async function loadLearnedPrefs(userId: string): Promise<LearnedPrefs | null> {
  if (!userId) return null;
  try {
    const row = await prisma.aiUserPreference.findUnique({
      where: { userId },
      select: { learnedPrefs: true },
    });
    const raw = row?.learnedPrefs;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    return raw as LearnedPrefs;
  } catch (err) {
    console.warn(`[ai.memory] loadLearnedPrefs skipped: ${(err as Error).message}`);
    return null;
  }
}

export async function saveLearnedPrefs(userId: string, prefs: LearnedPrefs): Promise<void> {
  if (!userId) return;
  try {
    const value = prefs as unknown as Prisma.InputJsonValue;
    await prisma.aiUserPreference.upsert({
      where: { userId },
      create: { userId, learnedPrefs: value },
      update: { learnedPrefs: value },
    });
  } catch (err) {
    console.warn(`[ai.memory] saveLearnedPrefs skipped: ${(err as Error).message}`);
  }
}

/** avoidIntents shortcut used on the hot clarify path. Fail-soft → []. */
export async function loadAvoidIntents(userId: string): Promise<string[]> {
  const prefs = await loadLearnedPrefs(userId);
  return prefs?.avoidIntents?.filter((i) => typeof i === 'string') ?? [];
}

// ── Merging turns into the snapshot ──────────────────────────────────────────

/** Topic slug from an intent id prefix: ASSET_SEARCH → 'asset', HAR_SUMMARY → 'har'. */
function topicOf(intent: string): string {
  return intent.split('_')[0].toLowerCase();
}

export function mergeTurnIntoContext(ctx: UserContext, turn: TurnFacts): UserContext {
  const topIntents = [...ctx.topIntents];
  const hit = topIntents.find((i) => i.id === turn.intent);
  if (hit) hit.count += 1;
  else topIntents.push({ id: turn.intent, count: 1 });
  topIntents.sort((a, b) => b.count - a.count);

  const topic = topicOf(turn.intent);
  const lastTopics = [topic, ...ctx.lastTopics.filter((t) => t !== topic)].slice(0, TOPICS_MAX);

  return {
    lastIntent: turn.intent,
    lastGardu: turn.gardu ?? ctx.lastGardu,
    lastUp3: turn.up3 ?? ctx.lastUp3,
    lastTopics,
    topIntents: topIntents.slice(0, TOP_INTENTS_MAX),
    lastActiveAt: new Date().toISOString(),
  };
}

/** Bump a frequency map, keeping at most HIT_KEYS_MAX keys (drop the rarest). */
function bumpHits(hits: Record<string, number> | undefined, key: string): Record<string, number> {
  const out = { ...(hits ?? {}) };
  out[key] = (out[key] ?? 0) + 1;
  const keys = Object.keys(out);
  if (keys.length > HIT_KEYS_MAX) {
    keys
      .sort((a, b) => out[a] - out[b])
      .slice(0, keys.length - HIT_KEYS_MAX)
      .forEach((k) => delete out[k]);
  }
  return out;
}

function topKeys(hits: Record<string, number> | undefined, n: number): string[] {
  return Object.entries(hits ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/**
 * Fold one or more successful turns into the persisted snapshot + learned
 * prefs (topGardu/topPenyulang frequencies). One load + one save per batch —
 * the debounced flusher in conversation-memory.ts batches turns per user.
 */
export async function updateUserContextAfterTurns(
  userId: string,
  turns: TurnFacts[]
): Promise<void> {
  if (!userId || turns.length === 0) return;
  try {
    let ctx = (await loadUserContext(userId)) ?? defaultContext();
    for (const turn of turns) ctx = mergeTurnIntoContext(ctx, turn);
    await saveUserContext(userId, ctx);

    const mentioned = turns.filter((t) => t.gardu || t.penyulang);
    if (mentioned.length > 0) {
      const prefs = (await loadLearnedPrefs(userId)) ?? {};
      for (const t of mentioned) {
        if (t.gardu) prefs.garduHits = bumpHits(prefs.garduHits, t.gardu);
        if (t.penyulang) prefs.penyulangHits = bumpHits(prefs.penyulangHits, t.penyulang);
      }
      prefs.topGardu = topKeys(prefs.garduHits, 5);
      prefs.topPenyulang = topKeys(prefs.penyulangHits, 5);
      await saveLearnedPrefs(userId, prefs);
    }
  } catch (err) {
    console.warn(`[ai.memory] updateUserContextAfterTurns skipped: ${(err as Error).message}`);
  }
}

/** Single-turn convenience wrapper (spec name). */
export async function updateUserContextAfterTurn(userId: string, turn: TurnFacts): Promise<void> {
  return updateUserContextAfterTurns(userId, [turn]);
}

/**
 * User-initiated "forget me": null out both snapshot and learned prefs. The
 * caller (controller) also discards any pending debounced save so a queued
 * flush cannot resurrect the data seconds later.
 */
export async function clearUserMemory(userId: string): Promise<void> {
  if (!userId) return;
  try {
    await prisma.aiUserPreference.updateMany({
      where: { userId },
      data: { contextSnapshot: Prisma.DbNull, learnedPrefs: Prisma.DbNull },
    });
  } catch (err) {
    console.warn(`[ai.memory] clearUserMemory skipped: ${(err as Error).message}`);
  }
}
