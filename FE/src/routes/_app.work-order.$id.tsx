import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { requireV2Role, OPS_ROLES, FIELD_ONLY_ROLES } from "@/lib/v2/route-guards";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  Loader2,
  ClipboardList,
  Clock,
  History,
  FileText,
  Play,
  Send,
  CheckCircle2,
  XCircle,
  Lock,
  RotateCcw,
  UserPlus,
  Circle,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/v2/PageHeader";
import { InfoGrid } from "@/components/v2/InfoGrid";
import {
  WorkOrderStatusBadge,
  WorkOrderTypeBadge,
  TicketPriorityBadge,
} from "@/components/v2/StatusBadge";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { useCan, useV2Role } from "@/lib/v2/rbac";
import { useAuthStore } from "@/stores/auth";
import {
  workOrders,
  useWorkOrderActivity,
  useWorkOrderTransition,
  REQUIRED_REPORT_LABELS,
  type WorkOrderResult,
  type WorkOrderFormValues,
} from "@/features/v2/work-orders/resource";
import { AssignForm, type AssignValues } from "@/features/v2/work-orders/AssignForm";
import { WorkOrderResultForm } from "@/features/v2/work-orders/WorkOrderResultForm";
import { WorkOrderForm } from "@/features/v2/work-orders/WorkOrderForm";
import { WorkOrderMobileDetail } from "@/features/v2/work-orders/WorkOrderMobileDetail";
import { inspeksiGi } from "@/features/v2/inspeksi-gi/resource";
import { harGi } from "@/features/v2/har-gi/resource";
import { inspeksiGh } from "@/features/v2/inspeksi-gh/resource";
import { harGh } from "@/features/v2/har-gh/resource";
import { inspeksiMp } from "@/features/v2/inspeksi-mp/resource";
import { harMp } from "@/features/v2/har-mp/resource";
import { WORK_RESULT_LABELS, CB_STATUS_LABELS } from "@/lib/v2/enums";
import { locationLabel } from "@/lib/utils";

const WO_VIEW_ROLES = [...OPS_ROLES, ...FIELD_ONLY_ROLES] as const;

export const Route = createFileRoute("/_app/work-order/$id")({
  beforeLoad: () => requireV2Role(WO_VIEW_ROLES),
  component: WorkOrderDetailPage,
  head: () => ({ meta: [{ title: "Detail Work Order — VoltHub" }] }),
});

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

const ACTION_LABELS: Record<string, string> = {
  CREATE: "Work Order dibuat",
  UPDATE: "Work Order diperbarui",
  STATUS_CHANGE: "Perubahan status",
  DELETE: "Work Order dihapus",
};

// Ringkasan WO: field Bay/Penyulang/Aset/Ref. SCADA tidak semua relevan
// tergantung tipe lokasi (GI/GH/GARDU=MP). "required" = selalu tampil (isi
// kosong → "—" via InfoGrid), "optional" = tampil hanya kalau ada isi,
// "hidden" = tidak dirender sama sekali.
type WoLocationType = "GI" | "GH" | "GARDU";
type VariableField = "bay" | "penyulang" | "aset" | "scada";
type FieldVisibility = "required" | "optional" | "hidden";

const WO_DETAIL_FIELDS: Record<WoLocationType, Record<VariableField, FieldVisibility>> = {
  GI: { bay: "required", penyulang: "optional", aset: "optional", scada: "optional" },
  GH: { bay: "hidden", penyulang: "required", aset: "optional", scada: "optional" },
  GARDU: { bay: "hidden", penyulang: "hidden", aset: "hidden", scada: "optional" },
};
// Tipe lokasi tak dikenal → tampilkan semua field (behavior lama).
const WO_DETAIL_FIELDS_FALLBACK: Record<VariableField, FieldVisibility> = {
  bay: "required",
  penyulang: "required",
  aset: "required",
  scada: "required",
};

