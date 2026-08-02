# VoltHub AI Brain V1

A **production-grade AI foundation** — not a chatbot demo. One Brain serves the
In-App Assistant today and is built to drive **WhatsApp** and **Voice** channels
next, without touching the core. It understands the operational language used by
**PETUGAS / ADMIN / MANAGER / MASTER** (Bahasa Indonesia, English, field slang).

> Location: `BE/src/modules/ai/brain/`. The legacy `ai.agent.ts` (Claude
> tool-use) and `ai.service.ts` (asset search) are **kept untouched**; the Brain
> is additive and mounted alongside them under `/api/v1/ai/brain/*`.

---

## 1. Files changed

### New — `BE/src/modules/ai/brain/`
| File | Phase | Responsibility |
|---|---|---|
| `brain.types.ts` | — | Transport/vendor-agnostic contracts (AiContext, IntentResult, BrainReply). |
| `dictionary/domain-dictionary.ts` | 1 | Expandable concept dictionary + whole-word matcher. |
| `intent/intent-catalog.ts` | 2 | Declarative intent definitions + slot builders. |
| `intent/intent-engine.ts` | 2 | Deterministic concepts → ranked intents. |
| `intent/confidence.ts` | 3 | Scoring + EXECUTE / CLARIFY / SUGGEST bands. |
| `clarification.ts` | 4 | Reusable clarification menu builder (incl. ambiguous "merah"). |
| `suggestions.ts` | 5 | Role-aware suggested questions + guided-suggestion reply. |
| `memory/conversation-memory.ts` | 6 | Session-scoped follow-up inheritance (TTL store). |
| `learning/learning.repository.ts` | 7 | Fail-soft collection into the learning corpus. |
| `security/prompt-guard.ts` | 8 | Prompt-injection screen (fail-closed). |
| `security/query-registry.ts` | 8/9 | Allowed Query Registry + AI RBAC filter. |
| `security/ai-audit.ts` | 8 | AI audit + learning persistence per turn. |
| `query/query-services.ts` | 9 | The ONLY data door — scoped reads via service-layer helpers. |
| `providers/provider.types.ts` | 10 | LLM provider interface. |
| `providers/index.ts` | 10 | Local provider (impl) + Claude/OpenAI/Gemini skeletons + selector. |
| `format/answer-renderer.ts` | — | Deterministic NL rendering (no LLM needed). |
| `context-resolver.ts` | — | Builds AiContext (role + tenant scope) **server-side only**. |
| `brain.ts` | — | Orchestrator wiring every phase together. |
| `brain.controller.ts` / `brain.validation.ts` | — | HTTP transport. |
| `brain.test.ts` | — | 29 unit tests for the deterministic core. |

### Changed
- `BE/src/modules/ai/ai.routes.ts` — mounts `/brain`, `/brain/clarify`, `/brain/suggestions`, `/brain/feedback`.
- `BE/prisma/schema.prisma` — 5 additive learning models.
- `BE/prisma/migrations/20260618000000_ai_brain_learning_additive/migration.sql` — additive DDL.

**Quality gate:** `tsc` build ✅ · ESLint ✅ (0 errors) · Vitest **178/178** ✅ (149 prior + 29 new) · no regressions.

---

## 2. AI architecture diagram

```
                         ┌──────────────────────────────────────────┐
  User (any channel)     │  in_app  │  whatsapp (future) │ voice (future)
        │                └──────────────────────────────────────────┘
        ▼
  POST /api/v1/ai/brain  ──►  authenticate (JWT)            [existing middleware]
        │
        ▼
  Context Resolver  ── role (normalizeRole) + TenantScope (resolveRequestScope)
        │             built SERVER-SIDE from the principal, never from input
        ▼
  ┌─────────────────────────  BRAIN ORCHESTRATOR (brain.ts)  ─────────────────────┐
  │                                                                                │
  │  (8) Prompt Guard ──blocked──► denied reply + audit(blocked=true)              │
  │        │ ok                                                                     │
  │  (2) Intent Detection  ◄── (1) Domain Dictionary  ◄── (7) learned aliases      │
  │        │                                                                        │
  │  (6) Conversation Memory (follow-up inheritance)                                │
  │        │                                                                        │
  │  (3) Confidence Band ──► EXECUTE / CLARIFY / SUGGEST                            │
  │        ├── SUGGEST ─► (5) Guided Suggestions  (never "tidak mengerti")          │
  │        ├── CLARIFY ─► (4) Clarification menu  ─► /brain/clarify (zero-NLU pick) │
  │        └── EXECUTE                                                              │
  │              │                                                                  │
  │  (8) AI RBAC Filter + Allowed Query Registry ──denied──► denied reply          │
  │              │ authorized (queryId ∈ registry & role allowed)                   │
  │  (9) VoltHub Query Services  ── carry TenantScope ──►  existing service layer   │
  │              │                                                                  │
  │  (10) Provider.composeAnswer  (Local renderer | Claude/OpenAI/Gemini)          │
  │              │                                                                  │
  │  (7/8) Audit + Learning corpus (ai_conversations)                              │
  └──────────────────────────────────────────────────────────────────────────────┘
        │
        ▼
     Database  ◄── reached ONLY through (9), always scoped. AI never sees SQL.
```

