# VoltHub AI — Assistant Foundation (Phase 3)

Status: **architecture only — no external calls, no fabricated answers.**

This phase prepares the seams for VoltHub AI without connecting any model
provider. OpenAI is intentionally **not** wired. The existing Claude tool-use
endpoint (`POST /api/v1/ai/chat`, `BE/src/modules/ai`) and the local
deterministic engine (`FE/src/features/v2/ai/engine.tsx`) remain the live path;
this foundation is the clean contract a future provider plugs into.

## Layers

| Layer | File | Responsibility |
|-------|------|----------------|
| Domain model | `FE/src/features/v2/ai-assistant/types.ts` | Messages, conversations, intent model, context, reply contract |
| Context Resolver | `context.ts` | Session → grounded `AssistantContext` (user, role, RTUPP scope). Reads auth store only — no I/O |
| Prompt Builder | `intent.ts` | `classifyIntent()` (NL → structured slots) + `buildSystemPrompt()` / `buildUserPrompt()` |
| Service Layer | `service.ts` | Single seam to a model backend. Provider registry, `reply()`. Returns honest `stub` when no provider is enabled |
| Conversation Store | `storage.ts` | Versioned, swappable persistence (localStorage today, backend later) |
| Chat Drawer | `ChatDrawer.tsx` | Drawer UI bound to store + service; suggestion chips for the prepared commands |

```
user text ──▶ classifyIntent ──▶ AssistantIntent ──┐
                                                    ├─▶ buildSystem/UserPrompt ──▶ provider?.reply()
session  ──▶ resolveContext  ──▶ AssistantContext ──┘                               │  (none yet)
                                                                                    ▼
                                                                         stub reply (no invented data)
```

## Prepared commands

`classifyIntent()` deterministically routes the four target commands:

| Utterance | Intent | Slots |
|-----------|--------|-------|
| "berapa gardu di jakarta selatan" | `COUNT_GARDU` | `region=jakarta selatan` |
| "laporan pending minggu ini" | `LIST_REPORTS` | `status=PENDING, range=this_week` |
| "aset yang belum inspeksi" | `LIST_ASSETS` | `uninspected=true` |
| "berapa asset router" | `COUNT_ASSETS` | `assetType=ROUTER` |

## How to connect a provider later

1. Implement `AssistantProvider` (`name`, `isEnabled()`, `reply()`).
2. `registerProvider(myProvider)` at app bootstrap.
3. Each provider receives `{ system, user, intent, context }` — already grounded
   and least-privilege. Return `null` to defer to the next provider.

Intended first providers:
- **Claude tool-use** wrapping `POST /api/v1/ai/chat` (enabled when the backend
  reports `ANTHROPIC_API_KEY` is set).
- **Local engine** (`features/v2/ai/engine`) as the no-API-key fallback — already
  answers from real aggregate endpoints.

## Guarantees

- No network calls and no SDK imports in the foundation layer.
- The service never invents numbers; with no provider it states the request was
  understood and is ready to answer once the backend is enabled.
- Authorization is honoured by deferring to backend-enforced scope (Context
  Resolver derives, never widens, what the session may see).