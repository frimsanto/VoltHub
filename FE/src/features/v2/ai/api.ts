// VoltHub — AI Search (read-only AI-ready asset summary by location).
// Backend (BE/src/modules/ai): GET /ai/assets/search?q= → location + assets +
// communicationMedia + lastInspection + lastHar + documentCount.
import { useQuery } from "@tanstack/react-query";
import { v2Get, v2Post } from "@/lib/api/v2";

export interface AiAsset {
  id: string;
  assetCode: string;
  assetName: string;
  assetType: string;
  status?: string;
  brand?: string | null;
  model?: string | null;
  feeder?: { id: string; feederCode?: string | null; feederName?: string | null } | null;
  simCards?: {
    id: string;
    simSlot: number;
    provider?: string | null;
    phoneNumber?: string | null;
  }[];
}

export interface AiCommMedia {
  id: string;
  mediaType?: string | null;
  provider?: string | null;
  status?: boolean;
}

export interface AiFindingRef {
  id: string;
  status: string;
  finding?: string | null;
  asset?: { assetCode?: string | null; assetName?: string | null };
}

export interface AiLastInspection {
  id: string;
  inspectionDate: string;
  inspector?: { id: string; name?: string | null } | null;
  findings?: AiFindingRef[];
}

export interface AiHarDetailRef {
  id: string;
  status: string;
  analysis?: string | null;
  asset?: { assetCode?: string | null; assetName?: string | null };
}

export interface AiLastHar {
  id: string;
  reportDate: string;
  details?: AiHarDetailRef[];
}

export interface AiSearchResult {
  location: {
    id: string;
    code: string;
    name: string;
    locationType?: string | null;
    up3?: string | null;
  };
  assetCount: number;
  assets: AiAsset[];
  communicationMedia: AiCommMedia[];
  lastInspection: AiLastInspection | null;
  lastHar: AiLastHar | null;
  documentCount: number;
}

// ── Conversational assistant (natural language) ──────────────────────────────
// POST /ai/chat → Claude tool-use over the whole DB. When the backend has no
// API key it replies { mode: "fallback" }, signalling the caller to use the
// local deterministic engine instead.
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}
export type ChatResponse =
  | { mode: "llm"; text: string; toolsUsed?: string[] }
  | { mode: "fallback" };

export function chatAssistant(message: string, history: ChatTurn[]): Promise<ChatResponse> {
  return v2Post<ChatResponse>("/ai/chat", { message, history });
}

/** Search is enabled only when a non-empty query is provided. */
export function useAiSearch(q: string, enabled: boolean) {
  return useQuery({
    queryKey: ["v2-ai-search", q],
    queryFn: () => v2Get<AiSearchResult>("/ai/assets/search", { params: { q } }),
    enabled: enabled && q.trim().length > 0,
    retry: false,
  });
}
