// VoltHub — AI Assistant: Prompt Builder (architecture only).
//
// Two responsibilities, both deterministic and offline:
//   1. classifyIntent() — natural language → a structured {AssistantIntent}.
//      This is the "prompt builder" front-half: it normalises the user's free
//      text into slots (region / status / time range / asset type) so a data
//      source can be selected BEFORE any model is connected, and so the future
//      LLM is handed a grounded, machine-checkable hint rather than raw text.
//   2. buildSystemPrompt() / buildUserPrompt() — assemble the strings a model
//      backend will eventually receive, grounded in the resolved context.
//
// Nothing here imports an SDK or performs I/O. The four "future commands" in the
// sprint brief are first-class, covered cases:
//   • "berapa gardu di jakarta selatan"  → COUNT_GARDU  region=jakarta selatan
//   • "laporan pending minggu ini"       → LIST_REPORTS status=PENDING week
//   • "aset yang belum inspeksi"         → LIST_ASSETS  uninspected=true
//   • "berapa asset router"              → COUNT_ASSETS assetType=ROUTER
import type { AssistantContext, AssistantIntent, TimeRange } from "./types";
import { describeContext } from "./context";

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

// ── Slot vocabularies ─────────────────────────────────────────────────────────
const ASSET_TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/\brtu\b/, "RTU"],
  [/\bfdi\b/, "FDI"],
  [/rectifier|rektifier|penyearah/, "RECTIFIER"],
  [/baterai|battery|aki/, "BATTERY_BANK"],
  [/router/, "ROUTER"],
  [/modem/, "MODEM"],
  [/radio/, "RADIO"],
];

const STATUS_KEYWORDS: Array<[RegExp, string]> = [
  [/pending|menunggu|belum divalidasi|antri/, "PENDING"],
  [/approved|disetujui|selesai|diterima/, "APPROVED"],
  [/rejected|ditolak/, "REJECTED"],
  [/draft/, "DRAFT"],
  [/revis/, "REVISED"],
];

const COUNT_WORDS = /\b(berapa|jumlah|hitung|total|banyak|ada berapa)\b/;

/** Detect an explicit time window in the text. */
function detectRange(q: string): TimeRange | undefined {
  if (/hari ini|today/.test(q)) return "today";
  if (/minggu ini|pekan ini|this week|7 hari/.test(q)) return "this_week";
  if (/bulan ini|this month|30 hari/.test(q)) return "this_month";
  return undefined;
}

/** Pull a free-text region after a locative preposition ("di/wilayah/up3 …"). */
function detectRegion(raw: string): string | undefined {
  const m = raw.match(/\b(?:di|wilayah|daerah|up3|rtupp|area)\s+([a-z][a-z .'-]{2,40})/i);
  if (!m) return undefined;
  // Trim trailing intent/time words that may have been captured.
  const region = m[1]
    .replace(/\b(minggu|bulan|hari|ini|pending|yang|belum|saja)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return region.length >= 2 ? region : undefined;
}

const firstMatch = (q: string, table: Array<[RegExp, string]>): string | undefined =>
  table.find(([re]) => re.test(q))?.[1];

/**
 * Classify a natural-language message into a structured intent. Purely
 * deterministic — same input always yields the same intent — so it is fully
 * unit-testable and safe to run before any model is connected.
 */
export function classifyIntent(raw: string): AssistantIntent {
  const q = norm(raw);
  const assetType = firstMatch(q, ASSET_TYPE_KEYWORDS);
  const status = firstMatch(q, STATUS_KEYWORDS);
  const range = detectRange(q);
  const region = detectRegion(raw);
  const isCount = COUNT_WORDS.test(q);
  const mentionsReport = /laporan|report|pekerjaan/.test(q);
  const mentionsAsset = /aset|asset|perangkat/.test(q) || Boolean(assetType);
  const mentionsGardu = /gardu|lokasi|site|gi |gh /.test(q);
  const uninspected = /belum (di)?inspeksi|tanpa inspeksi|never inspected|belum diperiksa/.test(q);
  const mentionsSla = /\bsla\b|kepatuhan|compliance|tepat waktu/.test(q);

  const base = { region, status, range, assetType, uninspected, query: raw.trim() };

  // Most specific first.
  if (uninspected && mentionsAsset) {
    return { kind: "LIST_ASSETS", ...base, uninspected: true, confidence: 0.9 };
  }
  if (mentionsSla) {
    return { kind: "SLA_STATUS", ...base, confidence: 0.8 };
  }
  if (mentionsReport && (status || range)) {
    return { kind: "LIST_REPORTS", ...base, confidence: 0.85 };
  }
  if (mentionsGardu && (isCount || region)) {
    return { kind: "COUNT_GARDU", ...base, confidence: region ? 0.85 : 0.7 };
  }
  if (mentionsAsset && isCount) {
    return { kind: "COUNT_ASSETS", ...base, confidence: assetType ? 0.9 : 0.7 };
  }
  if (mentionsReport) {
    return { kind: "LIST_REPORTS", ...base, confidence: 0.6 };
  }
  if (mentionsAsset) {
    return { kind: "COUNT_ASSETS", ...base, confidence: 0.55 };
  }
  return { kind: "UNKNOWN", ...base, confidence: 0.2 };
}

// ── Prompt assembly (strings a model backend will later consume) ──────────────
const SYSTEM_BASE = `Anda adalah VoltHub AI — asisten untuk sistem manajemen aset telekomunikasi SCADA milik PT PLN (Persero).
Aturan:
- Jawab HANYA dari data yang diberikan. Jangan pernah mengarang angka, nama gardu, atau status.
- Hormati cakupan akses pengguna; jangan menyebut data di luar wilayah yang boleh dilihatnya.
- Jawab ringkas dalam Bahasa Indonesia. Jika data belum tersedia, katakan apa adanya.`;

/** Build the system prompt, grounded in the resolved session context. */
export function buildSystemPrompt(ctx: AssistantContext): string {
  return `${SYSTEM_BASE}\n\nKonteks sesi: ${describeContext(ctx)}.`;
}

/** Build the user-turn prompt, annotated with the parsed intent for grounding. */
export function buildUserPrompt(message: string, intent: AssistantIntent): string {
  const slots = [
    intent.region && `wilayah=${intent.region}`,
    intent.status && `status=${intent.status}`,
    intent.range && `rentang=${intent.range}`,
    intent.assetType && `jenisAset=${intent.assetType}`,
    intent.uninspected && `belumInspeksi=true`,
  ]
    .filter(Boolean)
    .join(", ");
  return slots
    ? `${message}\n\n[intent=${intent.kind}; ${slots}]`
    : `${message}\n\n[intent=${intent.kind}]`;
}
