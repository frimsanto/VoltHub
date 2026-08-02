/**
 * Context Resolver.
 *
 * Builds the AiContext ONCE per request, server-side, from the authenticated
 * principal — never from model/user-supplied fields. This is what makes Rule #2
 * enforceable: role + tenant scope come from the JWT + DB, so the LLM cannot
 * inflate its role or escape its RTUPP.
 */

import type { AuthRequest } from '../../../middlewares/auth';
import { normalizeRole, type CanonicalRole } from '../../../auth/roles';
import { resolveRequestScope } from '../../../utils/tenantScope';
import { ForbiddenError } from '../../../utils/appError';
import type { AiContext, AiChannel } from './brain.types';

export interface ResolveContextOptions {
  /** Provided by the client; validated against an allow-list. Defaults in_app. */
  channel?: string;
  /** Stable conversation id from the client; falls back to the user id. */
  sessionId?: string;
  locale?: string;
}

const CHANNELS: AiChannel[] = ['in_app', 'whatsapp', 'voice'];

export async function resolveAiContext(
  req: AuthRequest,
  opts: ResolveContextOptions = {}
): Promise<AiContext> {
  const user = req.user;
  if (!user?.userId) throw new ForbiddenError('Authentication required');

  const role = normalizeRole(user.role);
  if (!role) throw new ForbiddenError('Peran pengguna tidak dikenali.');

  // Fail-closed tenant scope (MASTER/MANAGER/ADMIN global; PETUGAS own RTUPP).
  const scope = await resolveRequestScope({
    userId: user.userId,
    role: user.role,
    rtuppId: user.rtuppId ?? null,
  });

  const channel: AiChannel = CHANNELS.includes(opts.channel as AiChannel)
    ? (opts.channel as AiChannel)
    : 'in_app';

  return {
    userId: user.userId,
    role: role as CanonicalRole,
    scope,
    channel,
    sessionId: opts.sessionId?.trim() || `u:${user.userId}`,
    locale: opts.locale === 'en' ? 'en' : 'id',
  };
}