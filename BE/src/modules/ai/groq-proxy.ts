// VoltHub — FAB assistant model proxy (server-side key custody).
//
// Historically this endpoint forwarded the browser's OpenAI-compatible
// chat-completions body VERBATIM to Groq (llama-3.3-70b). The model backend is
// now Anthropic Claude (claude-haiku-4-5), whose Messages API speaks a
// different dialect — so the proxy now TRANSLATES instead of passing through:
// OpenAI request shape → Anthropic /v1/messages (via the official
// @anthropic-ai/sdk client), and the Anthropic response → an OpenAI
// chat-completions shape. The FE's existing tool-use loop (`choices[]` /
// `tool_calls` / `finish_reason`) keeps working unchanged; only the model
// behind the endpoint differs. The endpoint path stays /ai/groq-proxy so no FE
// change is needed.

import Anthropic, { APIError } from '@anthropic-ai/sdk';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import type { AuthRequest } from '../../middlewares/auth';
import { errorResponse } from '../../utils/response';

// The FE still sends its historical llama model id in `model` — ignored; the
// model is a server-side decision now.
const ANTHROPIC_MODEL = 'claude-haiku-4-5';

// OpenAI chat bodies carry richly-shaped entries (assistant messages with
// `tool_calls`, `tool` role with `tool_call_id`, content that may be null). We
// validate the ENVELOPE and cap sizes to bound abuse; the entries themselves
// are interpreted by the translation layer below.
export const groqProxySchema = z.object({
  messages: z.array(z.record(z.unknown())).min(1).max(40),
  tools: z.array(z.record(z.unknown())).max(20).optional(),
  tool_choice: z.union([z.string(), z.record(z.unknown())]).optional(),
  model: z.string().max(100).optional(),
  max_tokens: z.number().int().min(1).max(4096).optional(),
  temperature: z.number().min(0).max(2).optional(),
});

/**
 * Per-user budget: 10 requests / minute, keyed on the authenticated userId (the
 * route runs behind `authenticate`, so req.user is always set). A single chat
 * turn can fan out up to 3 model rounds, so 10/min ≈ 3 turns/min — enough for a
 * human, tight enough to blunt a scripted key-abuse loop. Disabled under test.
 */
export const groqProxyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => (req as AuthRequest).user?.userId ?? 'anonymous',
  skip: () => env.NODE_ENV === 'test',
  message: {
    success: false,
    message: 'Terlalu banyak permintaan AI. Coba lagi sebentar lagi.',
  },
});

// ── OpenAI-compatible wire shapes the FE speaks ──────────────────────────────

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OpenAiMessage {
  role?: unknown;
  content?: unknown;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: unknown;
}

interface OpenAiTool {
  type?: unknown;
  function?: { name?: unknown; description?: unknown; parameters?: unknown };
}

type AnthropicContentBlock =
  | Anthropic.TextBlockParam
  | Anthropic.ToolUseBlockParam
  | Anthropic.ToolResultBlockParam;

const asText = (content: unknown): string =>
  typeof content === 'string' ? content : content == null ? '' : JSON.stringify(content);

// The FAB drawer renders replies as plain text (whitespace-pre-wrap, no
// Markdown renderer). Claude answers in Markdown by default — llama didn't —
// so without this the user sees literal **, ## and --- in the chat bubble.
// Appended server-side so the FE prompt stays untouched.
const PLAIN_TEXT_STYLE =
  'Format output: TEKS POLOS untuk UI chat sederhana yang TIDAK me-render Markdown. ' +
  'Jangan gunakan simbol Markdown apa pun: tanpa **bold**, tanpa heading #/##, tanpa ' +
  'garis ---, tanpa `code`, tanpa tabel. Daftar cukup "1." atau "-" di awal baris; ' +
  'penekanan lewat pilihan kata dan HURUF KAPITAL seperlunya, bukan simbol.';

