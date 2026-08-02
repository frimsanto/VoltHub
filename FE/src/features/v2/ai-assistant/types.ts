// VoltHub — AI Assistant: domain model (architecture only).
//
// This is the type contract for the in-app assistant. It is intentionally
// provider-agnostic: nothing here imports an SDK or hits a network. The service
// layer (service.ts) is the single seam where a model backend (the existing
// VoltHub Claude tool-use endpoint `POST /api/v1/ai/chat`, see features/v2/ai)
// will later be wired in. Until then everything runs locally.

/** Who authored a chat message. `system` is never displayed; it carries context. */
export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string; // ISO
  /** Tools/data sources the assistant used to answer (for transparency UI). */
  sources?: string[];
  /** Set while an assistant message is being produced (optimistic UI). */
  pending?: boolean;
  /** Set when generation failed, so the UI can offer a retry. */
  error?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  messages: ChatMessage[];
}

// ── Intent model (prompt builder output) ──────────────────────────────────────
// A lightweight, deterministic classification of the user's natural-language
// request. It lets the assistant route to the right data source BEFORE any model
// is connected, and gives the future LLM a structured hint to ground its tools.
export type AssistantIntentKind =
  | "COUNT_GARDU" // "berapa gardu di jakarta selatan"
  | "LIST_REPORTS" // "laporan pending minggu ini"
  | "LIST_ASSETS" // "aset yang belum inspeksi"
  | "COUNT_ASSETS"
  | "SLA_STATUS"
  | "UNKNOWN";

export type TimeRange = "today" | "this_week" | "this_month" | "all";

export interface AssistantIntent {
  kind: AssistantIntentKind;
  /** Free-text region/UP3/RTUPP slot, e.g. "jakarta selatan". */
  region?: string;
  /** Normalised report/asset status slot, e.g. "PENDING". */
  status?: string;
  /** Time window slot. */
  range?: TimeRange;
  /** Domain flag, e.g. assets that have never been inspected. */
  uninspected?: boolean;
  /** Asset-type slot for COUNT_ASSETS/LIST_ASSETS, e.g. "ROUTER". */
  assetType?: string;
  /** The raw user text the intent was parsed from (for the prompt/transparency). */
  query?: string;
  /** 0–1 heuristic confidence in the classification. */
  confidence: number;
}

// ── Runtime context handed to the prompt builder ──────────────────────────────
// Real, already-loaded app context (no fetching here) so the system prompt can
// ground answers in who is asking and what scope they can see.
export interface AssistantContext {
  userName?: string;
  role?: string;
  rtuppName?: string | null;
  /** App locale for the model to answer in (defaults to Indonesian). */
  locale?: "id" | "en";
}

// ── Service contract ──────────────────────────────────────────────────────────
export type AssistantReplyMode = "llm" | "local" | "stub";

export interface AssistantReply {
  mode: AssistantReplyMode;
  content: string;
  sources?: string[];
  intent?: AssistantIntent;
  /** FE route to redirect to (AI Brain NAVIGATE intent) — the drawer intercepts this. */
  navigateTo?: string;
}