**Rule #1 (enforced structurally):** the AI never generates SQL and never
touches the DB. The only path to data is Intent → Registry → Query Service, and
the registry is a fixed allow-list. Unknown `queryId` ⇒ denied.

**Rule #2 (enforced structurally):** role + tenant scope are resolved
server-side in the Context Resolver and passed *down* into the same
`tenantScope` helpers the rest of the app uses. The LLM can neither inflate its
role nor cross an RTUPP boundary because it never supplies those values.

---

## 3. Intent catalog

| Intent | Roles | queryId | Examples |
|---|---|---|---|
| `ASSET_SEARCH` | all | `assets.search` | "router rusak", "asset offline", "aset belum inspeksi" |
| `REPORT_SEARCH` | all | `reports.search` | "laporan pending", "laporan minggu ini", "laporan ditolak" |
| `KPI_COUNT` | all | `kpi.count` | "berapa gardu", "berapa asset", "total user", "jumlah tiket" |
| `GIS_SEARCH` | all | `gis.search` | "gardu jakarta selatan", "asset di depok" |
| `OPERATIONAL_INSIGHT` | MASTER/MANAGER/ADMIN | `insight.top` | "wilayah paling banyak gangguan", "laporan paling banyak pending" |
| `SMALLTALK` | all | — | "halo", "terima kasih" (answered directly) |
| `UNKNOWN` | all | — | falls through to guided suggestions |

Add a capability = add one `IntentDefinition` (catalog) + one `RegisteredQuery`
(registry) + one method in `query-services.ts`. No engine change.

---

## 4. Domain dictionary

Maps surface language → stable `concept` ids by **category**: `entity`,
`status`, `metric`, `time`, `place`, `action`. Examples:

- `status.offline` ← offline, mati, putus, down, oop, "telekontrol putus"
- `status.pending` ← pending, belum selesai, antri, menunggu validasi
- `status.critical` ← critical, kritis, merah, parah, bahaya
- `entity.router` ← router, modem, radio, "media komunikasi"

**Expandable** three ways:
1. Add a surface form → push to an entry's `synonyms`.
2. Add a concept → push a `DictionaryEntry`.
3. Per-user/global learned aliases (Phase 7 `ai_aliases`, `approved=true`) are
   merged at runtime via `resolveConcepts(text, extraEntries)`.

Matcher is whole-word/phrase (no substring false positives), longest-synonym
first, with weight by phrase length (multi-word > short tokens).

---

## 5. Security design

