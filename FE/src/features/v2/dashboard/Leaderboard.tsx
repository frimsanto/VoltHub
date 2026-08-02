// VoltHub — Team Achievement/Leaderboard widget (Dashboard Lapangan).
//
// Monthly activity ranking between the teams of one RTUPP, computed on the BE
// (dashboard/leaderboard.service: score, dense rank and badges are all
// server-assigned — this component only renders). MASTER picks the RTUPP via a
// dropdown; other roles are resolved to their own RTUPP by the BE (PETUGAS is
// pinned there fail-closed).
import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { useV2Role } from "@/lib/v2/rbac";
import { useRtupps } from "@/features/v2/admin/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionCard } from "./widgets";
import { useLeaderboard, type LeaderboardEntry } from "./api";

const MEDALS = ["🥇", "🥈", "🥉"];

/** Chip tone per badge: orange = Tim Terbaik, blue = WO Champion, green = rest. */
function badgeTone(badge: string): string {
  if (badge.includes("Terbaik")) return "bg-orange-500/10 text-orange-600 dark:text-orange-400";
  if (badge.includes("Champion")) return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
  return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
}

/** "2026-07" → "Juli 2026" (label only; falls back to the raw value). */
function monthLabel(month?: string): string | null {
  if (!month) return null;
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

/** RTUPP dropdown for global-scope viewers; auto-selects the first entry. */
function RtuppPicker({ value, onChange }: { value?: string; onChange: (id: string) => void }) {
  const q = useRtupps();
  const options = q.data ?? [];
  useEffect(() => {
    if (!value && options.length > 0) onChange(options[0].id);
  }, [value, options, onChange]);
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-48 text-xs">
        <SelectValue placeholder="Pilih RTUPP" />
      </SelectTrigger>
      <SelectContent>
        {options.map((r) => (
          <SelectItem key={r.id} value={r.id}>
            {r.code} — {r.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LeaderboardRow({ entry }: { entry: LeaderboardEntry }) {
  const medal = entry.rank <= 3 ? MEDALS[entry.rank - 1] : `#${entry.rank}`;
  return (
    <tr className="border-b last:border-0">
      <td className="px-2 py-2.5 text-center text-base" aria-label={`Peringkat ${entry.rank}`}>
        {medal}
      </td>
      <td className="px-2 py-2.5">
        <div className="text-sm font-medium">{entry.teamName}</div>
        {entry.leaderName && (
          <div className="text-xs text-muted-foreground">Ketua: {entry.leaderName}</div>
        )}
        {entry.badges.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {entry.badges.map((b) => (
              <span
                key={b}
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badgeTone(b)}`}
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </td>
      <td className="hidden px-2 py-2.5 text-center text-sm tabular-nums md:table-cell">
        {entry.woCompleted}
      </td>
      <td className="hidden px-2 py-2.5 text-center text-sm tabular-nums md:table-cell">
        {entry.inspeksiCount}
      </td>
      <td className="hidden px-2 py-2.5 text-center text-sm tabular-nums md:table-cell">
        {entry.harCount}
      </td>
      <td className="hidden px-2 py-2.5 text-center text-sm tabular-nums md:table-cell">
        {entry.laporanApproved}
      </td>
      <td className="px-2 py-2.5 text-right text-sm font-semibold tabular-nums">{entry.score}</td>
    </tr>
  );
}

/** Table + states; only mounted once an RTUPP is resolvable (avoids a 400). */
function LeaderboardBody({ rtuppId }: { rtuppId?: string }) {
  const { data, isLoading, isError } = useLeaderboard(rtuppId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (isError) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Gagal memuat leaderboard.</p>;
  }

  const teams = data?.teams ?? [];
  const hasActivity = teams.some((t) => t.score > 0);
  if (teams.length === 0 || !hasActivity) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Belum ada aktivitas bulan ini
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="w-12 px-2 py-2 text-center font-medium">Rank</th>
            <th className="px-2 py-2 text-left font-medium">Nama Tim</th>
            <th className="hidden px-2 py-2 text-center font-medium md:table-cell">WO ✓</th>
            <th className="hidden px-2 py-2 text-center font-medium md:table-cell">Inspeksi</th>
            <th className="hidden px-2 py-2 text-center font-medium md:table-cell">HAR</th>
            <th className="hidden px-2 py-2 text-center font-medium md:table-cell">Laporan</th>
            <th className="w-16 px-2 py-2 text-right font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <LeaderboardRow key={t.teamId} entry={t} />
          ))}
        </tbody>
      </table>
      {data?.month && (
        <p className="mt-2 text-right text-[11px] text-muted-foreground">
          Periode {monthLabel(data.month)}
        </p>
      )}
    </div>
  );
}

export function Leaderboard() {
  const role = useV2Role();
  const ownRtuppId = useAuthStore((s) => s.user?.rtupp?.id);
  // MASTER always picks; MANAGER only needs the picker when the account itself
  // carries no RTUPP (global read-only accounts) — others use their own RTUPP.
  const showPicker = role === "MASTER" || (role === "MANAGER" && !ownRtuppId);
  const [selectedRtupp, setSelectedRtupp] = useState<string | undefined>(undefined);
  const rtuppId = showPicker ? (selectedRtupp ?? ownRtuppId) : undefined;

  return (
    <SectionCard
      title="🏆 Leaderboard Tim Bulan Ini"
      icon={Trophy}
      testId="leaderboard-card"
      action={showPicker ? <RtuppPicker value={rtuppId} onChange={setSelectedRtupp} /> : undefined}
    >
      {showPicker && !rtuppId ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Pilih RTUPP…</p>
      ) : (
        <LeaderboardBody rtuppId={rtuppId} />
      )}
    </SectionCard>
  );
}
