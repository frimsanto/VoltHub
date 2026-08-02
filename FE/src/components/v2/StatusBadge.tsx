// VoltHub V2 — status badges for master-data enums.
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  RC_STATUS_LABELS,
  OPERATIONAL_LABELS,
  HAR_TYPE_LABELS,
  HAR_REPORT_STATUS_LABELS,
  type RcStatus,
  type OperationalStatus,
  type HarType,
  type HarReportStatus,
} from "@/lib/v2/demo-adapter";
import {
  TICKET_STATUS_LABELS,
  TICKET_PRIORITY_LABELS,
  WO_STATUS_LABELS,
  WO_TYPE_LABELS,
  type TicketStatus,
  type TicketPriority,
  type WorkOrderStatus,
  type WorkOrderType,
} from "@/lib/v2/enums";

type AssetStatus = "ACTIVE" | "WARNING" | "DAMAGED" | "RETIRED";

const ASSET_STYLES: Record<AssetStatus, string> = {
  ACTIVE: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
  WARNING: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  DAMAGED: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
  RETIRED: "bg-muted text-muted-foreground border-transparent",
};

export function AssetStatusBadge({ status }: { status?: AssetStatus }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge className={cn("font-medium", ASSET_STYLES[status])}>{status}</Badge>;
}

// ── Operations status badges (Inspection / HAR) ──────────────────────────────
type InspectionStatus = "NORMAL" | "WARNING" | "CRITICAL";
type HarStatus = "NORMAL" | "WARNING" | "CRITICAL" | "OFFLINE";

const OPS_STYLES: Record<HarStatus, string> = {
  NORMAL: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
  WARNING: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  CRITICAL: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
  OFFLINE: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-transparent",
};

export function InspectionStatusBadge({ status }: { status?: InspectionStatus }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge className={cn("font-medium", OPS_STYLES[status])}>{status}</Badge>;
}

export function HarStatusBadge({ status }: { status?: HarStatus }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge className={cn("font-medium", OPS_STYLES[status])}>{status}</Badge>;
}

// ── Import job status badge ───────────────────────────────────────────────────
type ImportStatus = "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
const IMPORT_STYLES: Record<ImportStatus, string> = {
  PENDING: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-transparent",
  PROCESSING: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-transparent",
  SUCCESS: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
  FAILED: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
};
export function ImportStatusBadge({ status }: { status?: ImportStatus }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return <Badge className={cn("font-medium", IMPORT_STYLES[status])}>{status}</Badge>;
}

// ── DEMO badges (RC/SCADA, VIP, Operational) — see lib/v2/demo-adapter.ts ─────
const RC_STYLES: Record<RcStatus, string> = {
  INSCAN: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
  OOP: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
  LOCAL: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
};
export function RcStatusBadge({ status }: { status: RcStatus }) {
  return <Badge className={cn("font-medium", RC_STYLES[status])}>{RC_STATUS_LABELS[status]}</Badge>;
}

/** Status RC REAL dari snapshot SP7 (`Location.scadaOperState`): UP → RC Inscan,
 *  nilai lain (DOWN/LISTEN/LOCAL/…) → RC OOP. Null/undefined = gardu tidak
 *  terdaftar di snapshot → dash, seperti VipBadge. */
export function RcOperStateBadge({ operState }: { operState?: string | null }) {
  if (operState == null) return <span className="text-muted-foreground">—</span>;
  const inscan = operState.toUpperCase() === "UP";
  return (
    <Badge className={cn("font-medium", inscan ? RC_STYLES.INSCAN : RC_STYLES.OOP)}>
      {inscan ? "RC Inscan" : "RC OOP"}
    </Badge>
  );
}

const OPERATIONAL_STYLES: Record<OperationalStatus, string> = {
  NORMAL: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
  WARNING: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  DOWN: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
};
export function OperationalBadge({ status }: { status: OperationalStatus }) {
  return (
    <Badge className={cn("font-medium", OPERATIONAL_STYLES[status])}>
      {OPERATIONAL_LABELS[status]}
    </Badge>
  );
}

