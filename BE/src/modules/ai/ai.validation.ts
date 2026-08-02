import { z } from 'zod';

export const aiSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Query "q" wajib diisi'),
});

export type AiSearchQuery = z.infer<typeof aiSearchQuerySchema>;

// Conversational chat (natural-language assistant). `history` carries prior
// turns for context; only the trailing few are forwarded to the model.
export const aiChatSchema = z.object({
  message: z.string().trim().min(1, 'Pesan tidak boleh kosong').max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      }),
    )
    .max(20)
    .optional(),
});

export type AiChatBody = z.infer<typeof aiChatSchema>;

// Field-report summary lookup (FAB tool get_laporan_lapangan) — mirrors the
// agent tool's input schema; execTool re-sanitises limit/type defensively.
export const aiLaporanLapanganSchema = z.object({
  locationCode: z.string().trim().max(50).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  type: z.enum(['inspeksi', 'har', 'all']).optional(),
});

export type AiLaporanLapanganBody = z.infer<typeof aiLaporanLapanganSchema>;
