import { Request, Response, NextFunction } from 'express';
import { extractAuditContext, runWithAuditContext } from '../utils/audit';

/**
 * Captures ipAddress / userAgent once per request and exposes them to the rest
 * of the request lifecycle (controllers + services) via AsyncLocalStorage.
 *
 * Mounted early in the middleware chain so every downstream handler runs inside
 * the context. `next()` is invoked synchronously inside `runWithAuditContext`
 * so all subsequent async work inherits the store.
 */
export const auditContext = (req: Request, _res: Response, next: NextFunction): void => {
  runWithAuditContext(extractAuditContext(req), () => next());
};
