import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({ messages: { create: mockCreate } })),
}));
vi.mock('./ai.service', () => ({
  aiService: { searchAssets: vi.fn() },
}));
vi.mock('../dashboard/dashboard.service', () => ({
  dashboardService: { getOverview: vi.fn() },
}));
vi.mock('../scada-realtime/scada-realtime.service', () => ({
  scadaRealtimeService: { getSummary: vi.fn(), listGardu: vi.fn() },
}));

import { runAgent } from './ai.agent';
import { aiService } from './ai.service';
import type { TenantScope } from '../../utils/tenantScope';

const mockedSearchAssets = aiService.searchAssets as unknown as ReturnType<typeof vi.fn>;

// Security regression test: the `search_gardu` tool used to call
// aiService.searchAssets(query) with NO scope — any authenticated role could
// pull ANY gardu's assets/inspections/HAR/documents across every RTUPP via the
// legacy /ai/chat agent. runAgent now takes the caller's scope and must thread
// it into every search_gardu tool call, never falling back to global.
describe('runAgent — search_gardu tool threads the caller scope (not global)', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockedSearchAssets.mockReset();
  });

  it('passes the exact caller scope into aiService.searchAssets', async () => {
    const scope: TenantScope = { global: false, rtuppId: 'rtupp-2' };
    mockedSearchAssets.mockResolvedValue({
      location: { code: 'PM46', name: 'Gardu PM46', locationType: 'GARDU', up3: 'UP3-X' },
      assetCount: 0,
      assets: [],
      communicationMedia: [],
      lastInspection: null,
      lastHar: null,
      documentCount: 0,
    });

    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'call-1', name: 'search_gardu', input: { query: 'PM46' } }],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Ditemukan gardu PM46.' }],
      });

    await runAgent('detail gardu PM46', [], scope);

    expect(mockedSearchAssets).toHaveBeenCalledWith('PM46', scope);
  });

  it('a global (MASTER/MANAGER) scope is forwarded as-is, not silently widened or narrowed', async () => {
    const scope: TenantScope = { global: true, rtuppId: null };
    mockedSearchAssets.mockResolvedValue({
      location: { code: 'PM46', name: 'Gardu PM46', locationType: 'GARDU', up3: 'UP3-X' },
      assetCount: 0,
      assets: [],
      communicationMedia: [],
      lastInspection: null,
      lastHar: null,
      documentCount: 0,
    });

    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 'call-1', name: 'search_gardu', input: { query: 'PM46' } }],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Ditemukan gardu PM46.' }],
      });

    await runAgent('detail gardu PM46', [], scope);

    expect(mockedSearchAssets).toHaveBeenCalledWith('PM46', scope);
  });
});
