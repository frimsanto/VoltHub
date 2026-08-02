import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { aiService } from './ai.service';
import { isAgentEnabled, runAgent, execTool } from './ai.agent';
import { loadUserContext, clearUserMemory } from './brain/memory/user-memory.repository';
import { discardPendingUserContext } from './brain/memory/conversation-memory';
import type { AiSearchQuery, AiChatBody, AiLaporanLapanganBody } from './ai.validation';

export class AiController {
  // GET /ai/assets/search?q=KB305
  searchAssets = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { q } = req.query as unknown as AiSearchQuery;
      const result = await aiService.searchAssets(q, scope);
      successResponse(res, result, 'AI asset search completed');
    } catch (err) {
      next(err);
    }
  };

  // POST /ai/chat — natural-language assistant (Claude tool-use over the DB).
  // When no API key is configured the LLM is disabled; we signal the client to
  // fall back to its local deterministic engine rather than erroring.
  chat = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!isAgentEnabled()) {
        successResponse(res, { mode: 'fallback' }, 'AI assistant in fallback mode');
        return;
      }
      const scope = await resolveRequestScope(req.user);
      const { message, history } = req.body as AiChatBody;
      const result = await runAgent(message, history ?? [], scope, {
        userId: req.user?.userId,
        name: req.user?.name,
        role: req.user?.role,
        rtuppId: req.user?.rtuppId ?? null,
      });
      successResponse(res, { mode: 'llm', ...result }, 'AI assistant replied');
    } catch (err) {
      next(err);
    }
  };

  // POST /ai/laporan-lapangan — field-report summaries for the FAB assistant
  // (Inspeksi GH + HAR GH/GI/MP). Thin wrapper over the agent's execTool, which
  // applies the RTUPP tenant scope itself via location.rtuppId (fail-closed
  // upstream in resolveRequestScope).
  laporanLapangan = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const body = req.body as AiLaporanLapanganBody;
      const result = await execTool(
        'get_laporan_lapangan',
        body as Record<string, unknown>,
        scope
      );
      successResponse(res, result, 'Laporan lapangan summary');
    } catch (err) {
      next(err);
    }
  };

  // GET /ai/preferences — does the AI already "know" this user? (Personalisation
  // indicator for the FE; exposes only summary flags, never the raw snapshot.)
  getPreferences = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      const ctx = userId ? await loadUserContext(userId) : null;
      successResponse(
        res,
        {
          hasContext: !!ctx,
          lastActiveAt: ctx?.lastActiveAt,
          topIntents: ctx?.topIntents.slice(0, 5).map((i) => i.id),
        },
        'AI preferences'
      );
    } catch (err) {
      next(err);
    }
  };

  // DELETE /ai/preferences/context — user-initiated "forget me": clears the
  // persisted snapshot + learned prefs AND any queued debounced save.
  clearPreferencesContext = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (userId) {
        discardPendingUserContext(userId);
        await clearUserMemory(userId);
      }
      successResponse(res, { cleared: true }, 'AI context cleared');
    } catch (err) {
      next(err);
    }
  };
}

export const aiController = new AiController();
