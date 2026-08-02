// VoltHub — ADMIN dashboard: asset/inspection/HAR/document overviews, critical
// assets, recent inspections/HAR/imports, and device-status registry panel.
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Boxes, ClipboardCheck, ShieldCheck, FileText, AlertTriangle, Radio, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLocationOptions } from "@/features/v2/lookups";
import { AssetStatusBadge, ImportStatusBadge } from "@/components/v2/StatusBadge";
import { CHART_COLORS } from "@/lib/chart-config";
import { StatCard, SectionCard, RecentList, DeviceStatusPanel } from "./widgets";
import { Leaderboard } from "./Leaderboard";
import { DonutChart, DonutLegend, BarMini, TrendChart } from "./charts";
import {
  useEntityCounts,
  useAssetStatusBreakdown,
  useDeviceTypeCounts,
  useCriticalAssets,
  useImportStats,
  useDocumentTypeBreakdown,
  useOperationsTrend,
} from "./api";

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function AdminDashboard() {
  const counts = useEntityCounts();
  const assetStatus = useAssetStatusBreakdown();
  const devices = useDeviceTypeCounts();
  const critical = useCriticalAssets();
  const imports = useImportStats();
  const docTypes = useDocumentTypeBreakdown();
  const ops = useOperationsTrend();

  // Map locationId → gardu name so recents show the name, not the hidden code.
  const { options: locationOptions } = useLocationOptions();
  const garduName = useMemo(
    () => new Map(locationOptions.map((o) => [o.value, o.label])),
    [locationOptions],
  );

  return (
    <div className="space-y-6">
      {/* Overviews */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Boxes} label="Asset Overview" value={counts.assets} loading={counts.isLoading} to="/asset" tone="text-blue-600 dark:text-blue-400 bg-blue-500/10" />
        <StatCard icon={ClipboardCheck} label="Inspection Overview" value={counts.inspections} loading={counts.isLoading} to="/inspection" tone="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" />
        <StatCard icon={ShieldCheck} label="HAR Overview" value={counts.har} loading={counts.isLoading} to="/har" tone="text-amber-600 dark:text-amber-400 bg-amber-500/10" />
        <StatCard icon={FileText} label="Documents Overview" value={counts.documents} loading={counts.isLoading} to="/documents" tone="text-rose-600 dark:text-rose-400 bg-rose-500/10" />
      </div>

      {/* Import highlights */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={Upload}
          label="Last Import"
          value={imports.lastImport ? fmtDate(imports.lastImport.createdAt) : "—"}
          loading={imports.isLoading}
          to="/imports"
          tone="text-orange-600 dark:text-orange-400 bg-orange-500/10"
        />
        <StatCard
          icon={AlertTriangle}
          label="Failed Import Count"
          value={imports.failedCount}
          loading={imports.isLoading}
          to="/imports"
          tone="text-red-600 dark:text-red-400 bg-red-500/10"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SectionCard title="Asset Status" icon={Boxes}>
          <DonutChart data={assetStatus.data} />
          <DonutLegend data={assetStatus.data} />
        </SectionCard>

        <SectionCard title="Documents by Type" icon={FileText}>
          <BarMini data={docTypes.data} color="var(--color-chart-2)" />
        </SectionCard>

        <SectionCard
          title="Critical Assets"
          icon={AlertTriangle}
          action={<Badge variant="outline" className="text-destructive">{critical.total}</Badge>}
        >
          <RecentList
            items={critical.items.slice(0, 6)}
            isLoading={critical.isLoading}
            empty="Tidak ada aset kritis 🎉"
            render={(a) => (
              <div className="flex items-center justify-between gap-2 text-sm">
                <Link to="/asset/$id" params={{ id: a.id as string }} className="truncate font-medium text-primary hover:underline">
                  {a.assetName}
                </Link>
                <AssetStatusBadge status={a.status} />
              </div>
            )}
          />
        </SectionCard>
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Inspection Trend" icon={ClipboardCheck}>
          <TrendChart data={ops.inspTrend} series={[{ key: "Inspeksi", color: CHART_COLORS.primary, label: "Inspeksi" }]} />
        </SectionCard>
        <SectionCard title="HAR Trend" icon={ShieldCheck}>
          <TrendChart data={ops.harTrend} series={[{ key: "HAR", color: CHART_COLORS.secondary, label: "HAR" }]} />
        </SectionCard>
      </div>

      {/* Recents */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SectionCard title="Recent Inspection" icon={ClipboardCheck} action={<Link to="/inspection" className="text-xs text-primary hover:underline">Lihat semua</Link>}>
          <RecentList
            items={ops.recentInspections}
            isLoading={ops.isLoading}
            render={(i) => (
              <Link to="/inspection/$id" params={{ id: i.id as string }} className="block text-sm hover:text-primary">
                <span className="font-medium">{fmtDate(i.inspectionDate)}</span>
                <div className="text-xs text-muted-foreground">{garduName.get(i.locationId) ?? "—"} • {i._count?.findings ?? 0} temuan</div>
              </Link>
            )}
          />
        </SectionCard>

        <SectionCard title="Recent HAR" icon={ShieldCheck} action={<Link to="/har" className="text-xs text-primary hover:underline">Lihat semua</Link>}>
          <RecentList
            items={ops.recentHar}
            isLoading={ops.isLoading}
            render={(h) => (
              <Link to="/har/$id" params={{ id: h.id as string }} className="block text-sm hover:text-primary">
                <span className="font-medium">{fmtDate(h.reportDate)}</span>
                <div className="text-xs text-muted-foreground">{garduName.get(h.locationId) ?? "—"} • {h._count?.details ?? 0} detail</div>
              </Link>
            )}
          />
        </SectionCard>

        <SectionCard title="Recent Imports" icon={Upload} action={<Link to="/imports" className="text-xs text-primary hover:underline">Lihat semua</Link>}>
          <RecentList
            items={imports.recent}
            isLoading={imports.isLoading}
            render={(j) => (
              <Link to="/imports/$id" params={{ id: j.id as string }} className="flex items-center justify-between gap-2 text-sm hover:text-primary">
                <span className="truncate">{j.fileName}</span>
                <ImportStatusBadge status={j.status} />
              </Link>
            )}
          />
        </SectionCard>
      </div>

      <SectionCard title="Device Status (Registry)" icon={Radio}>
        <DeviceStatusPanel counts={devices} isLoading={devices.isLoading} />
      </SectionCard>

      {/* Achievement/Leaderboard tim — ranking aktivitas bulanan per RTUPP */}
      <Leaderboard />
    </div>
  );
}
