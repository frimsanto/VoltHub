import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../utils/jwt';
import { unauthorizedResponse, forbiddenResponse } from '../utils/response';
import { normalizeRole, type CanonicalRole } from '../auth/roles';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      unauthorizedResponse(res, 'Access token required');
      return;
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      unauthorizedResponse(res, 'Invalid token format');
      return;
    }

    const decoded = verifyAccessToken(token);
    req.user = decoded;
    
    next();
  } catch (error) {
    if (error instanceof Error && error.name === 'TokenExpiredError') {
      unauthorizedResponse(res, 'Token expired');
      return;
    }
    unauthorizedResponse(res, 'Invalid token');
  }
};

export const optionalAuth = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyAccessToken(token);
      req.user = decoded;
    }
    
    next();
  } catch {
    next();
  }
};

/**
 * Legacy role gate, kept for the V1 routes. Both the allow-list and the user's
 * role are normalized to the canonical 3-role set (see src/auth/roles.ts) so a
 * list like ['SUPERADMIN','ADMIN_RTUPP','ADMIN'] keeps working unchanged while
 * the deprecated ADMIN_RTUPP is transparently folded into ADMIN.
 */
export const requireRole = (allowedRoles: string[]) => {
  const allowed = new Set<CanonicalRole>(
    allowedRoles.map((r) => normalizeRole(r)).filter((r): r is CanonicalRole => r !== null)
  );

  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      // Unauthenticated: no valid identity → 401
      unauthorizedResponse(res, 'User not authenticated');
      return;
    }

    const userRole = normalizeRole(req.user.role);

    if (!userRole || !allowed.has(userRole)) {
      // Authenticated but role not permitted → 403
      forbiddenResponse(res, 'Access denied: insufficient permissions');
      return;
    }

    next();
  };
};