const HAR_TYPE_STYLES: Record<HarType, string> = {
  PREVENTIF: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-transparent",
  KOREKTIF: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  PREDIKTIF: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-transparent",
};
export function HarTypeBadge({ type }: { type: HarType }) {
  return (
    <Badge className={cn("font-medium", HAR_TYPE_STYLES[type])}>{HAR_TYPE_LABELS[type]}</Badge>
  );
}

const HAR_REPORT_STATUS_STYLES: Record<HarReportStatus, string> = {
  DRAFT: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-transparent",
  REVIEW: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  APPROVED: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-transparent",
  COMPLETED: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
};
export function HarReportStatusBadge({ status }: { status: HarReportStatus }) {
  return (
    <Badge className={cn("font-medium", HAR_REPORT_STATUS_STYLES[status])}>
      {HAR_REPORT_STATUS_LABELS[status]}
    </Badge>
  );
}

// ── Ticket badges (status + priority) — see lib/v2/enums.ts ───────────────────
const TICKET_STATUS_STYLES: Record<TicketStatus, string> = {
  OPEN: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-transparent",
  ASSIGNED: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-transparent",
  IN_PROGRESS: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  RESOLVED: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-transparent",
  CLOSED: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
};
export function TicketStatusBadge({ status }: { status?: TicketStatus }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge className={cn("font-medium", TICKET_STATUS_STYLES[status])}>
      {TICKET_STATUS_LABELS[status]}
    </Badge>
  );
}

const TICKET_PRIORITY_STYLES: Record<TicketPriority, string> = {
  LOW: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-transparent",
  MEDIUM: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-transparent",
  HIGH: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  CRITICAL: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
};
export function TicketPriorityBadge({ priority }: { priority?: TicketPriority }) {
  if (!priority) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge className={cn("font-medium", TICKET_PRIORITY_STYLES[priority])}>
      {TICKET_PRIORITY_LABELS[priority]}
    </Badge>
  );
}

// ── Work Order badges (status + type) — see lib/v2/enums.ts ───────────────────
const WO_STATUS_STYLES: Record<WorkOrderStatus, string> = {
  DRAFT: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-transparent",
  ASSIGNED: "bg-violet-500/15 text-violet-700 dark:text-violet-400 border-transparent",
  ON_PROGRESS: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  WAITING_APPROVAL: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-transparent",
  APPROVED: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-transparent",
  REJECTED: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
  CLOSED: "bg-green-500/15 text-green-700 dark:text-green-400 border-transparent",
};
export function WorkOrderStatusBadge({ status }: { status?: WorkOrderStatus }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge className={cn("font-medium", WO_STATUS_STYLES[status])}>{WO_STATUS_LABELS[status]}</Badge>
  );
}

const WO_TYPE_STYLES: Record<WorkOrderType, string> = {
  PREVENTIVE: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-transparent",
  CORRECTIVE: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
};
export function WorkOrderTypeBadge({ type }: { type?: WorkOrderType }) {
  if (!type) return <span className="text-muted-foreground">—</span>;
  return <Badge className={cn("font-medium", WO_TYPE_STYLES[type])}>{WO_TYPE_LABELS[type]}</Badge>;
}

export function VipBadge({ vip }: { vip: boolean }) {
  if (!vip) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge className="border-transparent bg-violet-500/15 font-medium text-violet-700 dark:text-violet-400">
      VIP
    </Badge>
  );
}

/** Boolean active/inactive (Location, Communication Media `status`). */
export function ActiveBadge({ active }: { active?: boolean }) {
  return (
    <Badge
      className={cn(
        "font-medium border-transparent",
        active
          ? "bg-green-500/15 text-green-700 dark:text-green-400"
          : "bg-muted text-muted-foreground",
      )}
    >
      {active ? "Aktif" : "Nonaktif"}
    </Badge>
  );
}
