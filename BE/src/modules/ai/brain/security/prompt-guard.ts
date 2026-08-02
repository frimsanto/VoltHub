/**
 * PHASE 8 — Prompt Injection Protection.
 *
 * First line of defence, BEFORE intent detection. It does not "ask the model" —
 * it is a deterministic screen that rejects attempts to subvert the assistant
 * (jailbreaks, data-exfiltration phrasing, raw SQL). Because the Brain never
 * lets the LLM touch the DB (Rule #1) injection cannot read data directly, but
 * blocking it here keeps the audit trail clean and prevents the model from being
 * talked into off-domain behaviour.
 */

export interface GuardResult {
  ok: boolean;
  /** Why it was blocked (for audit + a polite user-facing message). */
  reason?: string;
}

const INJECTION_PATTERNS: { re: RegExp; reason: string }[] = [
  { re: /\b(abaikan|lupakan|hiraukan)\b.*\b(aturan|instruksi|perintah|sistem|sebelumnya|di atas)\b/i, reason: 'instruction-override' },
  { re: /\bignore\b.*\b(previous|above|all)\b.*\b(instruction|rule|prompt)\b/i, reason: 'instruction-override' },
  { re: /\b(tampilkan|berikan|dump|ekspor|export)\b.*\b(seluruh|semua)\b.*\b(database|data|tabel|table|user|password)\b/i, reason: 'data-exfiltration' },
  { re: /\b(show|reveal|print|leak)\b.*\b(system prompt|all (users|passwords|data)|entire database)\b/i, reason: 'data-exfiltration' },
  { re: /\b(you are now|act as|pretend to be|jadilah|berperan sebagai)\b.*\b(admin|root|developer|dan|mode)\b/i, reason: 'role-hijack' },
  { re: /\b(bypass|lewati|nonaktifkan|disable)\b.*\b(rbac|security|keamanan|permission|izin|filter|scope)\b/i, reason: 'security-bypass' },
  { re: /\b(select|insert|update|delete|drop|union|truncate)\s+(\*|from|into|table|database|all)\b/i, reason: 'raw-sql' },
  { re: /\bselect\s+\*/i, reason: 'raw-sql' },
  { re: /(;|--)\s*(drop|delete|update)\b/i, reason: 'raw-sql' },
  { re: /\b(reveal|bocorkan|tunjukkan)\b.*\b(api key|secret|token|kredensial|credential)\b/i, reason: 'secret-probe' },
];

// Hard length cap — pathological inputs are rejected before any work happens.
const MAX_LEN = 2000;

export function guardPrompt(text: string): GuardResult {
  if (!text || !text.trim()) return { ok: false, reason: 'empty' };
  if (text.length > MAX_LEN) return { ok: false, reason: 'too-long' };

  for (const { re, reason } of INJECTION_PATTERNS) {
    if (re.test(text)) return { ok: false, reason };
  }
  return { ok: true };
}

/** Polite, non-revealing rejection text (Bahasa Indonesia). */
export const INJECTION_REPLY =
  'Maaf, saya hanya dapat membantu pertanyaan operasional VoltHub (gardu, aset, ' +
  'laporan, KPI, wilayah) sesuai hak akses Anda. Silakan ajukan pertanyaan terkait itu.';