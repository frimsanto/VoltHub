// VoltHub — Work Order detail (Screen 3, PETUGAS mobile only).
// Pure presentation layer: every value/handler is computed by the route
// (_app.work-order.$id.tsx) from the exact same query + mutations the desktop
// view uses, so mobile never re-fetches or re-derives business logic — it only
// re-arranges it into the native "m-banking" layout (sticky header, hero pills,
// progress rings, vertical timeline, bottom CTA bar).
import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { motion } from "motion/react";
import {
  ChevronLeft,
  MoreVertical,
  Share2,
  UserPlus,
  XCircle,
  Lock,
  RotateCcw,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { toast } from "sonner";
import { WO_STATUS_LABELS, WO_TYPE_LABELS, TICKET_PRIORITY_LABELS } from "@/lib/v2/enums";
import type { WorkOrder } from "./resource";

const STATUS_COLOR: Record<WorkOrder["status"], string> = {
  DRAFT: "#94a3b8",
  ASSIGNED: "#3b82f6",
  ON_PROGRESS: "#f59e0b",
  WAITING_APPROVAL: "#8b5cf6",
  APPROVED: "#14b8a6",
  REJECTED: "#ef4444",
  CLOSED: "#22c55e",
};

const fmtDateTime = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function Pill({ children, color }: { children: ReactNode; color: string }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[10px] font-bold"
      style={{ background: `${color}26`, color }}
    >
      {children}
    </span>
  );
}

function RingProgress({ pct, color, size = 32 }: { pct: number; color: string; size?: number }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke="rgba(255,255,255,.1)"
        strokeWidth={stroke}
        fill="none"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth={stroke}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c - (c * pct) / 100}
        strokeLinecap="round"
      />
    </svg>
  );
}

interface ReqReportRow {
  key: string;
  label: string;
  done: boolean;
  status: string | null;
  statusIcon: LucideIcon;
  iconClassName: string;
  subText: string;
  existing: unknown;
  goTo: () => void;
}

interface TimelineItem {
  icon: LucideIcon;
  label: string;
  at?: string | null;
}

export interface WorkOrderMobileDetailProps {
  wo: WorkOrder;
  canManage: boolean;
  canCreate: boolean;
  mayExecute: boolean;
  busy: boolean;
  laporanAwalOk: boolean;
  requiresLaporanAwalGate: boolean;
  requiredReportRows: ReqReportRow[];
  headerButtonLabel: string;
  nextActionRow: ReqReportRow | undefined;
  timeline: TimelineItem[];
  onBack: () => void;
  onStart: () => void;
  onGoLaporanAwal: () => void;
  onResultOpen: () => void;
  onAssign: () => void;
  onApprove: () => void;
  onReject: () => void;
  onClose: () => void;
  onReopen: () => void;
  onFollowUp: () => void;
}

