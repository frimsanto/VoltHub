// VoltHub — Work Order operational insights (RC/LR/ES success rate + per-team).
// Consumes the backend aggregate GET /work-orders/stats/summary.
import { Radio, SignalHigh, ToggleRight, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useWorkOrderSummary,
  type ChecklistOutcome,
} from "@/features/v2/work-orders/resource";

function OutcomeCard({
  icon: Icon,
  label,
  data,
  loading,
}: {
  icon: typeof Radio;
  label: string;
  data?: ChecklistOutcome;
  loading?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Icon className="size-4" /> {label}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-20" />
      ) : (
        <>
          <div className="mt-2 text-2xl font-bold tabular-nums">{data?.successRate ?? 0}%</div>
          <div className="mt-1 flex gap-3 text-xs">
            <span className="text-green-600">Berhasil {data?.berhasil ?? 0}</span>
            <span className="text-red-600">Gagal {data?.gagal ?? 0}</span>
          </div>
        </>
      )}
    </div>
  );
}

export function WorkOrderInsights() {
  const { data, isLoading } = useWorkOrderSummary();

  return (
    <div className="mb-6 space-y-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-muted-foreground">
          Tingkat Keberhasilan Uji Remote (Laporan Akhir)
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <OutcomeCard icon={Radio} label="RC" data={data?.checklist.rc} loading={isLoading} />
          <OutcomeCard icon={SignalHigh} label="LR" data={data?.checklist.lr} loading={isLoading} />
          <OutcomeCard icon={ToggleRight} label="ES" data={data?.checklist.es} loading={isLoading} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" /> Kinerja per Tim
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (data?.byTeam.length ?? 0) === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Belum ada Work Order yang ditugaskan ke tim.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 font-medium">Tim</th>
                  <th className="py-2 text-right font-medium">Total WO</th>
                  <th className="py-2 text-right font-medium">Selesai</th>
                  <th className="py-2 text-right font-medium">Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {data?.byTeam.map((t) => (
                  <tr key={t.teamId} className="border-b border-border/50 last:border-0">
                    <td className="py-2">{t.teamName}</td>
                    <td className="py-2 text-right tabular-nums">{t.total}</td>
                    <td className="py-2 text-right tabular-nums">{t.closed}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{t.successRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
