import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Backend sends uppercase, frontend uses capitalized
type StatusKey = "draft" | "pending" | "approved" | "rejected" | "revised" | "unknown";

// Normalize status from backend (UPPERCASE) to lowercase
function normalizeStatus(status: string | null | undefined): StatusKey {
  if (!status) return "unknown";
  const lower = status.toLowerCase();
  if (["draft", "pending", "approved", "rejected", "revised"].includes(lower)) {
    return lower as StatusKey;
  }
  // Handle legacy/selesai cases
  if (lower === "selesai") return "approved";
  return "unknown";
}

const STATUS_CONFIG: Record<StatusKey, { label: string; cls: string }> = {
  approved: { label: "Approved", cls: "bg-success/15 text-success border-success/30" },
  pending: { label: "Pending", cls: "bg-warning/15 text-amber-700 dark:text-amber-400 border-warning/40" },
  rejected: { label: "Rejected", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  revised: { label: "Revised", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30" },
  draft: { label: "Draft", cls: "bg-muted text-muted-foreground border-border" },
  unknown: { label: "Unknown", cls: "bg-muted text-muted-foreground border-border" },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const normalizedStatus = normalizeStatus(status);
  const config = STATUS_CONFIG[normalizedStatus];

  return (
    <Badge
      variant="outline"
      className={cn("font-medium rounded-md px-2 py-0.5 border", config.cls)}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current mr-1.5 inline-block",
          normalizedStatus === "approved" && "bg-green-500",
          normalizedStatus === "pending" && "bg-amber-500",
          normalizedStatus === "rejected" && "bg-red-500",
          normalizedStatus === "revised" && "bg-blue-500",
          normalizedStatus === "draft" && "bg-gray-400",
          normalizedStatus === "unknown" && "bg-gray-400",
        )}
      />
      {config.label}
    </Badge>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
