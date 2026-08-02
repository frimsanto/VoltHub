// VoltHub — GIS bottom summary bar (Screen 10, PETUGAS mobile only).
// Always-visible strip above the bottom nav: total gardu in view + live RC
// inscan/OOP + active WO counts. Real numbers — same aggregate hook the
// dashboard/scada pages already use (GET /assets/scada/summary + dashboard
// overview), not GIS-catalog-derived (the layer catalog has no inscan/OOP
// breakdown, only per-layer feature counts).
import { useGarduOverview } from "@/features/v2/dashboard/api";

function Count({
  value,
  label,
  color,
}: {
  value: number | undefined;
  label: string;
  color: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[12px] font-bold tabular-nums text-white">{value ?? "…"}</span>
      <span className="text-[10px] text-white/40">{label}</span>
    </span>
  );
}

export function GisMobileSummaryBar() {
  const { totalGardu, rcInscan, rcOop, openTickets, isLoading } = useGarduOverview();

  return (
    <div
      // z-[1001]: above GisMap's own "X lokasi" viewport-count hint (z-[1000],
      // bottom-left) so this bar — which sits in the same strip, full-width —
      // fully occludes it instead of the two overlapping illegibly.
      className="absolute inset-x-0 z-[1001] flex items-center justify-between px-4 py-2.5"
      style={{
        bottom: "var(--bottomnav-h)",
        background: "rgba(14,14,22,.92)",
        borderTop: "0.5px solid rgba(255,255,255,.08)",
        backdropFilter: "blur(8px)",
      }}
    >
      <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-white/60">
        {totalGardu ?? "…"} Gardu
        <span className="relative flex size-1.5">
          {!isLoading && (
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-green-500 opacity-75" />
          )}
          <span className="relative inline-flex size-1.5 rounded-full bg-green-500" />
        </span>
        Live
      </span>
      <div className="flex items-center gap-3">
        <Count value={rcInscan} label="Inscan" color="#22c55e" />
        <Count value={rcOop} label="OOP" color="#ef4444" />
        <Count value={openTickets} label="WO" color="#f97316" />
      </div>
    </div>
  );
}
