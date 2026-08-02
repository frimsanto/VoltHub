import { dashboardRepository, DashboardRepository } from './dashboard.repository';

/**
 * Dashboard Service — assembles the management-overview payload.
 *
 * Pure aggregation/formatting on top of the repository's single-pass query set.
 * The 14-day operations trend is bucketed here (server-side) so the client
 * receives chart-ready series and need not page through raw rows.
 */

export interface OverviewTrendPoint {
  date: string; // "10 Jun"
  inspeksi: number;
  har: number;
}

export class DashboardService {
  constructor(private readonly repo: DashboardRepository = dashboardRepository) {}

  async getOverview() {
    const a = await this.repo.getOverview();

    // `ticketByStatus` now carries WorkOrderStatus buckets (the ticket module is
    // dead); the ticketOpen/ticketClosed key names stay for the FE contract.
    // Open = WO still in flight; Closed = final. REJECTED counts as neither.
    const ticketOpen =
      (a.ticketByStatus.DRAFT ?? 0) +
      (a.ticketByStatus.ASSIGNED ?? 0) +
      (a.ticketByStatus.ON_PROGRESS ?? 0) +
      (a.ticketByStatus.WAITING_APPROVAL ?? 0);
    const ticketClosed = (a.ticketByStatus.APPROVED ?? 0) + (a.ticketByStatus.CLOSED ?? 0);

    return {
      counts: { ...a.counts, ticketOpen, ticketClosed },
      assetByStatus: a.assetByStatus,
      assetByType: a.assetByType,
      ticketByStatus: a.ticketByStatus,
      documentByType: a.documentByType,
      monthly: a.monthly,
      opsTrend: this.buildTrend(a.opsTrendRaw.inspectionDates, a.opsTrendRaw.harDates),
      import: a.import,
      criticalAssets: a.criticalAssets,
      recentInspections: a.recentInspections,
      recentHar: a.recentHar,
      generatedAt: new Date().toISOString(),
    };
  }

  /** Bucket inspection + HAR dates into an ordered 14-day series (zero-filled). */
  private buildTrend(inspectionDates: Date[], harDates: Date[]): OverviewTrendPoint[] {
    const days: { key: string; label: string }[] = [];
    const insp = new Map<string, number>();
    const har = new Map<string, number>();

    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) });
      insp.set(key, 0);
      har.set(key, 0);
    }

    const bump = (map: Map<string, number>, date: Date) => {
      const key = new Date(date).toISOString().slice(0, 10);
      if (map.has(key)) map.set(key, (map.get(key) ?? 0) + 1);
    };
    inspectionDates.forEach((d) => bump(insp, d));
    harDates.forEach((d) => bump(har, d));

    return days.map(({ key, label }) => ({ date: label, inspeksi: insp.get(key) ?? 0, har: har.get(key) ?? 0 }));
  }
}

export const dashboardService = new DashboardService();
