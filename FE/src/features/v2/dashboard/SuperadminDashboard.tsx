// VoltHub — SUPERADMIN dashboard: org-wide totals + import stats + recent activity.
import { Users, Boxes, ClipboardCheck, ShieldCheck, FileText, MapPin, Radio, FileBarChart2, Upload, AlertTriangle } from "lucide-react";
import { StatCard, SectionCard, RecentList, DeviceStatusPanel } from "./widgets";
import { DonutChart, DonutLegend, BarMini } from "./charts";
import { useDashboardActivity } from "./activity";
import {
  useEntityCounts,
  useUserCount,
  useImportStats,
  useDeviceTypeCounts,
  useAssetStatusBreakdown,
} from "./api";

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

export function SuperadminDashboard() {
  const counts = useEntityCounts();
  const users = useUserCount();
  const imports = useImportStats();
  const devices = useDeviceTypeCounts();
  const assetStatus = useAssetStatusBreakdown();
  const activity = useDashboardActivity();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={Users} label="Total Users" value={users.total} loading={users.isLoading} to="/users" tone="text-violet-600 dark:text-violet-400 bg-violet-500/10" />
        <StatCard icon={Boxes} label="Total Assets" value={counts.assets} loading={counts.isLoading} to="/asset" tone="text-blue-600 dark:text-blue-400 bg-blue-500/10" />
        <StatCard icon={ClipboardCheck} label="Total Inspection" value={counts.inspections} loading={counts.isLoading} to="/inspection" tone="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10" />
        <StatCard icon={ShieldCheck} label="Total HAR" value={counts.har} loading={counts.isLoading} to="/har" tone="text-amber-600 dark:text-amber-400 bg-amber-500/10" />
        <StatCard icon={FileText} label="Total Documents" value={counts.documents} loading={counts.isLoading} to="/documents" tone="text-rose-600 dark:text-rose-400 bg-rose-500/10" />
        <StatCard icon={FileBarChart2} label="Generated Reports" value={counts.reports} loading={counts.isLoading} to="/reports" tone="text-cyan-600 dark:text-cyan-400 bg-cyan-500/10" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <SectionCard title="Asset Status" icon={Boxes}>
          <DonutChart data={assetStatus.data} />
          <DonutLegend data={assetStatus.data} />
        </SectionCard>

        <SectionCard title="Import Statistics" icon={FileBarChart2}>
          <BarMini data={imports.byStatus} />
          <div className="mt-2 flex justify-between text-sm text-muted-foreground">
            <span>Total job: <strong className="text-foreground tabular-nums">{imports.total}</strong></span>
            <span>Baris terimpor: <strong className="text-foreground tabular-nums">{imports.rowsImported}</strong></span>
          </div>
        </SectionCard>

        <SectionCard title="Recent Activity" icon={ClipboardCheck}>
          <RecentList
            items={activity.items}
            isLoading={activity.isLoading}
            empty="Belum ada aktivitas"
            render={(a) => (
              <div className="text-sm">
                <span className="font-medium">{a.user}</span> {a.action}
                <div className="text-xs text-muted-foreground">{a.entity} • {a.time}</div>
              </div>
            )}
          />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={MapPin} label="Total Locations" value={counts.locations} loading={counts.isLoading} to="/gardu" tone="text-teal-600 dark:text-teal-400 bg-teal-500/10" />
        <StatCard icon={Radio} label="Communication Media" value={counts.commMedia} loading={counts.isLoading} to="/communication-media" tone="text-indigo-600 dark:text-indigo-400 bg-indigo-500/10" />
        <StatCard icon={FileBarChart2} label="Import Jobs" value={imports.total} loading={imports.isLoading} to="/imports" tone="text-orange-600 dark:text-orange-400 bg-orange-500/10" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Upload} label="Last Import" value={imports.lastImport ? fmtDate(imports.lastImport.createdAt) : "—"} loading={imports.isLoading} to="/imports" tone="text-orange-600 dark:text-orange-400 bg-orange-500/10" />
        <StatCard icon={AlertTriangle} label="Failed Import Count" value={imports.failedCount} loading={imports.isLoading} to="/imports" tone="text-red-600 dark:text-red-400 bg-red-500/10" />
      </div>

      <SectionCard title="Device Status (Registry)" icon={Radio}>
        <DeviceStatusPanel counts={devices} isLoading={devices.isLoading} />
      </SectionCard>
    </div>
  );
}
