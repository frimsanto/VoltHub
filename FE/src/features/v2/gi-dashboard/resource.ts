// VoltHub — Dashboard GI resource. Backend: BE/src/modules/gi-dashboard.
import { useQuery } from "@tanstack/react-query";
import { v2Get } from "@/lib/api/v2";
import type { GiReportStatus } from "@/lib/v2/enums";

export interface GiStatusCounts {
  total: number;
  DRAFT: number;
  SUBMITTED: number;
  VALIDATED: number;
  REJECTED: number;
}

export interface GiTeamRow {
  teamId: string | null;
  teamName: string;
  inspeksi: number;
  har: number;
  validated: number;
  rcSuccess: number;
  total: number;
}

export interface GiRecentRow {
  type: "INSPEKSI" | "HAR";
  id: string;
  gardu: string;
  team: string;
  status: GiReportStatus;
  reportDate: string;
}

export interface GiDashboard {
  scope: { level: "GLOBAL" | "RTUPP"; rtuppId?: string };
  summary: {
    inspeksi: GiStatusCounts;
    har: GiStatusCounts;
    pendingValidation: number;
    rcSuccessRate: number;
    sesuaiRate: number;
  };
  perTeam: GiTeamRow[];
  recent: GiRecentRow[];
}

export interface GiLeaderRow {
  petugasId: string;
  petugasName: string;
  rtuppName: string;
  teamName: string;
  total: number;
  validated: number;
  rcSuccessRate: number;
}

export function useGiDashboard() {
  return useQuery({
    queryKey: ["gi-dashboard", "overview"],
    queryFn: () => v2Get<GiDashboard>("/gi/dashboard"),
  });
}

/** Leaderboard global — hanya MASTER/MANAGER. `enabled` agar tidak memanggil utk ADMIN. */
export function useGiLeaderboard(enabled: boolean, limit = 10) {
  return useQuery({
    queryKey: ["gi-dashboard", "leaderboard", limit],
    queryFn: () => v2Get<GiLeaderRow[]>(`/gi/dashboard/leaderboard?limit=${limit}`),
    enabled,
    retry: false,
  });
}
