import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { validate } from '../../middlewares/validate';
import { aiController } from './ai.controller';
import { aiSearchQuerySchema, aiChatSchema, aiLaporanLapanganSchema } from './ai.validation';
import { brainController } from './brain/brain.controller';
import {
  brainTurnSchema,
  brainClarifySchema,
  brainFeedbackSchema,
} from './brain/brain.validation';
import { groqProxy, groqProxyLimiter, groqProxySchema } from './groq-proxy';

/**
 * AI routes (TDD_API §15). Read-only AI-ready search → any authenticated role.
 */
const router = Router();
router.use(authenticate);

router.get('/assets/search', validate(aiSearchQuerySchema, 'query'), aiController.searchAssets);
// FAB assistant model backend (path kept as /groq-proxy for FE compatibility).
// Keeps ANTHROPIC_API_KEY server-side (never shipped to the browser). Per-user
// rate-limited; body is the OpenAI-compatible chat-completions payload, which
// the handler translates to/from the Anthropic Messages API (claude-haiku-4-5).
router.post('/groq-proxy', groqProxyLimiter, validate(groqProxySchema, 'body'), groqProxy);
// Conversational assistant (natural language → tool-use over the DB).
router.post('/chat', validate(aiChatSchema, 'body'), aiController.chat);
// Field-report summaries for the FAB assistant (tenant-scoped via execTool).
router.post('/laporan-lapangan', validate(aiLaporanLapanganSchema, 'body'), aiController.laporanLapangan);

// ── Personalisation (any authenticated role — a user only ever sees/clears
// their OWN AI memory, keyed by the JWT userId) ──────────────────────────────
router.get('/preferences', aiController.getPreferences);
router.delete('/preferences/context', aiController.clearPreferencesContext);

// ── VoltHub AI Brain V1 — production foundation (intent → registry → scoped) ──
// Multi-channel ready (in_app / whatsapp / voice); all RBAC + tenant scope is
// resolved server-side in the controller's context resolver.
router.post('/brain', validate(brainTurnSchema, 'body'), brainController.turn);
router.post('/brain/clarify', validate(brainClarifySchema, 'body'), brainController.clarify);
router.get('/brain/suggestions', brainController.suggestions);
router.post('/brain/feedback', validate(brainFeedbackSchema, 'body'), brainController.feedback);

export default router;
