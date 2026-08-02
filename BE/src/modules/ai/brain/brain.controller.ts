import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../../middlewares/auth';
import { successResponse } from '../../../utils/response';
import { resolveAiContext } from './context-resolver';
import { handleTurn, executeIntent } from './brain';
import { suggestedQuestions } from './suggestions';
import { learningRepository } from './learning/learning.repository';
import type { BrainTurnBody, BrainClarifyBody, BrainFeedbackBody } from './brain.validation';

/**
 * VoltHub AI Brain controller. Thin transport layer: it resolves the secure
 * AiContext (role + tenant scope, server-side) and delegates to the Brain.
 * No business or RBAC logic lives here — that is the Brain's job.
 */
export class BrainController {
  // POST /ai/brain — natural-language turn.
  turn = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as BrainTurnBody;
      const ctx = await resolveAiContext(req, {
        channel: body.channel,
        sessionId: body.sessionId,
        locale: body.locale,
      });
      const reply = await handleTurn(ctx, body.message);
      successResponse(res, reply, 'AI Brain replied');
    } catch (err) {
      next(err);
    }
  };

  // POST /ai/brain/clarify — execute a clarification pick (zero-NLU round-trip).
  clarify = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as BrainClarifyBody;
      const ctx = await resolveAiContext(req, {
        channel: body.channel,
        sessionId: body.sessionId,
        locale: body.locale,
      });
      const reply = await executeIntent(
        ctx,
        body.message ?? body.intent,
        body.intent,
        0.95, // user explicitly chose → treat as high confidence
        body.slots
      );
      successResponse(res, reply, 'AI Brain executed selection');
    } catch (err) {
      next(err);
    }
  };

  // GET /ai/brain/suggestions — role-aware starting questions (Phase 5).
  suggestions = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = await resolveAiContext(req);
      successResponse(res, { role: ctx.role, suggestions: suggestedQuestions(ctx.role) }, 'OK');
    } catch (err) {
      next(err);
    }
  };

  // POST /ai/brain/feedback — collect thumbs up/down (Phase 7). A -1 also
  // feeds the per-user learning loop (avoidIntents) — fail-soft, fire-and-forget.
  feedback = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = req.body as BrainFeedbackBody;
      const ok = await learningRepository.processFeedback(
        body.conversationId,
        req.user?.userId,
        body.rating,
        body.note
      );
      successResponse(res, { recorded: ok }, ok ? 'Feedback recorded' : 'Feedback not recorded');
    } catch (err) {
      next(err);
    }
  };
}

export const brainController = new BrainController();