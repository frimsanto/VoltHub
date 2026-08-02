import { createFileRoute, useNavigate, Outlet, useMatches } from "@tanstack/react-router";
import { requireV2Role, FIELD_ONLY_ROLES } from "@/lib/v2/route-guards";
import { PageHeader } from "@/components/common";
import { Section, Field, UploadZone, FormToolbar, Input, Textarea } from "@/components/FormParts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useForm, Controller } from "react-hook-form";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useState, useEffect } from "react";
import { Copy, Share2, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { isRtupp1User } from "@/lib/v2/rtupp";
import {
  WORK_RESULTS,
  WORK_RESULT_LABELS,
  CB_STATUSES,
  CB_STATUS_LABELS,
} from "@/lib/v2/enums";
import { workOrders } from "@/features/v2/work-orders/resource";
import { laporanAkhirApi } from "@/lib/api";
import { createLaporanAkhirOrQueue } from "@/lib/offline/sync";
import { uploadLaporanAkhirDocumentation } from "@/lib/api";
import { showSuccess, showSuccessAuto, showError, showWarning } from "@/lib/swal";

// IP Address validation regex
const ipRegex =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// Laporan Akhir Schema - PLN Operational Structure with detailed fields
const laporanAkhirSchema = z.object({
  // Basic Info
  tanggalSelesai: z.string().min(1, "Tanggal selesai wajib diisi"),
  jenisPekerjaan: z.string().min(1, "Jenis pekerjaan wajib diisi"),

  // Location Info
  up3: z.string().min(1, "UP3 wajib diisi"),
  rtupp: z.string().optional(),
  gardu: z.string().min(1, "Gardu wajib diisi"),

  // Technical Info
  asdu: z
    .string()
    .regex(/^\d{1,10}$/, "ASDU harus angka 1-10 digit")
    .optional()
    .or(z.literal("")),
  ipModem: z.string().regex(ipRegex, "Format IP tidak valid").optional().or(z.literal("")),
  ipRTU: z.string().regex(ipRegex, "Format IP tidak valid").optional().or(z.literal("")),
  ipSIM1: z.string().regex(ipRegex, "Format IP tidak valid").optional().or(z.literal("")),
  ipSIM2: z.string().regex(ipRegex, "Format IP tidak valid").optional().or(z.literal("")),
  ipGTWIconPlus: z.string().regex(ipRegex, "Format IP tidak valid").optional().or(z.literal("")),
  ipWAN: z.string().regex(ipRegex, "Format IP tidak valid").optional().or(z.literal("")),

  // Aset SCADA - Split into Nama and Type
  rtuNama: z.string().min(1, "Nama RTU wajib diisi"),
  rtuType: z.string().min(1, "Type RTU wajib diisi"),
  mediaNama: z.string().min(1, "Nama Media wajib diisi"),
  mediaType: z.string().min(1, "Type Media wajib diisi"),
  rectifierNama: z.string().min(1, "Nama Rectifier wajib diisi"),
  rectifierType: z.string().min(1, "Type Rectifier wajib diisi"),
  bateraiNama: z.string().min(1, "Nama Baterai wajib diisi"),
  bateraiType: z.string().min(1, "Type Baterai wajib diisi"),

  // Pekerjaan Detail
  langkahPekerjaan: z.string().min(10, "Langkah pekerjaan minimal 10 karakter"),
  hasilPekerjaan: z.string().min(5, "Hasil pekerjaan minimal 5 karakter"),

  // Catatan Perangkat - Dropdown enums
  catatanRTU: z.enum(["NORMAL", "RUSAK"]),
  catatanMedia: z.enum(["NORMAL", "RUSAK"]),
  catatanRectifier: z.enum(["NORMAL", "RUSAK"]),
  catatanBaterai: z.enum(["NORMAL", "HATI_HATI", "RUSAK"]),
  catatanLain: z.string().optional(),

  // Status - Dropdown enums
  statusSebelum: z.enum(["APPDISK", "GAGAL_RC", "OOP", "INSCAN", "BERHASIL_RC", "LAIN_LAIN"]),
  statusSesudah: z.enum(["APPDISK", "GAGAL_RC", "OOP", "INSCAN", "BERHASIL_RC", "LAIN_LAIN"]),
  statusPekerjaan: z.enum(["SELESAI", "PARSIAL", "GAGAL"]),

  // Penutup
  pengawas: z.string().min(1, "Pengawas wajib diisi"),
  pelaksana: z.string().min(1, "Pelaksana wajib diisi"),

  // Work Order link + hasil uji remote checklist (RC/LR/ES/CB) + analisis
  workOrderId: z.string().optional().nullable(),
  hasilRC: z.enum(WORK_RESULTS).optional().nullable(),
  hasilLR: z.enum(WORK_RESULTS).optional().nullable(),
  hasilES: z.enum(WORK_RESULTS).optional().nullable(),
  statusCB: z.enum(CB_STATUSES).optional().nullable(),
  penyebab: z.string().optional(),
  tindakan: z.string().optional(),
  rekomendasi: z.string().optional(),
});

type LaporanAkhirForm = z.infer<typeof laporanAkhirSchema>;

// Draft storage key
const DRAFT_KEY = "voltreport_laporan_akhir_draft";

// Helper function for default values
const getTodayDate = () => new Date().toISOString().slice(0, 10);

// Format WhatsApp message for Laporan Akhir - PLN Operational Style.
// `garduLabel` is "Penyulang" for RTUPP1 accounts, otherwise "Gardu".
function formatWhatsAppMessageLaporanAkhir(
  data: LaporanAkhirForm,
  rtuppName: string,
  garduLabel = "Gardu",
): string {
  const today = new Date();
  const tanggalFormatted = data.tanggalSelesai
    ? new Date(data.tanggalSelesai).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : today.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  // Format langkah pekerjaan as multiline list
  const langkahList = data.langkahPekerjaan
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith("-") || line.startsWith("*") ? line : `- ${line}`))
    .join("\n");

  // Format hasil pekerjaan as multiline
  const hasilList = data.hasilPekerjaan
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => (line.startsWith("-") || line.startsWith("*") ? line : `- ${line}`))
    .join("\n");

  const val = (v: string | undefined | null) => (v && v.trim() ? v : "-");

  // Format IP section
  const ipSection = [
    data.asdu && `ASDU         : ${data.asdu}`,
    data.ipModem && `IP MODEM     : ${data.ipModem}`,
    data.ipRTU && `IP RTU       : ${data.ipRTU}`,
    data.ipSIM1 && `IP SIM 1     : ${data.ipSIM1}`,
    data.ipSIM2 && `IP SIM 2     : ${data.ipSIM2}`,
    data.ipGTWIconPlus && `IP GTW ICON+ : ${data.ipGTWIconPlus}`,
    data.ipWAN && `IP WAN       : ${data.ipWAN}`,
  ]
    .filter(Boolean)
    .join("\n");

  return `*Yth. ASMAN FAS OP*

[ _${tanggalFormatted}_ ]
Laporan Pekerjaan *${val(data.jenisPekerjaan).toUpperCase()}*

UP3           : *${val(data.up3).toUpperCase()}*
${garduLabel.padEnd(13)} : *${val(data.gardu).toUpperCase()}*

-------------------------------------
_- Informasi Perangkat_

${ipSection || "-"}

-------------------------------------
_- Aset SCADA_

RTU           : *${val(data.rtuNama).toUpperCase()} ${val(data.rtuType).toUpperCase()}*
Media         : *${val(data.mediaNama).toUpperCase()} ${val(data.mediaType).toUpperCase()}*
Rectifier     : *${val(data.rectifierNama).toUpperCase()} ${val(data.rectifierType).toUpperCase()}*
Baterai       : *${val(data.bateraiNama).toUpperCase()} ${val(data.bateraiType).toUpperCase()}*

-------------------------------------
*Langkah Pekerjaan :*

${langkahList || "-"}

-------------------------------------
*Hasil Pekerjaan :*

${hasilList || "-"}

-------------------------------------
_- Catatan Perangkat_

*RTU*          : ${data.catatanRTU}
*Media*        : ${data.catatanMedia}
*Rectifier*    : ${data.catatanRectifier}
*Baterai*      : ${data.catatanBaterai}
*Catatan lain* : ${val(data.catatanLain)}

-------------------------------------
*Status ${garduLabel} sebelum* : ${data.statusSebelum.replace(/_/g, " ")}
*Status ${garduLabel} sesudah* : ${data.statusSesudah.replace(/_/g, " ")}
*Status Pekerjaan*     : ${data.statusPekerjaan}

*Pengawas*  : ${val(data.pengawas)}
*Pelaksana* : ${val(data.pelaksana)}

-------------------------------------
*Dokumentasi Pekerjaan* : Sudah Dilampirkan

Terima kasih teman-teman FASOP`;
}

