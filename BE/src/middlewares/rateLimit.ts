import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { env } from '../config/env';

/**
 * Rate limiters (defence against brute force / abuse).
 *
 * - apiLimiter: broad protection on the whole API surface.
 * - authLimiter: stricter limit on auth endpoints; the per-account login lock
 *   (5 failures -> 15 min) is enforced separately in the auth controller. This
 *   IP-based limiter is the outer layer that also covers unknown emails.
 *
 * Disabled automatically under NODE_ENV=test so the suite isn't throttled.
 */
const disabled = env.NODE_ENV === 'test';

/**
 * Auth-specific bypass. In local dev every request shares one loopback IP
 * (::1 / 127.0.0.1), so a handful of failed login attempts exhausts the
 * 20/15min cap and blocks the developer (429). We therefore relax the auth
 * limiter outside production. Production behaviour is unchanged.
 */
const authDisabled = disabled || env.NODE_ENV !== 'production';

/**
 * Same loopback-IP problem the auth limiter calls out applies to the broad API
 * limiter: in local dev a single SPA page legitimately fans out dozens of
 * requests from one loopback IP, so the per-IP cap is exhausted in seconds
 * (every subsequent call 429s). We therefore bypass the broad limiter outside
 * production; production behaviour (abuse protection) is unchanged.
 */
const apiDisabled = disabled || env.NODE_ENV !== 'production';

const standardMessage = {
  success: false,
  message: 'Too many requests, please try again later.',
};

/**
 * Key the broad limiter per authenticated USER (not per IP) when a bearer token
 * is present, so many PLN users behind one corporate NAT/egress IP each get
 * their own budget instead of sharing (and collectively tripping) a single IP
 * bucket. Falls back to IP for unauthenticated traffic. The token is only
 * *decoded* for bucketing here — never trusted for authz (that's the auth
 * middleware's job), so an unverified base64 read is safe.
 */
const userOrIpKey = (req: Request): string => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    try {
      const payload = JSON.parse(Buffer.from(auth.slice(7).split('.')[1], 'base64').toString('utf8'));
      if (payload?.userId) return `user:${payload.userId}`;
    } catch {
      /* malformed token → fall back to IP */
    }
  }
  return req.ip ?? 'unknown';
};

/**
 * Liveness/readiness probes and the version gate must NEVER be throttled — a
 * load balancer (Nginx, k8s) polls them constantly and a 429 there would mark
 * the whole service unhealthy and pull it from rotation. They carry no
 * sensitive data and no abuse value, so they bypass the limiter unconditionally.
 */
const isProbePath = (req: Request): boolean => {
  const p = req.path; // relative to the /api mount
  return p === '/health' || p === '/version';
};

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS, // default 15 min
  max: env.RATE_LIMIT_MAX_REQUESTS, // default 1000 per window per user/IP
  standardHeaders: true, // RateLimit-* headers
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  skip: (req) => apiDisabled || isProbePath(req),
  message: standardMessage,
});

/**
 * Auth endpoints: 20 attempts / 15 min / IP. Intentionally higher than the
 * per-account 5-failure lock so legitimate users sharing an office IP aren't
 * blocked, while still capping large-scale credential stuffing from one source.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => authDisabled,
  // Count only failed auth responses so a burst of valid logins isn't blocked.
  skipSuccessfulRequests: true,
  message: {
    success: false,
    message: 'Too many authentication attempts from this IP. Try again later.',
  },
});
