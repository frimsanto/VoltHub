// VoltHub — reusable Export action for any report source.
// Drop onto a Laporan Awal/Akhir, Inspection, or HAR detail view to let the user
// generate + download a branded PDF or Excel of that record. Generation is
// versioned & recorded in the Download Center (docs/REPORT_GENERATOR.md).
import { FileDown, FileText, FileSpreadsheet, Loader2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoleGate } from "@/components/v2/RoleGate";
import { useGenerateReport, SOURCE_LABELS, type SourceType } from "./api";

interface ReportExportMenuProps {
  sourceType: SourceType;
  sourceId: string;
  /** Disable while the parent record is still loading / unsaved. */
  disabled?: boolean;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary";
  /** When false, render without the reports.generate RoleGate wrapper. */
  gated?: boolean;
}

/** Generate-and-download menu offering PDF / Excel for one source record. */
export function ReportExportMenu({
  sourceType,
  sourceId,
  disabled,
  size = "default",
  variant = "outline",
  gated = true,
}: ReportExportMenuProps) {
  const gen = useGenerateReport();
  const busy = gen.isPending;

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} disabled={disabled || busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
          Export
          <ChevronDown className="size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{SOURCE_LABELS[sourceType]}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onClick={() => gen.mutate({ sourceType, sourceId, format: "PDF" })}
        >
          <FileText className="size-4 text-red-600 dark:text-red-400" /> Unduh PDF
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={busy}
          onClick={() => gen.mutate({ sourceType, sourceId, format: "EXCEL" })}
        >
          <FileSpreadsheet className="size-4 text-green-600 dark:text-green-400" /> Unduh Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return gated ? <RoleGate capability="reports.generate">{menu}</RoleGate> : menu;
}
