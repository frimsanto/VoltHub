// VoltHub V2 — lookup hooks for select options (locations, feeders, assets).
// Fetch a generous first page (limit 100) for dropdowns. Good enough for master
// data; replace with async-search combobox if option counts grow large.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { locations } from "@/features/v2/locations/resource";
import { feeders } from "@/features/v2/feeders/resource";
import { assets } from "@/features/v2/assets/resource";
import { getUsers } from "@/lib/api/users";
import { getTeams } from "@/lib/api/teams";
import { v2Get } from "@/lib/api/v2";
import type { SelectOption } from "@/components/v2/fields";
import { useAuthStore } from "@/stores/auth";
import { toV2Role } from "@/lib/v2/rbac";

// The location relation the API embeds on master-data rows (feeder / asset /
// comm-media). Display columns must read THIS — not useLocationOptions (capped
// at 100 rows) — so the Gardu name resolves for every row across 14k+ gardu.
export interface EmbeddedLocation {
  id?: string;
  code?: string | null;
  name?: string | null;
}

/** Gardu label for an embedded location relation: name → code → em-dash. */
export function embeddedLocationLabel(loc?: EmbeddedLocation | null): string {
  return loc?.name ?? loc?.code ?? "—";
}

import { locationLabel } from "@/lib/utils";

// `type` filters by locationType (GI / GH / GARDU). Penyulang hangs off a Gardu
// Induk, so that caller passes "GI" to avoid listing distribution gardu.
export function useLocationOptions(type?: string): {
  options: SelectOption[];
  isLoading: boolean;
} {
  const q = locations.useList({ page: 1, limit: 500, type });
  const options = useMemo(
    () =>
      (q.data?.items ?? [])
        .map((l) => ({
          value: l.id as string,
          label: locationLabel(l.code, l.name),
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [q.data],
  );
  return { options, isLoading: q.isLoading };
}

export function useFeederOptions(locationId?: string): {
  options: SelectOption[];
  isLoading: boolean;
} {
  const q = feeders.useList({ page: 1, limit: 100, locationId }, { enabled: !!locationId });
  const options = useMemo(
    () =>
      (q.data?.items ?? []).map((f) => ({
        value: f.id as string,
        label: f.feederName ?? "",
      })),
    [q.data],
  );
  return { options, isLoading: q.isLoading };
}

// Penyulang milik satu GH via endpoint scoped fail-closed (GET /gh/inspeksi/feeders).
// Dipakai form WO (Admin pilih GH → daftar penyulang) & form laporan GH (dropdown
// per-entri kubikel). GH tanpa feeder → array kosong (bukan error).
export interface GhFeeder {
  id: string;
  feederCode: string;
  feederName: string;
}
export function useGhFeeders(locationId?: string): {
  feeders: GhFeeder[];
  options: SelectOption[];
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: ["v2-gh-feeders", locationId],
    queryFn: () => v2Get<GhFeeder[]>("/gh/inspeksi/feeders", { params: { locationId } }),
    enabled: !!locationId,
  });
  const list = useMemo(() => q.data ?? [], [q.data]);
  const options = useMemo(
    () => list.map((f) => ({ value: f.id, label: f.feederName || f.feederCode })),
    [list],
  );
  return { feeders: list, options, isLoading: q.isLoading };
}

/** Assignable users (V1 admin endpoint). Only enable for admin-tier callers —
 *  /api/users is admin-only, so disable to avoid a 403 for field officers. */
export function useUserOptions(enabled = true): { options: SelectOption[]; isLoading: boolean } {
  const q = useQuery({
    queryKey: ["v2-ticket-assignees"],
    queryFn: () => getUsers(),
    enabled,
  });
  const options = useMemo(
    () =>
      (q.data ?? []).map((u) => ({
        value: u.id,
        label: `${u.name} (${u.email})`,
      })),
    [q.data],
  );
  return { options, isLoading: q.isLoading };
}

/** Teams (V1 admin endpoint). Enable only for admin-tier callers. */
// Urutan natural: nama tim (Tim A sebelum Tim B) lalu nomor RTUPP menaik, alih-alih
// urutan mentah dari API (campur aduk, susah dipindai di dropdown panjang).
const teamSortKey = (label: string): [string, number] => {
  const m = /^(.*?RTUPP\s*)(\d+)/i.exec(label);
  return m ? [label.slice(0, m[1].length), parseInt(m[2], 10)] : [label, 0];
};

export function useTeamOptions(enabled = true): { options: SelectOption[]; isLoading: boolean } {
  const user = useAuthStore((s) => s.user);
  const role = toV2Role(user?.role);
  // ADMIN hanya boleh melihat tim dalam RTUPP-nya sendiri; MASTER/MANAGER global.
  const rtuppId = role === "ADMIN" ? (user?.rtupp?.id ?? undefined) : undefined;

  const q = useQuery({
    queryKey: ["v2-team-options", rtuppId],
    queryFn: () => getTeams(rtuppId ? { rtuppId } : undefined),
    enabled,
  });
  const options = useMemo(
    () =>
      (q.data ?? [])
        .map((t) => ({
          value: t.id,
          label: t.code ? `${t.name} (${t.code})` : t.name,
        }))
        .sort((a, b) => {
          const [prefixA, numA] = teamSortKey(a.label);
          const [prefixB, numB] = teamSortKey(b.label);
          return prefixA === prefixB ? numA - numB : prefixA.localeCompare(prefixB);
        }),
    [q.data],
  );
  return { options, isLoading: q.isLoading };
}

export function useAssetOptions(params?: { locationId?: string; excludeId?: string }): {
  options: SelectOption[];
  isLoading: boolean;
} {
  const q = assets.useList({ page: 1, limit: 100, locationId: params?.locationId });
  const options = useMemo(
    () =>
      (q.data?.items ?? [])
        .filter((a) => a.id !== params?.excludeId)
        .map((a) => ({
          value: a.id as string,
          label: a.assetName ?? "",
        })),
    [q.data, params?.excludeId],
  );
  return { options, isLoading: q.isLoading };
}
