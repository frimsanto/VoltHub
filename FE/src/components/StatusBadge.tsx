// VoltHub — StatusBadge kanonik (Opsi C "PLN Corporate Bold").
// Pill status laporan/WO dengan warna semantik: hijau=disetujui/selesai,
// kuning=menunggu/proses, merah=ditolak, biru=draft/info, abu=netral.
// Untuk enum domain spesifik (aset, tiket, WO) lihat components/v2/StatusBadge.
import { cn } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  APPROVED: {
    label: "Disetujui",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  VALIDATED: {
    label: "Divalidasi",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  SELESAI: {
    label: "Selesai",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  CLOSED: {
    label: "Selesai",
    className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  },
  SUBMITTED: {
    label: "Menunggu",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  PENDING: {
    label: "Menunggu",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  WAITING_APPROVAL: {
    label: "Menunggu",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  ASSIGNED: {
    label: "Ditugaskan",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  ON_PROGRESS: {
    label: "Proses",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  },
  DRAFT: {
    label: "Draft",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  REJECTED: {
    label: "Ditolak",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  REVISED: {
    label: "Revisi",
    className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  OPEN: {
    label: "Open",
    className: "bg-muted text-muted-foreground",
  },
};

const FALLBACK = { label: "", className: "bg-muted text-muted-foreground" };

export function StatusBadge({ status, className }: { status?: string; className?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const meta = STATUS_MAP[status.toUpperCase()] ?? { ...FALLBACK, label: status };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
