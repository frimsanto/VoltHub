// VoltHub — Work Order list (Screen 2, PETUGAS mobile only).
// Native card list replacing the DataTable on phones: underline filter tabs +
// status-accent cards. Self-contained (own query, own filter state) so it never
// touches the desktop DataTable's server-paginated state in the route file.
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { SlidersHorizontal } from "lucide-react";
import { motion } from "motion/react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { workOrders, type WorkOrder } from "@/features/v2/work-orders/resource";
import {
  WO_TYPES,
  WO_TYPE_LABELS,
  WO_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  type WorkOrderType,
} from "@/lib/v2/enums";

type TabKey = "ALL" | "CRITICAL" | "ON_PROGRESS" | "ASSIGNED" | "DONE";

const TABS: { key: TabKey; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "CRITICAL", label: "Kritis" },
  { key: "ON_PROGRESS", label: "Dikerjakan" },
  { key: "ASSIGNED", label: "Assigned" },
  { key: "DONE", label: "Selesai" },
];

const STATUS_BAR_COLOR: Record<WorkOrder["status"], string> = {
  DRAFT: "#94a3b8",
  ASSIGNED: "#3b82f6",
  ON_PROGRESS: "#f59e0b",
  WAITING_APPROVAL: "#8b5cf6",
  APPROVED: "#14b8a6",
  REJECTED: "#ef4444",
  CLOSED: "#22c55e",
};

const fmtDate = (d?: string | null) =>
  d
    ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })
    : "—";

function matchesTab(wo: WorkOrder, tab: TabKey): boolean {
  switch (tab) {
    case "ALL":
      return true;
    case "CRITICAL":
      return (
        wo.priority === "CRITICAL" && (wo.status === "ASSIGNED" || wo.status === "ON_PROGRESS")
      );
    case "ON_PROGRESS":
      return wo.status === "ON_PROGRESS";
    case "ASSIGNED":
      return wo.status === "ASSIGNED";
    case "DONE":
      return wo.status === "CLOSED" || wo.status === "APPROVED";
  }
}

function WoCard({ wo }: { wo: WorkOrder }) {
  const color = STATUS_BAR_COLOR[wo.status];
  return (
    <Link to="/work-order/$id" params={{ id: wo.id }}>
      <motion.div
        whileTap={{ scale: 0.97 }}
        className="overflow-hidden rounded-2xl border"
        style={{ background: "#131320", borderColor: "rgba(255,255,255,.07)" }}
      >
        <div
          className="flex items-center justify-between px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-white"
          style={{ background: color }}
        >
          <span>{WO_STATUS_LABELS[wo.status]}</span>
          <span className="font-medium normal-case opacity-90">
            Jatuh tempo {fmtDate(wo.dueDate)}
          </span>
        </div>
        <div className="space-y-2 p-3.5">
          <div>
            <p className="truncate text-[13px] font-extrabold text-white">
              {wo.location?.name ?? wo.location?.code ?? "—"}
            </p>
            <p className="truncate text-[10.5px] text-white/40">
              {wo.woNumber} · {wo.title}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-[9.5px] font-semibold text-white/60">
              {WO_TYPE_LABELS[wo.type]}
            </span>
            {wo.priority && (
              <span
                className="rounded-full px-2 py-0.5 text-[9.5px] font-semibold"
                style={{
                  background: wo.priority === "CRITICAL" ? "#ef444426" : "rgba(255,255,255,.06)",
                  color: wo.priority === "CRITICAL" ? "#ef4444" : "rgba(255,255,255,.6)",
                }}
              >
                {TICKET_PRIORITY_LABELS[wo.priority]}
              </span>
            )}
          </div>
          {wo.status === "ON_PROGRESS" && (wo.requiredReports?.length ?? 0) > 0 && (
            <div className="pt-1">
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-1/2 rounded-full" style={{ background: "#f97316" }} />
              </div>
              <p className="mt-1 text-[9.5px] text-white/30">Laporan sedang dikerjakan</p>
            </div>
          )}
        </div>
      </motion.div>
    </Link>
  );
}

export function WorkOrderMobileList() {
  const [tab, setTab] = useState<TabKey>("ALL");
  const [filterOpen, setFilterOpen] = useState(false);
  const [type, setType] = useState<WorkOrderType | undefined>(undefined);

  const query = workOrders.useList({ page: 1, limit: 100, mine: true, type });
  const items = query.data?.items ?? [];
  const activeCount = items.filter(
    (wo) => wo.status === "ASSIGNED" || wo.status === "ON_PROGRESS",
  ).length;
  const filtered = items.filter((wo) => matchesTab(wo, tab));

  return (
    <div>
      {/* 1 ── Header */}
      <div className="flex items-center justify-between px-4 pb-3 pt-safe pt-3">
        <div>
          <h1 className="text-[17px] font-extrabold text-white">Work Order</h1>
          <p className="text-[11px] text-white/40">{activeCount} aktif</p>
        </div>
        <button
          type="button"
          onClick={() => setFilterOpen(true)}
          aria-label="Filter"
          className="flex touch-target size-10 items-center justify-center rounded-full border border-white/[0.07] bg-[#131320]"
        >
          <SlidersHorizontal className="size-4 text-white/70" />
        </button>
      </div>

      {/* 2 ── Filter tabs (underline) */}
      <div className="flex gap-4 overflow-x-auto border-b border-white/[0.06] px-4 scrollbar-hide">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "shrink-0 whitespace-nowrap pb-2.5 pt-1 text-[12.5px] font-semibold transition-colors",
                active ? "border-b-2" : "border-b-2 border-transparent",
              )}
              style={{
                color: active ? "#f97316" : "rgba(255,255,255,.3)",
                borderColor: active ? "#f97316" : "transparent",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* 3 ── Cards */}
      <div className="space-y-2.5 p-4">
        {query.isLoading ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-white/5" />
          ))
        ) : filtered.length === 0 ? (
          <p className="py-10 text-center text-[12px] text-white/30">
            Tidak ada work order di kategori ini.
          </p>
        ) : (
          filtered.map((wo) => <WoCard key={wo.id} wo={wo} />)
        )}
      </div>

      {/* Filter sheet — Jenis WO (Preventif/Korektif). */}
      <Drawer open={filterOpen} onOpenChange={setFilterOpen}>
        <DrawerContent className="pb-safe">
          <DrawerHeader className="text-left">
            <DrawerTitle>Filter Jenis</DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-3 gap-2 px-4 pb-4">
            {[
              { value: undefined, label: "Semua" },
              ...WO_TYPES.map((v) => ({ value: v, label: WO_TYPE_LABELS[v] })),
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => {
                  setType(o.value);
                  setFilterOpen(false);
                }}
                className={cn(
                  "touch-target rounded-xl border px-2 py-2.5 text-[12px] font-semibold transition-colors",
                  type === o.value
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-white/[0.07] text-white/60",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