export const Route = createFileRoute("/_app/laporan-akhir")({
  beforeLoad: () => requireV2Role(FIELD_ONLY_ROLES),
  // `edit=<id>` mengaktifkan mode sunting laporan yang sudah ada (dipakai dari
  // halaman History untuk laporan berstatus DRAFT/PENDING milik petugas).
  // `edit=<id>` = sunting; `wo=<id>` = buat laporan dari Work Order (prefill).
  validateSearch: (s: Record<string, unknown>): { edit?: string; wo?: string } => ({
    ...(typeof s.edit === "string" && s.edit ? { edit: s.edit } : {}),
    ...(typeof s.wo === "string" && s.wo ? { wo: s.wo } : {}),
  }),
  component: LaporanAkhir,
  head: () => ({ meta: [{ title: "Laporan Akhir — VoltHub" }] }),
});

// The API returns tanggalSelesai as a full ISO datetime (Prisma DateTime, e.g.
// "2026-06-11T00:00:00.000Z"), but the <input type="date"> and the backend
// update schema both expect a bare "YYYY-MM-DD". Slice the date part directly
// (no `new Date()` — that would shift the day across timezones).
const toDateInput = (v?: string | null): string => {
  if (!v) return getTodayDate();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(v);
  return m ? m[1] : getTodayDate();
};

