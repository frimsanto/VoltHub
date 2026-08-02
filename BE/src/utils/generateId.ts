import { randomUUID } from 'crypto';

export const generateUUID = (): string => {
  return randomUUID();
};

export const generateReportId = (prefix: string): string => {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString(36).toUpperCase();
  return `${prefix}-${year}-${timestamp.slice(-4)}`;
};

/**
 * True when a Prisma error is a unique-constraint violation (P2002).
 * Used to retry sequential reportId generation when two concurrent creates
 * (or a deletion gap) produce the same `${prefix}-${year}-NNN` id.
 */
export const isUniqueConstraintError = (e: unknown): boolean =>
  typeof e === 'object' &&
  e !== null &&
  (e as { code?: string }).code === 'P2002';

export const generateShortId = (length: number = 8): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};
