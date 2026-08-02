/**
 * PHASE 7b — Alias self-learning (candidate collection only).
 *
 * Loop: the user types a word the Brain does not recognise (confidence < 0.4).
 * We remember the oddest unknown token for that session. If the user then
 * reformulates and the Brain answers confidently (≥ 0.9) with a message that
 * shares vocabulary with the failed one, the unknown token is proposed as an
 * alias for the concept that drove the successful turn — stored in `ai_aliases`
 * with `approved: false, source: 'learned'`. Nothing is used at runtime until
 * a MASTER approves it (loadAliases only merges `approved: true`).
 *
 * State is a tiny in-process TTL map keyed by sessionId — losing it on restart
 * merely loses a suggestion, never an answer. Everything here is fail-soft.
 */

import type { ConceptMatch } from '../brain.types';
import { normalizeText } from '../dictionary/domain-dictionary';
import { learningRepository } from './learning.repository';

const PENDING_TTL_MS = 10 * 60 * 1000;
const SUCCESS_CONFIDENCE = 0.9;
const UNKNOWN_CONFIDENCE = 0.4;

interface PendingUnknown {
  token: string;
  /** Non-stopword tokens of the failed message, to test "same reformulation". */
  contextTokens: string[];
  at: number;
}

const pendingUnknown = new Map<string, PendingUnknown>();

// Common Indonesian/chat filler that can never be a domain alias.
const STOPWORDS = new Set([
  'yang', 'berapa', 'banyak', 'jumlah', 'apa', 'apakah', 'siapa', 'kapan', 'mana', 'dimana',
  'bagaimana', 'gimana', 'kenapa', 'tolong', 'mohon', 'coba', 'saja', 'aja', 'dong', 'deh',
  'kah', 'nya', 'saya', 'kamu', 'anda', 'kita', 'ada', 'tidak', 'bukan', 'belum', 'sudah',
  'lagi', 'masih', 'akan', 'bisa', 'boleh', 'harus', 'dari', 'untuk', 'dengan', 'dalam',
  'pada', 'kepada', 'atau', 'dan', 'juga', 'itu', 'ini', 'tadi', 'kemarin', 'sekarang',
  'hari', 'minggu', 'bulan', 'tahun', 'semua', 'seluruh', 'setiap', 'paling', 'sangat',
  'lihat', 'tampilkan', 'kasih', 'tunjukkan', 'cariin', 'informasi', 'data', 'sistem',
]);

function tokensOf(message: string): string[] {
  return normalizeText(message)
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !/^\d+$/.test(t) && !STOPWORDS.has(t));
}

/**
 * The "oddest" token of a low-confidence message: the longest non-stopword
 * token that no dictionary/alias concept matched. Null when everything is
 * either known or filler (nothing worth learning).
 */
export function extractUnknownToken(message: string, concepts: ConceptMatch[]): string | null {
  const knownWords = new Set<string>();
  for (const c of concepts) {
    for (const w of normalizeText(c.matched).split(/\s+/)) knownWords.add(w);
  }
  const candidates = tokensOf(message).filter((t) => t.length >= 4 && !knownWords.has(t));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.length - a.length)[0];
}

/** Pick the concept that best explains the successful turn (entity/status first). */
function dominantConcept(concepts: ConceptMatch[]): string | null {
  const rank: Record<string, number> = { entity: 0, status: 1, metric: 2, attribute: 3 };
  const eligible = concepts.filter((c) => c.category in rank);
  const pool = eligible.length > 0 ? eligible : concepts;
  if (pool.length === 0) return null;
  return [...pool].sort(
    (a, b) => (rank[a.category] ?? 9) - (rank[b.category] ?? 9) || b.weight - a.weight
  )[0].concept;
}

/**
 * Feed one turn into the self-learning loop. Called by the orchestrator after
 * intent resolution; synchronous except for the fire-and-forget DB upsert.
 */
export function trackAliasLearning(opts: {
  sessionId: string;
  userId?: string;
  message: string;
  confidence: number;
  concepts: ConceptMatch[];
}): void {
  const now = Date.now();
  const pending = pendingUnknown.get(opts.sessionId);
  if (pending && now - pending.at > PENDING_TTL_MS) {
    pendingUnknown.delete(opts.sessionId);
  }

  // Successful turn right after an unrecognised one → propose the mapping,
  // but only when the reformulation still talks about the same thing.
  if (opts.confidence >= SUCCESS_CONFIDENCE) {
    const p = pendingUnknown.get(opts.sessionId);
    pendingUnknown.delete(opts.sessionId);
    if (!p || now - p.at > PENDING_TTL_MS) return;
    const successTokens = new Set(tokensOf(opts.message));
    const sameTopic = p.contextTokens.some((t) => t !== p.token && successTokens.has(t));
    if (!sameTopic) return;
    const concept = dominantConcept(opts.concepts);
    if (concept) void learningRepository.suggestAlias(opts.userId, p.token, concept);
    return;
  }

  // Unrecognised turn → remember its oddest token as an alias candidate.
  if (opts.confidence < UNKNOWN_CONFIDENCE) {
    const token = extractUnknownToken(opts.message, opts.concepts);
    if (token) {
      pendingUnknown.set(opts.sessionId, {
        token,
        contextTokens: tokensOf(opts.message),
        at: now,
      });
    }
  }
}