// Map an existing LaporanAkhir record onto the form shape.
function toFormValues(l: import("@/lib/api/laporanAkhir").LaporanAkhir): LaporanAkhirForm {
  return {
    tanggalSelesai: toDateInput(l.tanggalSelesai),
    jenisPekerjaan: l.jenisPekerjaan ?? "",
    up3: l.up3 ?? "",
    rtupp: l.rtupp ?? "",
    gardu: l.gardu ?? "",
    asdu: l.asdu ?? "",
    ipModem: l.ipModem ?? "",
    ipRTU: l.ipRTU ?? "",
    ipSIM1: l.ipSIM1 ?? "",
    ipSIM2: l.ipSIM2 ?? "",
    ipGTWIconPlus: l.ipGTWIconPlus ?? "",
    ipWAN: l.ipWAN ?? "",
    rtuNama: l.rtuNama ?? "",
    rtuType: l.rtuType ?? "",
    mediaNama: l.mediaNama ?? "",
    mediaType: l.mediaType ?? "",
    rectifierNama: l.rectifierNama ?? "",
    rectifierType: l.rectifierType ?? "",
    bateraiNama: l.bateraiNama ?? "",
    bateraiType: l.bateraiType ?? "",
    langkahPekerjaan: l.langkahPekerjaan ?? "",
    hasilPekerjaan: l.hasilPekerjaan ?? "",
    catatanRTU: l.catatanRTU ?? "NORMAL",
    catatanMedia: l.catatanMedia ?? "NORMAL",
    catatanRectifier: l.catatanRectifier ?? "NORMAL",
    catatanBaterai: l.catatanBaterai ?? "NORMAL",
    catatanLain: l.catatanLain ?? "",
    statusSebelum: l.statusSebelum ?? "APPDISK",
    statusSesudah: l.statusSesudah ?? "APPDISK",
    statusPekerjaan: l.statusPekerjaan ?? "SELESAI",
    pengawas: l.pengawas ?? "",
    pelaksana: l.pelaksana ?? "",
    workOrderId: (l as { workOrderId?: string | null }).workOrderId ?? null,
    hasilRC: (l as { hasilRC?: LaporanAkhirForm["hasilRC"] }).hasilRC ?? null,
    hasilLR: (l as { hasilLR?: LaporanAkhirForm["hasilLR"] }).hasilLR ?? null,
    hasilES: (l as { hasilES?: LaporanAkhirForm["hasilES"] }).hasilES ?? null,
    statusCB: (l as { statusCB?: LaporanAkhirForm["statusCB"] }).statusCB ?? null,
    penyebab: (l as { penyebab?: string }).penyebab ?? "",
    tindakan: (l as { tindakan?: string }).tindakan ?? "",
    rekomendasi: (l as { rekomendasi?: string }).rekomendasi ?? "",
  };
}

