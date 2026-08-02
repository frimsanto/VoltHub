/**
 * PHASE 10 — Provider registry + concrete provider skeletons.
 *
 * `LocalProvider` is fully implemented: it deterministically renders structured
 * data into Bahasa Indonesia with NO external call — the default, zero-config,
 * privacy-preserving answer path. The vendor providers are SKELETONS by design
 * (architecture only): they declare the seam and stay disabled until wired.
 *
 * `selectProvider()` resolves the active provider with graceful degradation:
 * a configured vendor when available, otherwise the LocalProvider — so the
 * assistant always answers, online or offline, keyed or keyless.
 */

import { env } from '../../../../config/env';
import type { LlmProvider, ProviderName, ComposeAnswerInput } from './provider.types';
import { renderAnswer } from '../format/answer-renderer';

// ── Local (deterministic, always available) ─────────────────────────────────
class LocalProvider implements LlmProvider {
  readonly name: ProviderName = 'local';
  isEnabled(): boolean {
    return true;
  }
  async composeAnswer(input: ComposeAnswerInput): Promise<string> {
    return renderAnswer(input.intent, input.data, input.ctx.locale);
  }
}

// ── Claude (skeleton — the only vendor with an SDK already in the repo) ──────
class ClaudeProvider implements LlmProvider {
  readonly name: ProviderName = 'claude';
  isEnabled(): boolean {
    return Boolean(env.ANTHROPIC_API_KEY);
  }
  async composeAnswer(input: ComposeAnswerInput): Promise<string> {
    // ARCHITECTURE ONLY. When wired, this calls Claude with a STRICT system
    // prompt: "answer only from the provided JSON; never invent numbers". The
    // model receives `input.data` (already scoped) — never DB/SQL access.
    // Until then we fall back to deterministic rendering so behaviour is safe.
    return renderAnswer(input.intent, input.data, input.ctx.locale);
  }
}

// ── OpenAI / Gemini (skeletons — declared, disabled) ────────────────────────
class OpenAIProvider implements LlmProvider {
  readonly name: ProviderName = 'openai';
  isEnabled(): boolean {
    return Boolean(process.env.OPENAI_API_KEY);
  }
  async composeAnswer(input: ComposeAnswerInput): Promise<string> {
    return renderAnswer(input.intent, input.data, input.ctx.locale);
  }
}

class GeminiProvider implements LlmProvider {
  readonly name: ProviderName = 'gemini';
  isEnabled(): boolean {
    return Boolean(process.env.GEMINI_API_KEY);
  }
  async composeAnswer(input: ComposeAnswerInput): Promise<string> {
    return renderAnswer(input.intent, input.data, input.ctx.locale);
  }
}

export const PROVIDERS: Record<ProviderName, LlmProvider> = {
  local: new LocalProvider(),
  claude: new ClaudeProvider(),
  openai: new OpenAIProvider(),
  gemini: new GeminiProvider(),
};

/**
 * Resolve the active answer provider. Order: explicit AI_PROVIDER env override
 * (if enabled) → first enabled vendor → LocalProvider. Never returns null.
 */
export function selectProvider(): LlmProvider {
  const preferred = (process.env.AI_PROVIDER as ProviderName | undefined) ?? undefined;
  if (preferred && PROVIDERS[preferred]?.isEnabled()) return PROVIDERS[preferred];

  for (const name of ['claude', 'openai', 'gemini'] as ProviderName[]) {
    if (PROVIDERS[name].isEnabled()) return PROVIDERS[name];
  }
  return PROVIDERS.local;
}