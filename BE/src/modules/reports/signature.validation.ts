import { z } from 'zod';

/** Verify a raw compact token (payload.signature) — e.g. scanned from a QR. */
export const verifyTokenSchema = z.object({
  token: z.string().min(1, 'token wajib diisi').max(8192),
});

/** Optional revocation reason (admin). */
export const revokeSchema = z.object({
  reason: z.string().max(255).optional(),
});

export const idParamSchema = z.object({ id: z.string().min(1) });

export type VerifyTokenInput = z.infer<typeof verifyTokenSchema>;
export type RevokeInput = z.infer<typeof revokeSchema>;