function LaporanAkhir() {
  const navigate = useNavigate();
  const { edit: editId, wo: woId } = Route.useSearch();
  const isEditMode = !!editId;
  const detailMatches = useMatches();
  const showingDetail = detailMatches.some((m) => m.routeId === "/_app/laporan-akhir/$id");
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  // RTUPP1 (GIS unit) reports work on "Penyulang" rather than "Gardu".
  const isRtupp1 = isRtupp1User(currentUser);
  const garduLabel = isRtupp1 ? "Penyulang" : "Gardu";
  const [waOpen, setWaOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdLaporanId, setCreatedLaporanId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  // Separate states for 3 documentation categories
  const [loggerFiles, setLoggerFiles] = useState<File[]>([]);
  const [sldFiles, setSldFiles] = useState<File[]>([]);
  const [dokumentasiHasilFiles, setDokumentasiHasilFiles] = useState<File[]>([]);

  // Default values constant
  const defaultValues: LaporanAkhirForm = {
    tanggalSelesai: getTodayDate(),
    jenisPekerjaan: "",
    up3: "",
    rtupp: "",
    gardu: "",

    // Technical Info
    asdu: "",
    ipModem: "",
    ipRTU: "",
    ipSIM1: "",
    ipSIM2: "",
    ipGTWIconPlus: "",
    ipWAN: "",

    // Aset SCADA
    rtuNama: "",
    rtuType: "",
    mediaNama: "",
    mediaType: "",
    rectifierNama: "",
    rectifierType: "",
    bateraiNama: "",
    bateraiType: "",

    // Pekerjaan
    langkahPekerjaan: "",
    hasilPekerjaan: "",

    // Catatan Perangkat
    catatanRTU: "NORMAL",
    catatanMedia: "NORMAL",
    catatanRectifier: "NORMAL",
    catatanBaterai: "NORMAL",
    catatanLain: "",

    // Status
    statusSebelum: "APPDISK",
    statusSesudah: "APPDISK",
    statusPekerjaan: "SELESAI",

    // Penutup
    pengawas: "",
    pelaksana: "",

    // Hasil uji remote checklist + analisis
    workOrderId: null,
    hasilRC: null,
    hasilLR: null,
    hasilES: null,
    statusCB: null,
    penyebab: "",
    tindakan: "",
    rekomendasi: "",
  };

  // Load draft from localStorage (hanya untuk pembuatan baru, bukan saat edit)
  const savedDraft =
    !isEditMode && typeof window !== "undefined"
      ? JSON.parse(localStorage.getItem(DRAFT_KEY) || "null")
      : null;

  const form = useForm<LaporanAkhirForm>({
    resolver: zodResolver(laporanAkhirSchema),
    defaultValues: savedDraft || defaultValues,
  });

  // Edit mode: ambil laporan lalu isi form dengan datanya.
  const { data: editingLaporan, isLoading: isEditLoading } = useQuery({
    queryKey: ["laporan-akhir", editId],
    queryFn: () => laporanAkhirApi.getById(editId as string),
    enabled: isEditMode,
  });

  useEffect(() => {
    if (editingLaporan) {
      form.reset(toFormValues(editingLaporan));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingLaporan]);

  // Buat laporan DARI Work Order (?wo=<id>): prefill nomor WO, gardu & jenis.
  const { data: prefillWo } = workOrders.useOne(!isEditMode ? woId : undefined);
  useEffect(() => {
    if (prefillWo && !isEditMode) {
      form.setValue("workOrderId", prefillWo.id);
      if (prefillWo.location)
        form.setValue("gardu", prefillWo.location.name ?? prefillWo.location.code ?? "");
      if (prefillWo.title) form.setValue("jenisPekerjaan", prefillWo.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillWo]);

  const { watch } = form;
  const formValues = watch();

  // Autosave draft (dinonaktifkan saat mode edit)
  useEffect(() => {
    if (isEditMode) return;
    const timeout = setTimeout(() => {
      if (formValues.jenisPekerjaan || formValues.gardu) {
        setDraftStatus("saving");
        try {
          localStorage.setItem(DRAFT_KEY, JSON.stringify(formValues));
          setDraftStatus("saved");
          setTimeout(() => setDraftStatus("idle"), 2000);
        } catch {
          setDraftStatus("error");
        }
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [formValues]);

  const onSubmit = async (data: LaporanAkhirForm): Promise<void> => {
    setIsSubmitting(true);
    try {
      // Exclude optional fields that may not be in API type
      const { catatanLain, ...rest } = data;

      // The backend requires `asdu` to be 1–10 digits *when present* (no empty
      // string allowed). Drop it entirely when blank so an empty value never
      // triggers a 422; also normalise the date to YYYY-MM-DD defensively.
      const submitData = {
        ...rest,
        tanggalSelesai: toDateInput(rest.tanggalSelesai),
        ...(rest.asdu ? { asdu: rest.asdu } : { asdu: undefined }),
      };

      const totalFiles =
        loggerFiles.length + sldFiles.length + dokumentasiHasilFiles.length;

      // Mode edit: perbarui laporan yang ada (online).
      if (isEditMode && editId) {
        const updated = await laporanAkhirApi.update(editId, {
          ...submitData,
          catatanLain: catatanLain || "-",
        } as any);

        if (totalFiles > 0) {
          try {
            await uploadLaporanAkhirDocumentation(updated.id, {
              logger: loggerFiles,
              sld: sldFiles,
              dokumentasiHasil: dokumentasiHasilFiles,
            });
          } catch {
            await showWarning("Laporan diperbarui, tapi upload dokumentasi gagal");
          }
        }

        queryClient.invalidateQueries({ queryKey: ["reports"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["laporan-akhir", editId] });

        await showSuccessAuto("Laporan berhasil diperbarui", undefined, 1500);
        navigate({ to: "/history" });
        return;
      }

      const { queued, result } = await createLaporanAkhirOrQueue(
        {
          ...submitData,
          catatanLain: catatanLain || "-",
          status: "PENDING",
        } as any,
        {
          logger: loggerFiles,
          sld: sldFiles,
          dokumentasiHasil: dokumentasiHasilFiles,
        },
      );

      // Offline: tersimpan di antrian (termasuk lampiran), dikirim otomatis saat online.
      if (queued || !result) {
        localStorage.removeItem(DRAFT_KEY);
        form.reset(defaultValues);
        setLoggerFiles([]);
        setSldFiles([]);
        setDokumentasiHasilFiles([]);
        await showSuccessAuto(
          "Laporan disimpan offline",
          totalFiles > 0
            ? `${totalFiles} lampiran ikut disimpan. Semua dikirim otomatis saat online.`
            : "Akan dikirim otomatis saat koneksi tersedia.",
          2200,
        );
        navigate({ to: "/history" });
        return;
      }

      setCreatedLaporanId(result.id);

      // Upload dokumentasi by category if any
      const hasFiles =
        loggerFiles.length > 0 || sldFiles.length > 0 || dokumentasiHasilFiles.length > 0;
      if (hasFiles && result.id) {
        try {
          await uploadLaporanAkhirDocumentation(result.id, {
            logger: loggerFiles,
            sld: sldFiles,
            dokumentasiHasil: dokumentasiHasilFiles,
          });
          await showSuccessAuto("Dokumentasi berhasil diupload", undefined, 1200);
        } catch (uploadError) {
          await showWarning("Laporan tersimpan, tapi upload dokumentasi gagal");
        }
      }

      // Refresh History, Monitoring, dan Dashboard (konsisten dengan flow approve/reject)
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });

      await showSuccessAuto(
        "Laporan berhasil disubmit",
        "Data berhasil tersimpan ke database.",
        1700,
      );

      // Reset form to default values
      form.reset(defaultValues);
      setCreatedLaporanId(null);
      setLoggerFiles([]);
      setSldFiles([]);
      setDokumentasiHasilFiles([]);

      // Clear draft
      localStorage.removeItem(DRAFT_KEY);

      // Navigate to history
      navigate({ to: "/history" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Gagal membuat laporan";
      await showError("Error", message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showingDetail) return <Outlet />;

  if (isEditMode && (isEditLoading || !editingLaporan)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Memuat laporan untuk diedit...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditMode ? "Edit Laporan Akhir" : "Laporan Akhir"}
        description={
          isEditMode
            ? "Perbarui laporan yang masih menunggu validasi."
            : "Pelaporan hasil dan penyelesaian pekerjaan SCADA."
        }
        actions={
          <div className="flex items-center gap-2">
            {!isEditMode && draftStatus === "saving" && (
              <Badge variant="outline" className="border-info/40 text-info bg-info/10">
                Menyimpan draft...
              </Badge>
            )}
            {!isEditMode && draftStatus === "saved" && (
              <Badge variant="outline" className="border-success/40 text-success bg-success/10">
                Draft tersimpan
              </Badge>
            )}
            {isEditMode && (
              <Badge variant="outline" className="border-info/40 text-info bg-info/10">
                Mode Edit
              </Badge>
            )}
          </div>
        }
      />

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Section 1: Informasi Pekerjaan */}
        <Section idx={1} title="Informasi Pekerjaan">
          <Field
            label="Tanggal Selesai"
            required
            error={form.formState.errors.tanggalSelesai?.message}
          >
            <Input type="date" {...form.register("tanggalSelesai")} />
          </Field>
          <Field
            label="Jenis Pekerjaan"
            required
            full
            error={form.formState.errors.jenisPekerjaan?.message}
          >
            <Input {...form.register("jenisPekerjaan")} placeholder="" />
          </Field>
          <Field label="UP3" required error={form.formState.errors.up3?.message}>
            <Input {...form.register("up3")} placeholder="" />
          </Field>
          <Field label="RTUPP" error={form.formState.errors.rtupp?.message}>
            <Input {...form.register("rtupp")} placeholder="" />
          </Field>
          <Field
            label={garduLabel}
            required
            full
            error={
              isRtupp1
                ? form.formState.errors.gardu?.message?.replace("Gardu", "Penyulang")
                : form.formState.errors.gardu?.message
            }
          >
            <Input {...form.register("gardu")} placeholder="" />
          </Field>
        </Section>

        {/* Section 2: Informasi Perangkat */}
        <Section idx={2} title="Informasi Perangkat">
          <Field label="ASDU" error={form.formState.errors.asdu?.message}>
            <Input {...form.register("asdu")} placeholder="" inputMode="numeric" />
          </Field>
          <Field label="IP MODEM" error={form.formState.errors.ipModem?.message}>
            <Input {...form.register("ipModem")} placeholder="" />
          </Field>
          <Field label="IP RTU" error={form.formState.errors.ipRTU?.message}>
            <Input {...form.register("ipRTU")} placeholder="" />
          </Field>
          <Field label="IP SIM 1" error={form.formState.errors.ipSIM1?.message}>
            <Input {...form.register("ipSIM1")} placeholder="" />
          </Field>
          <Field label="IP SIM 2" error={form.formState.errors.ipSIM2?.message}>
            <Input {...form.register("ipSIM2")} placeholder="" />
          </Field>
          <Field label="IP GTW ICON+" error={form.formState.errors.ipGTWIconPlus?.message}>
            <Input {...form.register("ipGTWIconPlus")} placeholder="" />
          </Field>
          <Field label="IP WAN" error={form.formState.errors.ipWAN?.message}>
            <Input {...form.register("ipWAN")} placeholder="" />
          </Field>
        </Section>

        {/* Section 3: Aset SCADA */}
        <Section idx={3} title="Aset SCADA">
          <div className="col-span-full">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* RTU — kiri: nama perangkat, kanan: model */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      RTU
                    </label>
                    <Input {...form.register("rtuNama")} placeholder="" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Model
                    </label>
                    <Input {...form.register("rtuType")} placeholder="" />
                  </div>
                </div>
                {form.formState.errors.rtuNama && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.rtuNama.message}
                  </p>
                )}
              </div>

              {/* Media */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Media
                    </label>
                    <Input {...form.register("mediaNama")} placeholder="" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Model
                    </label>
                    <Input {...form.register("mediaType")} placeholder="" />
                  </div>
                </div>
                {form.formState.errors.mediaNama && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.mediaNama.message}
                  </p>
                )}
              </div>

              {/* Rectifier */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Rectifier
                    </label>
                    <Input {...form.register("rectifierNama")} placeholder="" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Model
                    </label>
                    <Input {...form.register("rectifierType")} placeholder="" />
                  </div>
                </div>
                {form.formState.errors.rectifierNama && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.rectifierNama.message}
                  </p>
                )}
              </div>

              {/* Baterai */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Baterai
                    </label>
                    <Input {...form.register("bateraiNama")} placeholder="" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Model
                    </label>
                    <Input {...form.register("bateraiType")} placeholder="" />
                  </div>
                </div>
                {form.formState.errors.bateraiNama && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.bateraiNama.message}
                  </p>
                )}
              </div>
            </div>
          </div>
        </Section>

        {/* Section 4: Detail Pekerjaan */}
        <Section idx={4} title="Detail Pekerjaan">
          <Field
            label="Langkah Pekerjaan"
            full
            required
            error={form.formState.errors.langkahPekerjaan?.message}
          >
            <Textarea {...form.register("langkahPekerjaan")} rows={6} placeholder="" />
          </Field>
          <Field
            label="Hasil Pekerjaan"
            full
            required
            error={form.formState.errors.hasilPekerjaan?.message}
          >
            <Textarea {...form.register("hasilPekerjaan")} rows={4} placeholder="" />
          </Field>
        </Section>

        {/* Section 5: Catatan Perangkat */}
        <Section idx={5} title="Catatan Perangkat">
          <Field label="RTU" required error={form.formState.errors.catatanRTU?.message}>
            <Controller
              name="catatanRTU"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kondisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">NORMAL</SelectItem>
                    <SelectItem value="RUSAK">RUSAK</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Media" required error={form.formState.errors.catatanMedia?.message}>
            <Controller
              name="catatanMedia"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kondisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">NORMAL</SelectItem>
                    <SelectItem value="RUSAK">RUSAK</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Rectifier" required error={form.formState.errors.catatanRectifier?.message}>
            <Controller
              name="catatanRectifier"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kondisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">NORMAL</SelectItem>
                    <SelectItem value="RUSAK">RUSAK</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Baterai" required error={form.formState.errors.catatanBaterai?.message}>
            <Controller
              name="catatanBaterai"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kondisi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NORMAL">NORMAL</SelectItem>
                    <SelectItem value="HATI_HATI">HATI-HATI</SelectItem>
                    <SelectItem value="RUSAK">RUSAK</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Catatan Lain" full>
            <Textarea {...form.register("catatanLain")} rows={3} />
          </Field>
        </Section>

        {/* Section 6: Status Pekerjaan */}
        <Section idx={6} title="Status Pekerjaan">
          <Field
            label={`Status ${garduLabel} Sebelum`}
            required
            error={form.formState.errors.statusSebelum?.message}
          >
            <Controller
              name="statusSebelum"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPDISK">APPDISK</SelectItem>
                    <SelectItem value="GAGAL_RC">GAGAL RC</SelectItem>
                    <SelectItem value="OOP">OOP</SelectItem>
                    <SelectItem value="INSCAN">INSCAN</SelectItem>
                    <SelectItem value="LAIN_LAIN">LAIN LAIN</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field
            label={`Status ${garduLabel} Sesudah`}
            required
            error={form.formState.errors.statusSesudah?.message}
          >
            <Controller
              name="statusSesudah"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="APPDISK">APPDISK</SelectItem>
                    <SelectItem value="GAGAL_RC">GAGAL RC</SelectItem>
                    <SelectItem value="OOP">OOP</SelectItem>
                    <SelectItem value="INSCAN">INSCAN</SelectItem>
                    <SelectItem value="BERHASIL_RC">BERHASIL RC</SelectItem>
                    <SelectItem value="LAIN_LAIN">LAIN LAIN</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field
            label="Status Pekerjaan"
            required
            error={form.formState.errors.statusPekerjaan?.message}
          >
            <Controller
              name="statusPekerjaan"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SELESAI">SELESAI</SelectItem>
                    <SelectItem value="PARSIAL">PARSIAL</SelectItem>
                    <SelectItem value="GAGAL">GAGAL</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </Section>

        {/* Section 6b: Hasil Uji Remote (RC / LR / ES / CB) + Analisis */}
        <Section idx={7} title="Hasil Uji Remote & Analisis">
          {([
            ["hasilRC", "RC"],
            ["hasilLR", "LR"],
            ["hasilES", "ES"],
          ] as const).map(([name, label]) => (
            <Field key={name} label={label}>
              <Controller
                name={name}
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih hasil" />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_RESULTS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {WORK_RESULT_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          ))}
          <Field label="Status CB">
            <Controller
              name="statusCB"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih status CB" />
                  </SelectTrigger>
                  <SelectContent>
                    {CB_STATUSES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {CB_STATUS_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          <Field label="Penyebab" full>
            <Textarea {...form.register("penyebab")} rows={2} placeholder="Penyebab gangguan…" />
          </Field>
          <Field label="Tindakan" full>
            <Textarea {...form.register("tindakan")} rows={2} placeholder="Tindakan perbaikan…" />
          </Field>
          <Field label="Rekomendasi" full>
            <Textarea {...form.register("rekomendasi")} rows={2} placeholder="Rekomendasi…" />
          </Field>
        </Section>

        {/* Section 8: Penutup */}
        <Section idx={8} title="Penutup">
          <Field label="Pengawas" required error={form.formState.errors.pengawas?.message}>
            <Input {...form.register("pengawas")} placeholder="" />
          </Field>
          <Field label="Pelaksana" required full error={form.formState.errors.pelaksana?.message}>
            <Input {...form.register("pelaksana")} placeholder="" />
          </Field>
        </Section>

        {/* Section 9: Dokumentasi & Lampiran */}
        <Section idx={9} title="Dokumentasi & Lampiran">
          {/* Logger Files - XLSX ONLY */}
          <div className="col-span-full">
            <UploadZone
              label="Logger File (XLSX)"
              testId="upload-logger"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              allowedMimeTypes={[
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              ]}
              maxFileSizeMb={25}
              onFilesSelected={(files) => {
                setLoggerFiles(files);
                console.log(`${files.length} logger file(s) selected`);
              }}
            />
          </div>

          {/* SLD Files */}
          <div className="col-span-full">
            <UploadZone
              label="Single Line Diagram (SLD)"
              testId="upload-sld"
              accept="image/jpeg,image/png,image/webp,image/jpg,application/pdf"
              allowedMimeTypes={[
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/jpg",
                "application/pdf",
              ]}
              maxFileSizeMb={25}
              onFilesSelected={(files) => {
                setSldFiles(files);
                console.log(`${files.length} SLD file(s) selected`);
              }}
            />
          </div>

          {/* Foto/Video Hasil Pekerjaan */}
          <div className="col-span-full">
            <UploadZone
              label="Foto/Video Hasil Pekerjaan"
              testId="upload-dokumentasi"
              accept="image/jpeg,image/png,image/webp,image/jpg,video/mp4,video/quicktime,video/avi,video/x-msvideo"
              allowedMimeTypes={[
                "image/jpeg",
                "image/png",
                "image/webp",
                "image/jpg",
                "video/mp4",
                "video/quicktime",
                "video/avi",
                "video/x-msvideo",
              ]}
              maxFileSizeMb={100}
              onFilesSelected={(files) => {
                setDokumentasiHasilFiles(files);
                console.log(`${files.length} dokumentasi hasil file(s) selected`);
              }}
            />
          </div>
        </Section>

        <FormToolbar
          onWa={() => setWaOpen(true)}
          onSubmit={form.handleSubmit(onSubmit)}
          isSubmitting={isSubmitting}
          submitTestId="submit-laporan-akhir"
        />

        {isSubmitting && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Menyimpan laporan...
          </div>
        )}
      </form>

      {/* WhatsApp Preview Dialog */}
      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Template WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="bg-[#e7ffdb] dark:bg-emerald-950/30 rounded-xl p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap text-foreground">
            {formatWhatsAppMessageLaporanAkhir(
              formValues,
              currentUser?.rtupp?.name || "UP2D JAKARTA",
              garduLabel,
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                navigator.clipboard?.writeText(
                  formatWhatsAppMessageLaporanAkhir(
                    formValues,
                    currentUser?.rtupp?.name || "UP2D JAKARTA",
                    garduLabel,
                  ),
                );
                await showSuccessAuto("Template disalin ke clipboard", undefined, 1000);
              }}
              className="gap-1"
            >
              <Copy className="size-4" />
              Salin
            </Button>
            <Button
              size="sm"
              onClick={() => {
                const text = encodeURIComponent(
                  formatWhatsAppMessageLaporanAkhir(
                    formValues,
                    currentUser?.rtupp?.name || "UP2D JAKARTA",
                    garduLabel,
                  ),
                );
                window.open(`https://wa.me/?text=${text}`, "_blank");
              }}
              className="gap-1 bg-green-600 hover:bg-green-700"
            >
              <Share2 className="size-4" />
              Share WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