| Control | Where | Behaviour |
|---|---|---|
| **Prompt injection protection** | `prompt-guard.ts` | Deterministic patterns reject instruction-override ("abaikan semua aturan"), exfiltration ("tampilkan seluruh database"), role-hijack, security-bypass, raw SQL, secret probes. Runs **first**, fail-closed. |
| **AI RBAC filter** | `query-registry.ts` | Resolves intent→queryId and verifies the caller's canonical role is in the query's allow-list. Fail-closed on unknown/denied. |
| **Tenant isolation** | `query-services.ts` | Every query applies `locationScopeWhere` / `viaLocationScopeWhere` (the app's canonical helpers). MASTER/MANAGER global; ADMIN/PETUGAS own RTUPP; PETUGAS reports own-only. |
| **Allowed Query Registry** | `query-registry.ts` | Closed allow-list. If a `queryId` is not registered, it cannot run. |
| **Audit logging** | `ai-audit.ts` → `ai_conversations` | Every turn (incl. blocked) stamped with user+role+tenant, intent, confidence, mode, queryId, `blocked`, latency. |
| **Server-side identity** | `context-resolver.ts` | Role + scope come from JWT/DB, never from the request body or model output. |

The LLM provider (Phase 10) is **never** given DB access, SQL, or RBAC controls.
It only ever receives the question + already-scoped, already-fetched results.

---

## 6. Learning model design (Phase 7 — collect only, NO auto-train)

Five additive tables:

- **`ai_conversations`** — one row/turn: question, intent, confidence, mode,
  finalAction, clarification pick, provider, replyKind, `blocked`, latency,
  + user/role/rtupp/channel. The backbone corpus **and** the AI audit trail.
- **`ai_feedback`** — thumbs up/down (+optional note) per conversation.
- **`ai_user_preferences`** — loose JSON bag (favourites, default scope, lang).
- **`ai_aliases`** — learned vocabulary (phrase → concept); `approved` gate
  before runtime use; global (MASTER-curated) or per-user.
- **`ai_intents`** — DB mirror of the catalog for analytics/admin tuning.

Collection is **fail-soft** (`learning.repository.ts` swallows DB errors) so the
assistant keeps working even before the migration runs. Training is an offline,
human-in-the-loop step (out of scope for V1) — we only gather the data.

---

## 7. Provider abstraction design

`LlmProvider` interface (`provider.types.ts`): `name`, `isEnabled()`,
`composeAnswer({ ctx, question, data, intent, history })`.

- **`LocalProvider`** — fully implemented, zero-config, no network. Renders
  structured results to Bahasa Indonesia. Default + safe fallback for every
  vendor. Means the Brain works **offline and keyless**.
- **`ClaudeProvider`** — skeleton; enabled when `ANTHROPIC_API_KEY` set. Will
  call Claude with a strict "answer only from the provided JSON" system prompt.
- **`OpenAIProvider` / `GeminiProvider`** — declared skeletons, disabled.

`selectProvider()` resolves: `AI_PROVIDER` env override (if enabled) → first
enabled vendor → Local. Always returns a provider; never vendor-locked.

---

## 8. Future OpenAI integration path

1. `npm i openai`; add `OPENAI_API_KEY` (+ optional `OPENAI_MODEL`) to `env.ts`.
2. Implement `OpenAIProvider.composeAnswer`: call `chat.completions` with a
   system prompt that **forbids inventing data** — the model receives only
   `input.data` (already scoped) + the question, and must answer from it.
3. (Optional) Add an NLU-fallback hook in the orchestrator's SUGGEST branch:
   when confidence < 0.6, ask the provider to map the raw text to `{intent,
   slots}` constrained to the catalog — then re-enter the registry path. The LLM
   proposes intent/slots; it still **cannot** bypass the registry or scope.
4. Set `AI_PROVIDER=openai` (or rely on auto-select). No other code changes —
   the registry, scoping and audit are provider-independent.

---

## 9. Future WhatsApp integration path

The Brain is already channel-aware (`AiContext.channel`, `channel` enum
`in_app|whatsapp|voice`). To add WhatsApp:

1. **Webhook**: new route (e.g. `/api/v1/ai/whatsapp/webhook`) for the WhatsApp
   Business / provider (Twilio/Meta) callback. Verify signature.
2. **Identity binding**: map WhatsApp phone → VoltHub user (reuse `users.phone`).
   Resolve `AiContext` via the same `context-resolver` once the user is known;
   unbound numbers get a registration prompt (never data).
3. **Session**: use the WhatsApp thread id as `sessionId` → conversation memory
   (Phase 6) works unchanged.
4. **Call** `handleTurn(ctx, message)` — identical Brain, identical RBAC/scope.
5. **Render**: `BrainReply.text` is already WhatsApp-friendly; map
   `kind:'clarify'` options to a numbered list / interactive buttons; a reply of
   "1" maps back to the option → `/brain/clarify` semantics.

Voice follows the same shape: STT → `handleTurn` → TTS over `reply.text`.

---

## 10. Remaining blockers

| # | Item | Impact | Note |
|---|---|---|---|
| 1 | **Run the migration** `20260618000000_ai_brain_learning_additive` on each env | Learning/audit rows are dropped (fail-soft) until applied | `prisma migrate deploy`. Assistant answers regardless. |
| 2 | Vendor provider bodies are skeletons | NL answers use the deterministic renderer | By design for V1 ("build architecture only"); wire per §8 when desired. |
| 3 | Conversation memory is in-process | Multi-node deploys won't share session memory | Swap `InMemoryConversationStore` for a Redis impl (interface ready). |
| 4 | LLM NLU-fallback not enabled | Very novel phrasings land in SUGGEST | Optional enhancement (§8 step 3); deterministic core covers the catalog. |
| 5 | `place` resolution is text `contains` | "jakarta selatan" matches name/address/up3 substrings | Good enough for V1; a geo gazetteer can sharpen later. |
| 6 | Learning is collect-only | No automatic accuracy improvement yet | Intentional (Rule: "DO NOT auto-train"). Offline tuning is a future sprint. |

---

### Endpoints (all under `/api/v1/ai`, authenticated)
- `POST /brain` — `{ message, sessionId?, channel?, locale? }` → `BrainReply`.
- `POST /brain/clarify` — `{ intent, slots, sessionId? }` → executes a pick.
- `GET  /brain/suggestions` — role-aware starting questions.
- `POST /brain/feedback` — `{ conversationId, rating, note? }` (Phase 7).