export function WorkOrderMobileDetail(props: WorkOrderMobileDetailProps) {
  const {
    wo,
    canManage,
    canCreate,
    mayExecute,
    busy,
    laporanAwalOk,
    requiresLaporanAwalGate,
    requiredReportRows,
    headerButtonLabel,
    nextActionRow,
    timeline,
    onBack,
    onStart,
    onGoLaporanAwal,
    onResultOpen,
    onAssign,
    onApprove,
    onReject,
    onClose,
    onReopen,
    onFollowUp,
  } = props;
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const color = STATUS_COLOR[wo.status];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const doneCount = requiredReportRows.filter((r) => r.done).length;
  const reportPct = requiredReportRows.length ? (doneCount / requiredReportRows.length) * 100 : 0;

  const handleShare = async () => {
    const text = `Work Order ${wo.woNumber} — ${wo.title}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: text, text, url: window.location.href });
      } catch {
        // User cancelled — no-op.
      }
    } else {
      await navigator.clipboard.writeText(`${text}\n${window.location.href}`);
      toast.success("Tautan WO disalin");
    }
  };

  // Primary CTA — priority mirrors the desktop header buttons: field execution
  // first (PETUGAS is the primary phone user), management actions fall back to
  // the "more" sheet.
  let primaryLabel: string | null = null;
  let primaryAction: (() => void) | null = null;
  let primaryDisabled = false;

  if (mayExecute && wo.status === "ASSIGNED") {
    primaryLabel = "Mulai WO";
    primaryAction = onStart;
  } else if (mayExecute && (wo.status === "ASSIGNED" || wo.status === "ON_PROGRESS")) {
    if (requiresLaporanAwalGate && !laporanAwalOk) {
      primaryLabel = "Isi Laporan Awal";
      primaryAction = onGoLaporanAwal;
    } else if (requiredReportRows.length === 0) {
      primaryLabel = "Lengkapi Laporan WO";
      primaryAction = onResultOpen;
    } else if (nextActionRow) {
      primaryLabel = headerButtonLabel;
      primaryAction = nextActionRow.goTo;
    }
  } else if (canManage && wo.status === "WAITING_APPROVAL") {
    primaryLabel = "Setujui";
    primaryAction = onApprove;
  } else if (canManage && wo.status === "APPROVED") {
    primaryLabel = "Tutup WO";
    primaryAction = onClose;
  } else if (canManage && wo.status === "CLOSED") {
    primaryLabel = "Buka Kembali";
    primaryAction = onReopen;
  } else if (canCreate && wo.status === "REJECTED") {
    primaryLabel = "Buat WO Lanjutan";
    primaryAction = onFollowUp;
  }
  if (busy) primaryDisabled = true;

  return (
    <div className="min-h-screen pb-40" style={{ background: "#0e0e16" }}>
      {/* 1 ── Sticky topbar */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between px-3 pb-2.5 pt-safe pt-2.5 transition-colors"
        style={
          scrolled
            ? { background: "#0e0e16", borderBottom: "1px solid rgba(255,255,255,.07)" }
            : undefined
        }
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="flex touch-target size-9 items-center justify-center rounded-full active:bg-white/10"
        >
          <ChevronLeft className="size-5 text-white" />
        </button>
        <span className="truncate px-2 text-[13px] font-bold text-white">WO Detail</span>
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="Menu lainnya"
          className="flex touch-target size-9 items-center justify-center rounded-full active:bg-white/10"
        >
          <MoreVertical className="size-5 text-white" />
        </button>
      </div>

      <div className="space-y-4 px-4 pt-1">
        {/* 2 ── Hero */}
        <div>
          <div className="flex flex-wrap gap-1.5">
            <Pill color="#94a3b8">{WO_TYPE_LABELS[wo.type]}</Pill>
            <Pill color={color}>{WO_STATUS_LABELS[wo.status]}</Pill>
            {wo.priority && (
              <Pill color={wo.priority === "CRITICAL" ? "#ef4444" : "#94a3b8"}>
                {TICKET_PRIORITY_LABELS[wo.priority]}
              </Pill>
            )}
          </div>
          <h1 className="mt-2 text-[15px] font-extrabold leading-snug text-white">{wo.title}</h1>
          <p className="mt-0.5 text-[11.5px] text-white/40">
            {wo.woNumber}
            {wo.team?.name && <span className="text-primary"> · {wo.team.name}</span>}
          </p>
          {requiredReportRows.length > 0 && (
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${reportPct}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-white/40">
                Laporan {doneCount}/{requiredReportRows.length}
              </p>
            </div>
          )}
        </div>

        {/* 3 ── Laporan Wajib — progress ring per laporan */}
        {requiredReportRows.length > 0 && (
          <div
            className="rounded-2xl border p-3.5"
            style={{ background: "#131320", borderColor: "rgba(255,255,255,.07)" }}
          >
            <p className="mb-2.5 flex items-center gap-1.5 text-[12px] font-bold text-white">
              <FileText className="size-3.5 text-primary" /> Laporan Wajib
            </p>
            <ul className="space-y-3">
              {requiredReportRows.map((r) => {
                const pct = r.done ? 100 : r.status === "DRAFT" ? 45 : 0;
                const ringColor = r.done
                  ? "#22c55e"
                  : r.status === "REJECTED"
                    ? "#ef4444"
                    : r.status === "DRAFT"
                      ? "#f59e0b"
                      : "rgba(255,255,255,.2)";
                return (
                  <li
                    key={r.key}
                    onClick={r.existing ? r.goTo : undefined}
                    className="flex items-center gap-3"
                  >
                    <RingProgress pct={pct} color={ringColor} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-white">{r.label}</p>
                      <p className="truncate text-[10.5px] text-white/40">
                        {r.done ? "Sudah diisi" : r.subText}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* 4 ── Ringkasan — meta grid 2 kolom */}
        <div className="rounded-[9px] p-3.5" style={{ background: "#131320" }}>
          <p className="mb-2.5 text-[12px] font-bold text-white">Ringkasan</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <Meta label="Lokasi" value={wo.location?.name ?? wo.location?.code ?? "—"} />
            <Meta label="Tim Pelaksana" value={wo.team?.name ?? "—"} />
            <Meta label="Jatuh Tempo" value={fmtDateTime(wo.dueDate)} />
            <Meta label="Dibuat" value={fmtDateTime(wo.createdAt)} />
            {wo.bay?.name && <Meta label="Bay" value={wo.bay.name} />}
            {wo.feeder?.feederName && <Meta label="Penyulang" value={wo.feeder.feederName} />}
            {wo.hasilRC && <Meta label="Hasil RC" value={wo.hasilRC} />}
            {wo.penyebab && <Meta label="Penyebab" value={wo.penyebab} full />}
          </div>
        </div>

        {/* 5 ── Timeline vertikal */}
        <div className="rounded-[9px] p-3.5" style={{ background: "#131320" }}>
          <p className="mb-3 text-[12px] font-bold text-white">Timeline</p>
          <ol className="space-y-0">
            {timeline.map((t, i) => (
              <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                {i < timeline.length - 1 && (
                  <span
                    className="absolute left-2.25 top-5 h-full w-px"
                    style={{ background: "rgba(255,255,255,.1)" }}
                  />
                )}
                <span
                  className="z-10 mt-0.5 size-4.75 shrink-0 rounded-full"
                  style={{ background: "#22c55e" }}
                />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-white">{t.label}</p>
                  <p className="text-[10.5px] text-white/40">{fmtDateTime(t.at)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* 6 ── CTA bottom bar. bottom: var(--bottomnav-h) — PetugasBottomNav is
          always mounted (every petugas route renders it) and also fixed at
          bottom-0 with a higher paint order, so a bar literally at bottom-0
          here would sit UNDER it and eat its own clicks. */}
      {primaryLabel && (
        <div
          className="fixed inset-x-0 z-20 flex gap-2.5 border-t px-4 pb-3 pt-3"
          style={{
            bottom: "var(--bottomnav-h)",
            background: "#0e0e16",
            borderColor: "rgba(255,255,255,.07)",
          }}
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={() => primaryAction?.()}
            disabled={primaryDisabled}
            className="flex touch-target flex-1 items-center justify-center rounded-xl bg-primary text-[13px] font-bold text-white disabled:opacity-50"
          >
            {primaryLabel}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={handleShare}
            aria-label="Bagikan"
            className="flex touch-target size-11 items-center justify-center rounded-xl border"
            style={{ background: "#131320", borderColor: "rgba(255,255,255,.07)" }}
          >
            <Share2 className="size-4 text-white/70" />
          </motion.button>
        </div>
      )}

      {/* "More" sheet — management actions tucked away on the doer-first CTA screen. */}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent className="pb-safe">
          <DrawerHeader className="text-left">
            <DrawerTitle>{wo.woNumber}</DrawerTitle>
          </DrawerHeader>
          <div className="space-y-1 px-4 pb-4">
            {canManage && ["DRAFT", "ASSIGNED", "ON_PROGRESS"].includes(wo.status) && (
              <SheetAction
                icon={UserPlus}
                label="Tugaskan"
                onClick={() => {
                  setMoreOpen(false);
                  onAssign();
                }}
              />
            )}
            {canManage && wo.status === "WAITING_APPROVAL" && (
              <SheetAction
                icon={XCircle}
                label="Tolak"
                tone="text-destructive"
                onClick={() => {
                  setMoreOpen(false);
                  onReject();
                }}
              />
            )}
            {canManage && wo.status === "APPROVED" && (
              <SheetAction
                icon={Lock}
                label="Tutup WO"
                onClick={() => {
                  setMoreOpen(false);
                  onClose();
                }}
              />
            )}
            {canManage && wo.status === "CLOSED" && (
              <SheetAction
                icon={RotateCcw}
                label="Buka Kembali"
                onClick={() => {
                  setMoreOpen(false);
                  onReopen();
                }}
              />
            )}
            <SheetAction
              icon={Share2}
              label="Bagikan"
              onClick={() => {
                setMoreOpen(false);
                handleShare();
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

function Meta({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "col-span-2" : undefined}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-white/30">{label}</p>
      <p className="mt-0.5 truncate text-[12px] font-medium text-white">{value}</p>
    </div>
  );
}

function SheetAction({
  icon: Icon,
  label,
  onClick,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex touch-target w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold active:bg-white/5 ${tone ?? "text-white"}`}
    >
      <Icon className="size-4" /> {label}
    </button>
  );
}