/** OpenAI chat-completions request body → Anthropic Messages API request params. */
const toAnthropicRequest = (
  body: z.infer<typeof groqProxySchema>
): Anthropic.MessageCreateParamsNonStreaming => {
  const systemParts: string[] = [];
  const messages: Anthropic.MessageParam[] = [];

  for (const entry of body.messages as OpenAiMessage[]) {
    switch (entry.role) {
      case 'system': {
        // Anthropic takes the system prompt as a top-level field, not a message.
        const text = asText(entry.content);
        if (text) systemParts.push(text);
        break;
      }
      case 'tool': {
        // Tool results are tool_result blocks in a USER turn. Consecutive
        // `tool` entries merge into one turn so every result of a parallel
        // tool_use round arrives in the same message, as the API requires.
        const block: AnthropicContentBlock = {
          type: 'tool_result',
          tool_use_id: String(entry.tool_call_id ?? ''),
          content: asText(entry.content),
        };
        const last = messages[messages.length - 1];
        if (
          last?.role === 'user' &&
          Array.isArray(last.content) &&
          last.content[0]?.type === 'tool_result'
        ) {
          last.content.push(block);
        } else {
          messages.push({ role: 'user', content: [block] });
        }
        break;
      }
      case 'assistant': {
        const blocks: AnthropicContentBlock[] = [];
        const text = asText(entry.content);
        if (text.trim()) blocks.push({ type: 'text', text });
        for (const tc of entry.tool_calls ?? []) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>;
          } catch {
            // Malformed arguments (e.g. a recovered call) — send an empty input.
          }
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input });
        }
        if (blocks.length) messages.push({ role: 'assistant', content: blocks });
        break;
      }
      default:
        messages.push({ role: 'user', content: asText(entry.content) });
    }
  }

  // OpenAI {type:"function", function:{...}} → Anthropic {name, description, input_schema}.
  const tools: Anthropic.Tool[] | undefined = (body.tools as OpenAiTool[] | undefined)
    ?.filter((t): t is OpenAiTool & { function: { name: string } } =>
      typeof t.function?.name === 'string'
    )
    .map((t) => ({
      name: t.function.name,
      ...(typeof t.function.description === 'string'
        ? { description: t.function.description }
        : {}),
      input_schema: ((t.function.parameters as Record<string, unknown> | undefined) ?? {
        type: 'object',
      }) as Anthropic.Tool.InputSchema,
    }));

  // "required" is OpenAI's name for Anthropic's {type:"any"}; the object form
  // ({type:"function", function:{name}}) forces one specific tool.
  let toolChoice: Anthropic.ToolChoice | undefined;
  if (typeof body.tool_choice === 'string') {
    toolChoice =
      body.tool_choice === 'required'
        ? { type: 'any' }
        : body.tool_choice === 'none'
          ? { type: 'none' }
          : { type: 'auto' };
  } else if (body.tool_choice) {
    const forced = (body.tool_choice as { function?: { name?: unknown } }).function?.name;
    if (typeof forced === 'string') toolChoice = { type: 'tool', name: forced };
  }

  systemParts.push(PLAIN_TEXT_STYLE);

  return {
    model: ANTHROPIC_MODEL,
    max_tokens: body.max_tokens ?? 1024,
    // OpenAI temperature spans 0–2, Anthropic 0–1 — clamp (the FE sends 0.2).
    ...(body.temperature !== undefined ? { temperature: Math.min(body.temperature, 1) } : {}),
    system: systemParts.join('\n\n'),
    messages,
    ...(tools?.length ? { tools } : {}),
    ...(toolChoice ? { tool_choice: toolChoice } : {}),
  };
};

/** Anthropic Messages API response → OpenAI chat-completions response body. */
const toOpenAiResponse = (r: Anthropic.Message) => {
  const textParts: string[] = [];
  const toolCalls: OpenAiToolCall[] = [];
  for (const block of r.content) {
    if (block.type === 'text' && block.text) textParts.push(block.text);
    if (block.type === 'tool_use' && block.id && block.name) {
      toolCalls.push({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) },
      });
    }
  }
  const inputTokens = r.usage?.input_tokens ?? 0;
  const outputTokens = r.usage?.output_tokens ?? 0;
  return {
    id: r.id,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: r.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: textParts.length ? textParts.join('') : null,
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason:
          r.stop_reason === 'tool_use'
            ? 'tool_calls'
            : r.stop_reason === 'max_tokens'
              ? 'length'
              : 'stop',
      },
    ],
    usage: {
      prompt_tokens: inputTokens,
      completion_tokens: outputTokens,
      total_tokens: inputTokens + outputTokens,
    },
  };
};

/** The parsed-body shape Anthropic's error envelope carries: {type:"error", error:{type,message}}. */
const anthropicErrorMessage = (err: APIError): string => {
  const body = err.error as { error?: { message?: string } } | undefined;
  return body?.error?.message ?? err.message;
};

/**
 * Accept an OpenAI-compatible chat-completions request from the FE, forward it
 * to the Anthropic Messages API (claude-haiku-4-5) via the official SDK using
 * the server-held key, and relay the answer back in the OpenAI shape the FE
 * already parses.
 */
export const groqProxy = async (req: Request, res: Response): Promise<void> => {
  if (!env.ANTHROPIC_API_KEY) {
    // Honest "not configured" — mirrors the FAB's preview mode. 503 so the FE can
    // distinguish "server has no key" from a transient Anthropic/network failure.
    errorResponse(res, 'AI belum dikonfigurasi di server (ANTHROPIC_API_KEY kosong).', 503);
    return;
  }

  const body = req.body as z.infer<typeof groqProxySchema>;
  const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  let message: Anthropic.Message;
  try {
    message = await anthropic.messages.create(toAnthropicRequest(body));
  } catch (err) {
    if (err instanceof APIError) {
      if (!err.status) {
        // No HTTP response reached us at all (network failure, DNS, timeout).
        console.error('[groq-proxy] upstream request failed:', err);
        errorResponse(res, 'Gagal menghubungi layanan AI (Anthropic).', 502);
        return;
      }
      // Preserve upstream backoff hints so the FE can honour rate limits.
      const retryAfter = err.headers?.get('retry-after');
      if (retryAfter) res.setHeader('Retry-After', retryAfter);

      // Map Anthropic's {type:"error", error:{type,message}} envelope onto the
      // OpenAI-ish {error:{message,code}} shape the FE's error path reads. (The
      // FE's Groq-specific `tool_use_failed` recovery simply never triggers.)
      const errMessage = anthropicErrorMessage(err);
      console.error('[groq-proxy] Anthropic error:', err.status, errMessage);
      res
        .status(err.status)
        .json({ error: { message: errMessage, ...(err.type ? { code: err.type } : {}) } });
      return;
    }
    console.error('[groq-proxy] upstream request failed:', err);
    errorResponse(res, 'Gagal menghubungi layanan AI (Anthropic).', 502);
    return;
  }

  res.json(toOpenAiResponse(message));
};
