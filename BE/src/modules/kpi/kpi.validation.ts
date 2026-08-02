import { z } from 'zod';

/**
 * KPI query validation. All KPI endpoints accept the same optional window
 * controls; `validate(...,'query')` applies the defaults below so the service
 * always receives a clean, bounded shape.
 */
export const kpiQuerySchema = z.object({
  /** Number of months for the Monthly Trend widget (1–24). */
  months: z.coerce.number().int().min(1).max(24).default(6),
  /** SLA window for approval turnaround, in hours (1h–30 days). */
  slaHours: z.coerce.number().int().min(1).max(720).default(48),
  /** How many rows for the Top Petugas leaderboard (1–20). */
  topLimit: z.coerce.number().int().min(1).max(20).default(5),
});

export type KpiQuery = z.infer<typeof kpiQuerySchema>;
