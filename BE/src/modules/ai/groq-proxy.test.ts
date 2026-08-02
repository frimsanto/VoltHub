import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';

vi.mock('../../config/env', () => ({
  env: { NODE_ENV: 'test', ANTHROPIC_API_KEY: 'sk-ant-test-key' },
}));

const { mockCreate, MockAPIError } = vi.hoisted(() => {
  class MockAPIError extends Error {
    status: number | undefined;
    headers: Headers | undefined;
    error: unknown;
    type: string | null;
    constructor(
      status: number | undefined,
      error: unknown,
      message: string | undefined,
      headers: Headers | undefined,
      type: string | null = null
    ) {
      super(message ?? `${status ?? 'unknown'}`);
      this.status = status;
      this.headers = headers;
      this.error = error;
      this.type = type;
    }
  }
  return { mockCreate: vi.fn(), MockAPIError };
});

// The proxy now calls the official @anthropic-ai/sdk client instead of raw
// fetch — mock the client so these tests pin the OpenAI ⇄ Anthropic
// translation contract without hitting the network.
vi.mock('@anthropic-ai/sdk', () => {
  class AnthropicMock {
    messages = { create: mockCreate };
    constructor(_opts: { apiKey: string }) {}
    static APIError = MockAPIError;
  }
  return { default: AnthropicMock, APIError: MockAPIError };
});

import { env } from '../../config/env';
import { groqProxy } from './groq-proxy';

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    type: vi.fn().mockReturnThis(),
    send: vi.fn(),
  };
  return res as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
    setHeader: ReturnType<typeof vi.fn>;
  };
}

// The FE speaks OpenAI chat-completions; the backend is now the Anthropic
// Messages API (via the official SDK). These tests pin the translation
// contract in both directions so the FE's tool-use loop keeps working against
// Claude without any FE change.
describe('groqProxy — OpenAI ⇄ Anthropic translation', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    (env as { ANTHROPIC_API_KEY: string }).ANTHROPIC_API_KEY = 'sk-ant-test-key';
  });

  it('translates the FE request (system, tool history, tools, tool_choice) to the Anthropic client', async () => {
    mockCreate.mockResolvedValue({
      id: 'msg_1',
      model: 'claude-haiku-4-5',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'OOP hari ini: 1.179 gardu.' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    });
    const req = {
      body: {
        model: 'llama-3.3-70b-versatile', // legacy FE id — must be ignored
        max_tokens: 1024,
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Kamu adalah VoltHub AI.' },
          { role: 'user', content: 'berapa gardu OOP hari ini' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'query_volthub_data', arguments: '{"question":"gardu OOP"}' },
              },
            ],
          },
          { role: 'tool', tool_call_id: 'call_1', content: 'OOP: 1.179' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'query_volthub_data',
              description: 'Query data VoltHub',
              parameters: { type: 'object', properties: { question: { type: 'string' } } },
            },
          },
        ],
        tool_choice: 'required',
      },
    } as unknown as Request;
    const res = makeRes();

    await groqProxy(req, res);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const sent = mockCreate.mock.calls[0][0];
    expect(sent.model).toBe('claude-haiku-4-5');
    expect(sent.max_tokens).toBe(1024);
    expect(sent.temperature).toBe(0.2);
    // FE prompt first, then the server-side plain-text style rule (the FAB
    // drawer has no Markdown renderer).
    expect(sent.system.startsWith('Kamu adalah VoltHub AI.')).toBe(true);
    expect(sent.system).toContain('TEKS POLOS');
    expect(sent.tool_choice).toEqual({ type: 'any' }); // OpenAI "required" → Anthropic "any"
    expect(sent.tools).toEqual([
      {
        name: 'query_volthub_data',
        description: 'Query data VoltHub',
        input_schema: { type: 'object', properties: { question: { type: 'string' } } },
      },
    ]);
    expect(sent.messages).toEqual([
      { role: 'user', content: 'berapa gardu OOP hari ini' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'call_1',
            name: 'query_volthub_data',
            input: { question: 'gardu OOP' },
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'OOP: 1.179' }],
      },
    ]);
  });

  it('maps a tool_use response to OpenAI tool_calls with finish_reason "tool_calls"', async () => {
    mockCreate.mockResolvedValue({
      id: 'msg_2',
      model: 'claude-haiku-4-5',
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'Saya cek dulu.' },
        {
          type: 'tool_use',
          id: 'toolu_abc',
          name: 'query_volthub_data',
          input: { question: 'gardu OOP hari ini' },
        },
      ],
      usage: { input_tokens: 50, output_tokens: 30 },
    });
    const req = {
      body: { messages: [{ role: 'user', content: 'berapa gardu OOP hari ini' }] },
    } as unknown as Request;
    const res = makeRes();

    await groqProxy(req, res);

    const sentBack = res.json.mock.calls[0][0];
    expect(sentBack.choices[0].finish_reason).toBe('tool_calls');
    expect(sentBack.choices[0].message).toEqual({
      role: 'assistant',
      content: 'Saya cek dulu.',
      tool_calls: [
        {
          id: 'toolu_abc',
          type: 'function',
          function: {
            name: 'query_volthub_data',
            arguments: JSON.stringify({ question: 'gardu OOP hari ini' }),
          },
        },
      ],
    });
    expect(sentBack.usage).toEqual({ prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 });
  });

  it('maps a final text response to choices[0].message.content with finish_reason "stop"', async () => {
    mockCreate.mockResolvedValue({
      id: 'msg_3',
      model: 'claude-haiku-4-5',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Hari ini ada 1.179 gardu OOP.' }],
      usage: { input_tokens: 10, output_tokens: 12 },
    });
    const req = { body: { messages: [{ role: 'user', content: 'hai' }] } } as unknown as Request;
    const res = makeRes();

    await groqProxy(req, res);

    const sentBack = res.json.mock.calls[0][0];
    expect(sentBack.choices[0].message.content).toBe('Hari ini ada 1.179 gardu OOP.');
    expect(sentBack.choices[0].message.tool_calls).toBeUndefined();
    expect(sentBack.choices[0].finish_reason).toBe('stop');
  });

  it('relays Anthropic errors in the OpenAI {error:{message,code}} shape with Retry-After', async () => {
    mockCreate.mockRejectedValue(
      new MockAPIError(
        429,
        { type: 'error', error: { type: 'rate_limit_error', message: 'Too many requests' } },
        '429 Too many requests',
        new Headers({ 'retry-after': '7' }),
        'rate_limit_error'
      )
    );
    const req = { body: { messages: [{ role: 'user', content: 'hai' }] } } as unknown as Request;
    const res = makeRes();

    await groqProxy(req, res);

    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '7');
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      error: { message: 'Too many requests', code: 'rate_limit_error' },
    });
  });

  it('returns a 502 when the Anthropic client cannot reach the upstream at all', async () => {
    mockCreate.mockRejectedValue(new MockAPIError(undefined, undefined, 'Connection error.', undefined));
    const req = { body: { messages: [{ role: 'user', content: 'hai' }] } } as unknown as Request;
    const res = makeRes();

    await groqProxy(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
  });

  it('returns an honest 503 when ANTHROPIC_API_KEY is not configured', async () => {
    (env as { ANTHROPIC_API_KEY: string }).ANTHROPIC_API_KEY = '';
    const req = { body: { messages: [{ role: 'user', content: 'hai' }] } } as unknown as Request;
    const res = makeRes();

    await groqProxy(req, res);

    expect(mockCreate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