const hasValue = (v: unknown) => v !== null && v !== undefined && v !== "";

const fieldRow = (
  visibility: FieldVisibility,
  label: string,
  value: ReactNode,
): { label: string; value: ReactNode }[] => {
  if (visibility === "hidden") return [];
  if (visibility === "optional" && !hasValue(value)) return [];
  return [{ label, value }];
};

function WorkOrderDetailPage() {
  const { id } = useParams({ from: "/_app/work-order/$id" });
  const navigate = useNavigate();
  const role = useV2Role();
  const canManage = useCan("workOrders.manage");
  const canExecute = useCan("workOrders.execute");
  const canCreate = useCan("workOrders.create");
  const userTeamId = useAuthStore((s) => s.user?.team?.id);

  const { data: wo, isLoading, isError, refetch } = workOrders.useOne(id);
  const activityQ = useWorkOrderActivity(id, canManage);
  // GI/RTUPP1: Laporan WO = form Inspeksi GI lengkap (152-field). Cek laporan
  // tertaut (1 WO : 1 LaporanGi) untuk memutuskan buat-baru vs edit.
  const isGi = wo?.location?.locationType === "GI";
  const isGh = wo?.location?.locationType === "GH";
  const isGardu = wo?.location?.locationType === "GARDU";
  const locationFieldLabel = isGh
    ? "Gardu Hubung"
    : isGi
      ? "Lokasi GI"
      : isGardu
        ? "Gardu MP"
        : "Lokasi";
  const fieldVisibility: Record<VariableField, FieldVisibility> = isGi
    ? WO_DETAIL_FIELDS.GI
    : isGh
      ? WO_DETAIL_FIELDS.GH
      : isGardu
        ? WO_DETAIL_FIELDS.GARDU
        : WO_DETAIL_FIELDS_FALLBACK;
  const giReportQ = inspeksiGi.useList({ workOrderId: id }, { enabled: isGi });
  const harReportQ = harGi.useList({ workOrderId: id }, { enabled: isGi });
  const inspeksiGhQ = inspeksiGh.useList({ workOrderId: id }, { enabled: isGh });
  const harGhQ = harGh.useList({ workOrderId: id }, { enabled: isGh });
  const inspeksiMpQ = inspeksiMp.useList({ workOrderId: id }, { enabled: isGardu });
  const harMpQ = harMp.useList({ workOrderId: id }, { enabled: isGardu });

  const assignM = useWorkOrderTransition("assign");
  const startM = useWorkOrderTransition("start");
  const submitM = useWorkOrderTransition("submit");
  const approveM = useWorkOrderTransition("approve");
  const rejectM = useWorkOrderTransition("reject");
  const closeM = useWorkOrderTransition("close");
  const reopenM = useWorkOrderTransition("reopen");

  const [assignOpen, setAssignOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [resultOpen, setResultOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const createM = workOrders.useCreate();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 size-5 animate-spin" /> Memuat…
      </div>
    );
  }
  if (isError || !wo) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-sm text-destructive">Gagal memuat Work Order.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  const isAssignee = !!wo.teamId && !!userTeamId && wo.teamId === userTeamId;
  const mayExecute = canManage || (canExecute && isAssignee && role === "PETUGAS");
  const busy =
    assignM.isPending ||
    startM.isPending ||
    submitM.isPending ||
    approveM.isPending ||
    rejectM.isPending ||
    closeM.isPending ||
    reopenM.isPending;

  const timeline = [
    { icon: ClipboardList, label: "Work Order dibuat", at: wo.createdAt },
    wo.startedAt ? { icon: Play, label: "Mulai dikerjakan", at: wo.startedAt } : null,
    wo.submittedAt ? { icon: Send, label: "Diajukan untuk approval", at: wo.submittedAt } : null,
    wo.approvedAt ? { icon: CheckCircle2, label: "Disetujui", at: wo.approvedAt } : null,
    wo.rejectedAt ? { icon: XCircle, label: "Ditolak", at: wo.rejectedAt } : null,
    wo.closedAt ? { icon: Lock, label: "Work Order ditutup", at: wo.closedAt } : null,
  ].filter(Boolean) as { icon: typeof Clock; label: string; at?: string | null }[];

  const linkedLaporan = [
    ...(wo.laporanAwal ?? []).map((l) => ({ ...l, jenis: "Awal" })),
    ...(wo.laporanAkhir ?? []).map((l) => ({ ...l, jenis: "Akhir" })),
  ];

  // Gerbang: Laporan Awal WO harus ada & sudah dikirim (bukan DRAFT) sebelum
  // laporan wajib (GI/HAR/Inspeksi GH/HAR GH) boleh dikerjakan.
  const laporanAwalOk = (wo.laporanAwal ?? []).some((l) => l.status !== "DRAFT");
  const requiresLaporanAwalGate = (wo.requiredReports?.length ?? 0) > 0;

  type ReportLike =
    | {
        id: string;
        status: string;
        createdAt?: string;
        validationNote?: string | null;
      }
    | undefined;

  const buildReportRow = (
    key: "INSPEKSI_GH" | "HAR_GH" | "GI" | "HAR" | "INSPEKSI_MP" | "HAR_MP",
    existing: ReportLike,
    viewTo: string,
    newTo: string,
  ) => {
    const status = existing?.status ?? null;
    const done = status === "SUBMITTED" || status === "VALIDATED";
    let statusIcon = Circle;
    let iconClassName = "text-muted-foreground";
    let subText = "Belum diisi";

    if (status === "DRAFT") {
      statusIcon = Pencil;
      iconClassName = "text-amber-500";
      subText = existing?.createdAt
        ? `Draft — terakhir diubah ${fmtDateTime(existing.createdAt)}`
        : "Draft";
    } else if (status === "SUBMITTED") {
      statusIcon = CheckCircle2;
      iconClassName = "text-blue-500";
      subText = "Menunggu approval";
    } else if (status === "VALIDATED") {
      statusIcon = CheckCircle2;
      iconClassName = "text-green-600";
      subText = "Tervalidasi";
    } else if (status === "REJECTED") {
      statusIcon = XCircle;
      iconClassName = "text-destructive";
      subText = existing?.validationNote
        ? `Ditolak: ${existing.validationNote}`
        : "Ditolak — perlu revisi";
    }

    return {
      key,
      label: REQUIRED_REPORT_LABELS[key],
      done,
      status,
      statusIcon,
      iconClassName,
      subText,
      existing,
      goTo: () =>
        navigate(
          existing
            ? { to: viewTo, params: { id: existing.id } }
            : { to: newTo, search: { wo: id } },
        ),
    };
  };

  const requiredReportRows = (wo.requiredReports ?? []).map((r) => {
    if (r === "INSPEKSI_GH") {
      return buildReportRow(
        "INSPEKSI_GH",
        inspeksiGhQ.data?.items?.[0] as ReportLike,
        "/inspeksi-gh/$id",
        "/inspeksi-gh",
      );
    }
    if (r === "HAR_GH") {
      return buildReportRow(
        "HAR_GH",
        harGhQ.data?.items?.[0] as ReportLike,
        "/har-gh/$id",
        "/har-gh",
      );
    }
    if (r === "GI") {
      return buildReportRow(
        "GI",
        giReportQ.data?.items?.[0] as ReportLike,
        "/inspeksi-gi/$id",
        "/inspeksi-gi",
      );
    }
    if (r === "INSPEKSI_MP") {
      return buildReportRow(
        "INSPEKSI_MP",
        inspeksiMpQ.data?.items?.[0] as ReportLike,
        "/inspeksi-mp/$id",
        "/inspeksi-mp",
      );
    }
    if (r === "HAR_MP") {
      return buildReportRow(
        "HAR_MP",
        harMpQ.data?.items?.[0] as ReportLike,
        "/har-mp/$id",
        "/har-mp",
      );
    }
    return buildReportRow(
      "HAR",
      harReportQ.data?.items?.[0] as ReportLike,
      "/har-gi/$id",
      "/har-gi",
    );
  });

  const allReportsSubmitted =
    requiredReportRows.length > 0 && requiredReportRows.every((r) => r.done);

  // Tombol header adalah satu-satunya pintu aksi: urutan prioritas REJECTED (revisi)
  // → DRAFT (lanjutkan) → belum diisi. Baris yang sudah done (SUBMITTED/VALIDATED)
  // dilewati — setelah satu laporan selesai, klik lagi otomatis lanjut ke berikutnya.
  const nextActionRow =
    requiredReportRows.find((r) => r.status === "REJECTED") ??
    requiredReportRows.find((r) => r.status === "DRAFT") ??
    requiredReportRows.find((r) => !r.done);
  const headerButtonLabel =
    nextActionRow?.status === "REJECTED" ? "Revisi Laporan" : "Lengkapi Laporan WO";

  return (
    <div>
      {/* Mobile (<768px) — bespoke detail screen (Screen 3), PETUGAS only. Reuses
          every value/mutation computed above; desktop below is untouched. */}
      {role === "PETUGAS" && (
        <div className="-mx-4 -mt-4 sm:-mx-6 sm:-mt-6 md:hidden">
          <WorkOrderMobileDetail
            wo={wo}
            canManage={canManage}
            canCreate={canCreate}
            mayExecute={mayExecute}
            busy={busy}
            laporanAwalOk={laporanAwalOk}
            requiresLaporanAwalGate={requiresLaporanAwalGate}
            requiredReportRows={requiredReportRows}
            headerButtonLabel={headerButtonLabel}
            nextActionRow={nextActionRow}
            timeline={timeline}
            onBack={() => navigate({ to: "/work-order" })}
            onStart={() => startM.mutate({ id })}
            onGoLaporanAwal={() => navigate({ to: "/laporan-awal", search: { wo: id } })}
            onResultOpen={() => setResultOpen(true)}
            onAssign={() => setAssignOpen(true)}
            onApprove={() => approveM.mutate({ id })}
            onReject={() => setRejectOpen(true)}
            onClose={() => closeM.mutate({ id })}
            onReopen={() => reopenM.mutate({ id })}
            onFollowUp={() => setFollowUpOpen(true)}
          />
        </div>
      )}

      <div className={role === "PETUGAS" ? "hidden md:block" : undefined}>
        <PageHeader
          title={wo.woNumber}
          description={wo.title}
          backTo="/work-order"
          actions={
            <div className="flex flex-wrap gap-2">
              {canManage && ["DRAFT", "ASSIGNED", "ON_PROGRESS"].includes(wo.status) && (
                <Button variant="outline" disabled={busy} onClick={() => setAssignOpen(true)}>
                  <UserPlus className="size-4" /> Tugaskan
                </Button>
              )}
              {mayExecute && wo.status === "ASSIGNED" && (
                <Button disabled={busy} onClick={() => startM.mutate({ id })}>
                  <Play className="size-4" /> Mulai Kerjakan
                </Button>
              )}
              {mayExecute && ["ASSIGNED", "ON_PROGRESS"].includes(wo.status) && (
                <>
                  <Button
                    variant={requiresLaporanAwalGate && !laporanAwalOk ? "default" : "outline"}
                    disabled={laporanAwalOk}
                    title={laporanAwalOk ? "Laporan Awal sudah dikirim" : undefined}
                    onClick={() => navigate({ to: "/laporan-awal", search: { wo: id } })}
                  >
                    <FileText className="size-4" /> Isi Laporan Awal
                  </Button>
                  {/* Satu-satunya pintu aksi laporan: legacy (tanpa requiredReports) → modal
                    lama; ada laporan wajib tersisa → langsung ke laporan itu (revisi/lanjut/
                    buat); semua sudah terkirim → sembunyikan (banner di kartu sudah cukup). */}
                  {requiredReportRows.length === 0 ? (
                    <Button onClick={() => setResultOpen(true)}>
                      <FileText className="size-4" /> Lengkapi Laporan WO
                    </Button>
                  ) : (
                    nextActionRow &&
                    (requiresLaporanAwalGate && !laporanAwalOk ? (
                      <Button disabled title="Isi Laporan Awal terlebih dahulu">
                        <FileText className="size-4" /> {headerButtonLabel}
                      </Button>
                    ) : role === "PETUGAS" ? (
                      <Button onClick={() => nextActionRow.goTo()}>
                        <FileText className="size-4" /> {headerButtonLabel}
                      </Button>
                    ) : (
                      // Non-PETUGAS (ADMIN via canManage): form pengisian laporan lapangan
                      // terkunci ke PETUGAS di route guard-nya. Kalau laporan sudah ada,
                      // tawarkan lihat saja; kalau belum ada laporannya, sembunyikan tombol.
                      nextActionRow.existing && (
                        <Button variant="outline" onClick={() => nextActionRow.goTo()}>
                          <FileText className="size-4" /> Lihat Laporan
                        </Button>
                      )
                    ))
                  )}
                </>
              )}
              {canManage && wo.status === "WAITING_APPROVAL" && (
                <>
                  <Button disabled={busy} onClick={() => approveM.mutate({ id })}>
                    <CheckCircle2 className="size-4" /> Setujui
                  </Button>
                  <Button
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={() => setRejectOpen(true)}
                  >
                    <XCircle className="size-4" /> Tolak
                  </Button>
                </>
              )}
              {canManage && wo.status === "APPROVED" && (
                <Button disabled={busy} onClick={() => closeM.mutate({ id })}>
                  <Lock className="size-4" /> Tutup WO
                </Button>
              )}
              {canManage && wo.status === "CLOSED" && (
                <Button variant="outline" disabled={busy} onClick={() => reopenM.mutate({ id })}>
                  <RotateCcw className="size-4" /> Buka Kembali
                </Button>
              )}
              {canCreate && wo.status === "REJECTED" && (
                <Button onClick={() => setFollowUpOpen(true)}>
                  <FileText className="size-4" /> Buat WO Lanjutan
                </Button>
              )}
            </div>
          }
        />

        {/* Laporan Wajib — inti kerja petugas. Diletakkan tepat di bawah header, sesuai
          requiredReports WO. Pembuatan Laporan GI/GH HANYA dari sini. */}
        {(wo.requiredReports?.length ?? 0) > 0 && (
          <div>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="size-4" /> Laporan Wajib
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-medium ${laporanAwalOk ? "text-green-600" : "text-amber-600"}`}
                    >
                      Laporan Awal: {laporanAwalOk ? "✓" : "belum"}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      {requiredReportRows.filter((r) => r.done).length} dari{" "}
                      {requiredReportRows.length} laporan selesai
                    </span>
                  </div>
                </div>
                {!laporanAwalOk && (
                  <p className="mt-1 text-xs text-amber-600">
                    Isi Laporan Awal terlebih dahulu sebelum mengerjakan laporan wajib.
                  </p>
                )}
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{
                      width: `${
                        requiredReportRows.length
                          ? (requiredReportRows.filter((r) => r.done).length /
                              requiredReportRows.length) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </CardHeader>
              <CardContent>
                {allReportsSubmitted && (
                  <div className="mb-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                    Semua laporan terkirim — menunggu approval Admin.
                  </div>
                )}
                <ul className="divide-y divide-border">
                  {requiredReportRows.map((row) => {
                    const StatusIcon = row.statusIcon;
                    const clickable = !!row.existing;
                    return (
                      <li
                        key={row.key}
                        className={`flex items-center gap-3 py-3 ${
                          clickable ? "cursor-pointer rounded-md px-2 -mx-2 hover:bg-muted/50" : ""
                        }`}
                        onClick={clickable ? () => row.goTo() : undefined}
                      >
                        <StatusIcon className={`mt-0.5 size-5 shrink-0 ${row.iconClassName}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{row.label}</p>
                          <p className="truncate text-xs text-muted-foreground">{row.subText}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="size-4" /> Ringkasan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <InfoGrid
                items={[
                  { label: "No. WO", value: wo.woNumber },
                  { label: "Jenis", value: <WorkOrderTypeBadge type={wo.type} /> },
                  { label: "Status", value: <WorkOrderStatusBadge status={wo.status} /> },
                  { label: "Prioritas", value: <TicketPriorityBadge priority={wo.priority} /> },
                  {
                    label: "Laporan Wajib",
                    value: wo.requiredReports?.length
                      ? wo.requiredReports.map((r) => REQUIRED_REPORT_LABELS[r]).join(", ")
                      : undefined,
                  },
                  {
                    label: locationFieldLabel,
                    value: wo.location ? (
                      <Link
                        className="text-primary hover:underline"
                        to="/gardu/$id"
                        params={{ id: wo.locationId }}
                      >
                        {locationLabel(wo.location.code, wo.location.name)}
                      </Link>
                    ) : (
                      wo.locationId
                    ),
                  },
                  ...fieldRow(fieldVisibility.bay, "Bay", wo.bay?.name),
                  ...fieldRow(fieldVisibility.penyulang, "Penyulang", wo.feeder?.feederName),
                  ...fieldRow(fieldVisibility.aset, "Aset", wo.asset?.assetName),
                  { label: "Tim Pelaksana", value: wo.team?.name },
                  { label: "Jatuh Tempo", value: fmtDateTime(wo.dueDate) },
                  ...fieldRow(fieldVisibility.scada, "Ref. SCADA", wo.scadaEventRef),
                  { label: "Deskripsi", value: wo.description },
                  ...(wo.hasilRC
                    ? [{ label: "Hasil RC", value: WORK_RESULT_LABELS[wo.hasilRC] }]
                    : []),
                  ...(wo.hasilLR
                    ? [{ label: "Hasil LR", value: WORK_RESULT_LABELS[wo.hasilLR] }]
                    : []),
                  ...(wo.hasilES
                    ? [{ label: "Hasil ES", value: WORK_RESULT_LABELS[wo.hasilES] }]
                    : []),
                  ...(wo.statusCB
                    ? [{ label: "Status CB", value: CB_STATUS_LABELS[wo.statusCB] }]
                    : []),
                  ...(wo.penyebab ? [{ label: "Penyebab", value: wo.penyebab }] : []),
                  ...(wo.tindakan ? [{ label: "Tindakan", value: wo.tindakan }] : []),
                  ...(wo.rekomendasi ? [{ label: "Rekomendasi", value: wo.rekomendasi }] : []),
                  ...(wo.revisionNote ? [{ label: "Catatan Revisi", value: wo.revisionNote }] : []),
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4" /> Timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {timeline.map((t, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                      <t.icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{fmtDateTime(t.at)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>

        {/* Laporan tertaut */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4" /> Laporan Tertaut
            </CardTitle>
          </CardHeader>
          <CardContent>
            {linkedLaporan.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Belum ada Laporan Awal/Akhir untuk Work Order ini.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {linkedLaporan.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <span>
                      <span className="font-medium">Laporan {l.jenis}</span> · {l.reportId}
                    </span>
                    <span className="text-xs text-muted-foreground">{l.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Riwayat aktivitas */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4" /> Riwayat Aktivitas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!canManage ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Riwayat aktivitas hanya tersedia untuk admin.
              </p>
            ) : activityQ.isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Memuat aktivitas…</p>
            ) : (activityQ.data?.items.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Belum ada aktivitas.</p>
            ) : (
              <ul className="divide-y divide-border">
                {activityQ.data?.items.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
                    <span className="text-sm">
                      {ACTION_LABELS[a.action] ?? a.action}
                      {a.performer?.name && (
                        <span className="text-muted-foreground"> · oleh {a.performer.name}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtDateTime(a.performedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modals — shared by desktop actions AND the mobile "more" sheet /
          bottom-CTA handlers above, so they stay outside the hidden-on-mobile
          wrapper. */}

      {/* Assign modal */}
      <EntityFormModal open={assignOpen} onOpenChange={setAssignOpen} title="Tugaskan Work Order">
        <AssignForm
          defaultValues={{ teamId: wo.teamId ?? "" }}
          submitting={assignM.isPending}
          onCancel={() => setAssignOpen(false)}
          onSubmit={(values: AssignValues) =>
            assignM.mutate(
              { id, body: { teamId: values.teamId } },
              { onSuccess: () => setAssignOpen(false) },
            )
          }
        />
      </EntityFormModal>

      {/* Laporan WO (hasil penyelesaian) modal */}
      <EntityFormModal
        open={resultOpen}
        onOpenChange={setResultOpen}
        title="Laporan WO — Hasil Penyelesaian"
      >
        <WorkOrderResultForm
          wo={wo}
          canSubmit={wo.status === "ON_PROGRESS"}
          submitting={submitM.isPending}
          onSubmitResult={(body: WorkOrderResult) =>
            submitM.mutate(
              { id, body: body as Record<string, unknown> },
              { onSuccess: () => setResultOpen(false) },
            )
          }
          onDone={() => setResultOpen(false)}
        />
      </EntityFormModal>

      {/* Reject modal */}
      <EntityFormModal open={rejectOpen} onOpenChange={setRejectOpen} title="Tolak Work Order">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Catatan Revisi</label>
            <Textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Jelaskan alasan penolakan / perbaikan yang diperlukan…"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={rejectM.isPending}
            >
              Batal
            </Button>
            <Button
              className="text-destructive-foreground"
              disabled={rejectM.isPending || !rejectNote.trim()}
              onClick={() =>
                rejectM.mutate(
                  { id, body: { revisionNote: rejectNote.trim() } },
                  {
                    onSuccess: () => {
                      setRejectOpen(false);
                      setRejectNote("");
                    },
                  },
                )
              }
            >
              {rejectM.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Tolak
            </Button>
          </div>
        </div>
      </EntityFormModal>

      {/* Buat WO Lanjutan — WO baru diprefill dari WO Tidak Sesuai ini (kunjungan ulang). */}
      <EntityFormModal
        open={followUpOpen}
        onOpenChange={setFollowUpOpen}
        title="Buat WO Lanjutan"
        className="flex max-h-[85vh] flex-col overflow-y-hidden sm:max-w-lg"
      >
        <WorkOrderForm
          submitting={createM.isPending}
          defaultValues={{
            type: wo.type,
            title: wo.title,
            description: wo.description,
            priority: wo.priority,
            locationId: wo.locationId,
            bayId: wo.bayId,
            feederId: wo.feederId,
            assetId: wo.assetId,
            teamId: wo.teamId ?? "",
            dueDate: null,
            scadaEventRef: wo.scadaEventRef,
            requiredReports: wo.requiredReports ?? [],
          }}
          onCancel={() => setFollowUpOpen(false)}
          onSubmit={(values: WorkOrderFormValues) =>
            createM.mutate(values, {
              onSuccess: (created) => {
                setFollowUpOpen(false);
                navigate({ to: "/work-order/$id", params: { id: created.id } });
              },
            })
          }
        />
      </EntityFormModal>
    </div>
  );
}
