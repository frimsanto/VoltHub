// VoltHub V2 — Asset SIM cards (nested under /assets/{assetId}/sim-cards).
// Nested + mixed paths (create under asset; update/delete by sim id) don't fit the
// generic resource factory, so hooks are hand-written here.
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { v2Get, v2Post, v2Put, v2Delete, handleError } from "@/lib/api/v2";
import type { SimCard, CreateSimCard, UpdateSimCard } from "@/lib/api/v2";

const keys = {
  list: (assetId: string) => ["v2-sim-cards", assetId] as const,
};

export function useSimCards(assetId: string | undefined) {
  return useQuery({
    queryKey: keys.list(assetId ?? "—"),
    queryFn: () => v2Get<SimCard[]>(`/assets/${assetId}/sim-cards`),
    enabled: !!assetId,
  });
}

export function useCreateSimCard(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSimCard) => v2Post<SimCard, CreateSimCard>(`/assets/${assetId}/sim-cards`, body),
    onSuccess: () => {
      toast.success("SIM card ditambahkan");
      qc.invalidateQueries({ queryKey: keys.list(assetId) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export function useUpdateSimCard(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSimCard }) =>
      v2Put<SimCard, UpdateSimCard>(`/sim-cards/${id}`, body),
    onSuccess: () => {
      toast.success("SIM card diperbarui");
      qc.invalidateQueries({ queryKey: keys.list(assetId) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export function useDeleteSimCard(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => v2Delete(`/sim-cards/${id}`),
    onSuccess: () => {
      toast.success("SIM card dihapus");
      qc.invalidateQueries({ queryKey: keys.list(assetId) });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

export const simCardSchema = z.object({
  simSlot: z.number().int().min(1, "Slot wajib diisi"),
  provider: z.string().nullish(),
  phoneNumber: z.string().nullish(),
  iccid: z.string().nullish(),
  ipAddress: z.string().nullish(),
});

export type SimCardFormValues = z.infer<typeof simCardSchema>;

export const emptySimCard: SimCardFormValues = {
  simSlot: 1,
  provider: null,
  phoneNumber: null,
  iccid: null,
  ipAddress: null,
};
