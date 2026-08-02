import { createFileRoute, useNavigate, Outlet, useMatches } from "@tanstack/react-router";
import { requireV2Role, FIELD_ONLY_ROLES } from "@/lib/v2/route-guards";
import { PageHeader } from "@/components/common";
import { Section, Field, UploadZone, FormToolbar, Input, Textarea } from "@/components/FormParts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { laporanAwalApi, type PersonilSnapshot } from "@/lib/api";
import { createLaporanAwalOrQueue } from "@/lib/offline/sync";
import { uploadDocumentationAllInOne } from "@/lib/api/upload";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { getPersonil } from "@/lib/api/personil";
import { Loader2, Copy, Share2, X, Plus, Users, MapPin } from "lucide-react";
import { getCurrentPosition, formatCoords } from "@/lib/native/geolocation";
import { useAuthStore } from "@/stores/auth";
import { isRtupp1User } from "@/lib/v2/rtupp";
import { CHECKLIST_CONDITIONS, CHECKLIST_CONDITION_LABELS } from "@/lib/v2/enums";
import { workOrders } from "@/features/v2/work-orders/resource";
import { cn } from "@/lib/utils";
import Swal from "sweetalert2";
import axios from "axios";
import { showSuccess, showSuccessAuto, showError, showWarning } from "@/lib/swal";

// Safety checklist schema
const safetyCheckSchema = z.object({
  wpJsahirarcSop: z.boolean().default(false),
  kondisiPersonil: z.enum(["SEHAT", "KURANG_SEHAT", "BUTUH_PERHATIAN"]),
  potensiBahayaDijelaskan: z.boolean().default(false),
  apdLengkap: z.boolean().default(false),
  asuransiKetenagakerjaan: z.boolean().default(false),
  berdoaSebelumBekerja: z.boolean().default(false),
});

// Personil Snapshot schema
const personilSnapshotSchema = z.object({
  personilId: z.string(),
  nama: z.string(),
  jabatan: z.string().optional(),
  rtuppId: z.string(),
  rtuppName: z.string(),
});

// Laporan Awal Schema - PLN Operational Structure with Personil Snapshot
const laporanAwalSchema = z.object({
  // Informasi Pekerjaan
  hari: z.string().min(1, "Hari wajib diisi"),
  tanggal: z.string().min(1, "Tanggal wajib diisi"),
  nomorSPJ: z.string().min(1, "Nomor SPJ wajib diisi"),
  up3: z.string().min(1, "UP3 wajib diisi"),
  pekerjaan: z.string().min(5, "Pekerjaan minimal 5 karakter"),
  lokasiGardu: z.string().min(1, "Lokasi gardu wajib diisi"),

  // Team Info (auto from login)
  rtuppId: z.string().optional(),
  teamId: z.string().optional(),

  // Supervisors
  pengawasPekerjaan: z.string().optional(),
  pengawasManuver: z.string().optional(),
  pengawasK3: z.string().optional(),

  // Working Permit
  nomorWP: z.string().optional(),

  // Personil Snapshot (Audit trail - stores personil data at time of report)
  personilSnapshot: z.array(personilSnapshotSchema).optional(),

  // Safety Checklist
  safety: safetyCheckSchema,

  // Additional Safety Fields (legacy compatibility)
  potensiBahaya: z.string().optional(),
  pengendalianRisiko: z.string().optional(),
  apd: z.string().optional(),
  rambuKerja: z.string().optional(),
  asuransiTK: z.string().optional(),

  // Work Order link + kondisi perangkat checklist (Relay/RC/LR/ES/CB)
  workOrderId: z.string().optional().nullable(),
  cekRelay: z.enum(CHECKLIST_CONDITIONS).optional().nullable(),
  cekRC: z.enum(CHECKLIST_CONDITIONS).optional().nullable(),
  cekLR: z.enum(CHECKLIST_CONDITIONS).optional().nullable(),
  cekES: z.enum(CHECKLIST_CONDITIONS).optional().nullable(),
  cekStatusCB: z.enum(CHECKLIST_CONDITIONS).optional().nullable(),
});

type LaporanAwalForm = z.infer<typeof laporanAwalSchema>;

// Draft storage key
const DRAFT_KEY = "voltreport_laporan_awal_draft";

// Helper functions for default values
const getTodayName = () => new Date().toLocaleDateString("id-ID", { weekday: "long" });
const getTodayDate = () => new Date().toISOString().slice(0, 10);

export const Route = createFileRoute("/_app/laporan-awal")({
  beforeLoad: () => requireV2Role(FIELD_ONLY_ROLES),
  // `edit=<id>` mengaktifkan mode sunting laporan yang sudah ada (dipakai dari
  // halaman History untuk laporan berstatus DRAFT/PENDING milik petugas).
  // `edit=<id>` = sunting; `wo=<id>` = buat laporan dari Work Order (prefill).
  validateSearch: (s: Record<string, unknown>): { edit?: string; wo?: string } => ({
    ...(typeof s.edit === "string" && s.edit ? { edit: s.edit } : {}),
    ...(typeof s.wo === "string" && s.wo ? { wo: s.wo } : {}),
  }),
  component: LaporanAwal,
  head: () => ({ meta: [{ title: "Laporan Awal — VoltHub" }] }),
});

// Format WhatsApp message - Clean formatting, no emojis
function formatWhatsAppMessage(data: LaporanAwalForm, rtuppName: string, teamName: string): string {
  const today = new Date();
  const hari = (data.hari || today.toLocaleDateString("id-ID", { weekday: "long" })).toUpperCase();
  const tanggal = data.tanggal
    ? new Date(data.tanggal).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : today.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  const kondisiMap: Record<string, string> = {
    SEHAT: "Sehat",
    KURANG_SEHAT: "Kurang Sehat",
    BUTUH_PERHATIAN: "Butuh Perhatian",
  };

  // Format personil list vertically with asterisk
  const personilList = data.personilSnapshot?.map((p) => `  * ${p.nama}`).join("\n") || "  * -";
  const jumlahPersonil = data.personilSnapshot?.length || 0;

  // Helper to get value or dash
  const val = (v: string | undefined | null) => (v && v.trim() ? v : "-");
  const yesNo = (v: boolean | undefined) => (v ? "Sudah" : "Belum");
  const yesNoAda = (v: boolean | undefined) => (v ? "Ada" : "Belum");

  return `*Yth. MB Fasop*

*Laporan Pelaksanaan Pekerjaan*
-------------------------------------------------------------
*${val(rtuppName).toUpperCase()}*

- *Hari* : ${hari}
- *Tanggal* : ${tanggal}
- *Pelaksana* : ${val(teamName)}
- *Nomor SPJ* : ${val(data.nomorSPJ)}
- *Pekerjaan* : ${val(data.pekerjaan)}
- *Lokasi* : ${val(data.lokasiGardu)}

- *Penanggung Jawab Pekerjaan* : ${val(data.pengawasPekerjaan)}
- *Pengawas Pekerjaan* : ${val(data.pengawasPekerjaan)}
- *Pengawas Manuver* : ${val(data.pengawasManuver)}
- *Pengawas K3* : ${val(data.pengawasK3)}

- *No. WP* : ${val(data.nomorWP)}
- *Wp, Jsa, Hirarc, Sop* : ${yesNoAda(data.safety?.wpJsahirarcSop)}

- *Jumlah Pelaksana* : ${jumlahPersonil} Personil

- *Personil Bertugas* :
${personilList}

- *Kondisi* : ${kondisiMap[data.safety?.kondisiPersonil || "SEHAT"]}
- *Sudah Dijelaskan Potensi Bahaya & Pengendalian* : ${yesNo(data.safety?.potensiBahayaDijelaskan)}
- *Peralatan Kerja, Rambu & APD* : ${data.safety?.apdLengkap ? "Lengkap" : "Belum Lengkap"}
- *Asuransi Ketenagakerjaan* : ${data.safety?.asuransiKetenagakerjaan ? "BPJS" : "-"}
- *Berdo'a Sebelum Bekerja* : ${yesNo(data.safety?.berdoaSebelumBekerja)}

- *Foto2 Sebelum Dimulai & Dlm Pekerjaan* : ${yesNo(data.safety?.wpJsahirarcSop)}

Terima Kasih.

*Love Family Do Safety*
*ZERO4LOSS*`;
}

// Map an existing LaporanAwal record onto the form shape (nested `safety`).
function toFormValues(l: import("@/lib/api/laporanAwal").LaporanAwal): LaporanAwalForm {
  return {
    hari: l.hari ?? getTodayName(),
    tanggal: l.tanggal ?? getTodayDate(),
    nomorSPJ: l.nomorSPJ ?? "",
    up3: l.up3 ?? "",
    pekerjaan: l.pekerjaan ?? "",
    lokasiGardu: l.lokasiGardu ?? "",
    rtuppId: l.rtuppId ?? "",
    teamId: l.teamId ?? "",
    pengawasPekerjaan: l.pengawasPekerjaan ?? "",
    pengawasManuver: l.pengawasManuver ?? "",
    pengawasK3: l.pengawasK3 ?? "",
    nomorWP: l.nomorWP ?? "",
    personilSnapshot: l.personilSnapshot ?? [],
    safety: {
      wpJsahirarcSop: l.wpJsahirarcSop ?? false,
      kondisiPersonil: l.kondisiPersonil ?? "SEHAT",
      potensiBahayaDijelaskan: l.potensiBahayaDijelaskan ?? false,
      apdLengkap: l.apdLengkap ?? false,
      asuransiKetenagakerjaan: l.asuransiKetenagakerjaan ?? false,
      berdoaSebelumBekerja: l.berdoaSebelumBekerja ?? false,
    },
    potensiBahaya: l.potensiBahaya ?? "",
    pengendalianRisiko: l.pengendalianRisiko ?? "",
    apd: l.apd ?? "",
    rambuKerja: l.rambuKerja ?? "",
    asuransiTK: l.asuransiTK ?? "",
    workOrderId: (l as { workOrderId?: string | null }).workOrderId ?? null,
    cekRelay: (l as { cekRelay?: LaporanAwalForm["cekRelay"] }).cekRelay ?? null,
    cekRC: (l as { cekRC?: LaporanAwalForm["cekRC"] }).cekRC ?? null,
    cekLR: (l as { cekLR?: LaporanAwalForm["cekLR"] }).cekLR ?? null,
    cekES: (l as { cekES?: LaporanAwalForm["cekES"] }).cekES ?? null,
    cekStatusCB: (l as { cekStatusCB?: LaporanAwalForm["cekStatusCB"] }).cekStatusCB ?? null,
  };
}

function LaporanAwal() {
  const navigate = useNavigate();
  const { edit: editId, wo: woId } = Route.useSearch();
  const isEditMode = !!editId;
  const detailMatches = useMatches();
  const showingDetail = detailMatches.some((m) => m.routeId === "/_app/laporan-awal/$id");
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  // RTUPP1 (GIS unit) reports a "Lokasi GI" rather than a "Lokasi Gardu".
  const isRtupp1 = isRtupp1User(currentUser);
  const lokasiLabel = isRtupp1 ? "Lokasi GI" : "Lokasi Gardu";
  const [waOpen, setWaOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdLaporanId, setCreatedLaporanId] = useState<string | null>(null);
  const [dokumentasiFiles, setDokumentasiFiles] = useState<File[]>([]);
  const [personilSearch, setPersonilSearch] = useState("");
  const [personilOpen, setPersonilOpen] = useState(false);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Default values constant
  const defaultValues: LaporanAwalForm = {
    hari: getTodayName(),
    tanggal: getTodayDate(),
    nomorSPJ: "",
    up3: "",
    pekerjaan: "",
    lokasiGardu: "",
    rtuppId: currentUser?.rtupp?.id || "",
    teamId: currentUser?.team?.id || "",
    pengawasPekerjaan: "",
    pengawasManuver: "",
    pengawasK3: "",
    nomorWP: "",
    personilSnapshot: [],
    safety: {
      wpJsahirarcSop: false,
      kondisiPersonil: "SEHAT",
      potensiBahayaDijelaskan: false,
      apdLengkap: false,
      asuransiKetenagakerjaan: false,
      berdoaSebelumBekerja: false,
    },
    potensiBahaya: "",
    pengendalianRisiko: "",
    apd: "",
    rambuKerja: "",
    asuransiTK: "",
  };

  // Load draft from localStorage on mount
  const loadDraft = useCallback(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      console.error("Failed to load draft");
    }
    return null;
  }, []);

  // Draft localStorage hanya untuk pembuatan baru — jangan dipakai saat menyunting.
  const savedDraft = isEditMode ? null : loadDraft();

  const form = useForm<LaporanAwalForm>({
    resolver: zodResolver(laporanAwalSchema) as any,
    defaultValues: savedDraft || defaultValues,
  });

  // Edit mode: ambil laporan lalu isi form dengan datanya.
  const { data: editingLaporan, isLoading: isEditLoading } = useQuery({
    queryKey: ["laporan-awal", editId],
    queryFn: () => laporanAwalApi.getById(editId as string),
    enabled: isEditMode,
  });

  useEffect(() => {
    if (editingLaporan) {
      form.reset(toFormValues(editingLaporan));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingLaporan]);

  // Buat laporan DARI Work Order (?wo=<id>): prefill nomor WO, lokasi GI & UP3.
  const { data: prefillWo } = workOrders.useOne(!isEditMode ? woId : undefined);
  useEffect(() => {
    if (prefillWo && !isEditMode) {
      form.setValue("workOrderId", prefillWo.id);
      if (prefillWo.location)
        form.setValue("lokasiGardu", prefillWo.location.name ?? prefillWo.location.code ?? "");
      if (prefillWo.title) form.setValue("pekerjaan", prefillWo.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillWo]);

  const { watch, setValue } = form;
  const formValues = watch();
  const personilSnapshot = watch("personilSnapshot") || [];
  const [gpsLoading, setGpsLoading] = useState(false);

  async function handleAmbilLokasi() {
    setGpsLoading(true);
    try {
      const coords = await getCurrentPosition();
      const current = (form.getValues("lokasiGardu") || "").replace(/\s*\[GPS:[^\]]*\]/, "").trim();
      setValue("lokasiGardu", `${current} [GPS: ${formatCoords(coords)}]`.trim(), {
        shouldValidate: true,
      });
    } catch (err) {
      showError("Gagal ambil lokasi", err instanceof Error ? err.message : "Coba lagi");
    } finally {
      setGpsLoading(false);
    }
  }

  // Autosave draft (dinonaktifkan saat mode edit agar tak menimpa draft pembuatan)
  useEffect(() => {
    if (isEditMode) return;
    const timeout = setTimeout(() => {
      if (formValues.nomorSPJ || formValues.pekerjaan) {
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

  // Add personil to snapshot (from master personil data)
  const addPersonilToSnapshot = (personil: { id: string; nama: string; jabatan?: string }) => {
    if (!personilSnapshot.find((p) => p.personilId === personil.id)) {
      const newSnapshot: PersonilSnapshot = {
        personilId: personil.id,
        nama: personil.nama,
        jabatan: personil.jabatan,
        rtuppId: currentUser?.rtupp?.id || "",
        rtuppName: currentUser?.rtupp?.name || "",
      };
      setValue("personilSnapshot", [...personilSnapshot, newSnapshot]);
    }
    setPersonilSearch("");
  };

  const removePersonilFromSnapshot = (personilId: string) => {
    setValue(
      "personilSnapshot",
      personilSnapshot.filter((p) => p.personilId !== personilId),
    );
  };

  // Master personil from backend, scoped to the petugas' RTUPP (active only).
  const rtuppId = currentUser?.rtupp?.id;
  const { data: personilMaster = [], isLoading: isPersonilLoading } = useQuery({
    queryKey: ["personil", rtuppId],
    queryFn: () => getPersonil({ rtuppId, isActive: true }),
    enabled: !!rtuppId,
  });

  const filteredPersonil = personilMaster.filter(
    (p) =>
      p.nama.toLowerCase().includes(personilSearch.toLowerCase()) &&
      !personilSnapshot.find((sp) => sp.personilId === p.id),
  );

  const onSubmit = async (data: LaporanAwalForm) => {
    setIsSubmitting(true);

    try {
      const submitData = {
        hari: data.hari,
        tanggal: data.tanggal,
        nomorSPJ: data.nomorSPJ || "-",
        up3: data.up3,
        pekerjaan: data.pekerjaan,
        lokasiGardu: data.lokasiGardu,

        pelaksana: currentUser?.team?.name || "Petugas PLN",
        penanggungJawab: data.pengawasPekerjaan || currentUser?.name || "Pengawas PLN",

        pengawasPekerjaan: data.pengawasPekerjaan || "",
        pengawasManuver: data.pengawasManuver || "",
        pengawasK3: data.pengawasK3 || "",
        nomorWP: data.nomorWP || "",

        potensiBahaya: data.potensiBahaya || "-",
        pengendalianRisiko: data.pengendalianRisiko || "-",
        apd: data.apd || "LENGKAP",
        rambuKerja: data.rambuKerja || "ADA",
        asuransiTK: data.asuransiTK || "BPJS",

        // Safety Checklist (K3) — persisted server-side
        wpJsahirarcSop: data.safety?.wpJsahirarcSop ?? false,
        kondisiPersonil: data.safety?.kondisiPersonil ?? "SEHAT",
        potensiBahayaDijelaskan: data.safety?.potensiBahayaDijelaskan ?? false,
        apdLengkap: data.safety?.apdLengkap ?? false,
        asuransiKetenagakerjaan: data.safety?.asuransiKetenagakerjaan ?? false,
        berdoaSebelumBekerja: data.safety?.berdoaSebelumBekerja ?? false,

        // Personil Snapshot (audit trail) + count
        personilSnapshot: data.personilSnapshot ?? [],
        jumlahPersonil: data.personilSnapshot?.length ?? 0,

        // Work Order link + kondisi perangkat checklist
        workOrderId: data.workOrderId || null,
        cekRelay: data.cekRelay || null,
        cekRC: data.cekRC || null,
        cekLR: data.cekLR || null,
        cekES: data.cekES || null,
        cekStatusCB: data.cekStatusCB || null,

        status: "PENDING" as const,
      };

      // Mode edit: perbarui laporan yang ada (online). Status PENDING/DRAFT
      // dijaga di backend; field selain status diperbarui.
      if (isEditMode && editId) {
        const updated = await laporanAwalApi.update(editId, submitData as any);

        if (dokumentasiFiles.length > 0) {
          try {
            await uploadDocumentationAllInOne("laporan-awal", updated.id, dokumentasiFiles);
          } catch {
            await showWarning("Laporan diperbarui, tapi upload dokumentasi gagal");
          }
        }

        queryClient.invalidateQueries({ queryKey: ["reports"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["laporan-awal", editId] });

        await showSuccessAuto("Laporan berhasil diperbarui", undefined, 1500);
        navigate({ to: "/history" });
        return;
      }

      const { queued, result } = await createLaporanAwalOrQueue(
        submitData as any,
        dokumentasiFiles,
      );

      // Offline: tersimpan di antrian (termasuk foto), dikirim otomatis saat online.
      if (queued || !result) {
        localStorage.removeItem(DRAFT_KEY);
        form.reset(defaultValues);
        setDokumentasiFiles([]);
        setValue("personilSnapshot", []);
        await showSuccessAuto(
          "Laporan disimpan offline",
          dokumentasiFiles.length > 0
            ? `${dokumentasiFiles.length} lampiran ikut disimpan. Semua dikirim otomatis saat online.`
            : "Akan dikirim otomatis saat koneksi tersedia.",
          2200,
        );
        navigate({ to: "/history" });
        return;
      }

      // Simpan ID laporan yang baru dibuat agar upload memakai ID yang benar
      setCreatedLaporanId(result.id);

      // Upload dokumentasi setelah laporan berhasil dibuat (pakai result.id)
      if (dokumentasiFiles.length > 0 && result.id) {
        try {
          await uploadDocumentationAllInOne("laporan-awal", result.id, dokumentasiFiles);
          await showSuccessAuto("Dokumentasi berhasil diupload", undefined, 1200);
        } catch (uploadError) {
          await showWarning("Laporan tersimpan, tapi upload dokumentasi gagal");
        }
      }

      localStorage.removeItem(DRAFT_KEY);

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
      setDokumentasiFiles([]);
      setValue("personilSnapshot", []);

      navigate({ to: "/history" });
    } catch (error) {
      console.error("SUBMIT ERROR:", error);

      let message = "Gagal submit laporan";

      if (axios.isAxiosError(error)) {
        const data = error.response?.data;

        if (data?.errors && Array.isArray(data.errors)) {
          message = data.errors
            .map((e: any) => `${e.path?.join(".") || "field"}: ${e.message}`)
            .join("\n");
        } else {
          message = data?.message || error.message;
        }
      } else if (error instanceof Error) {
        message = error.message;
      }

      await Swal.fire({
        icon: "error",
        title: "Gagal Submit",
        text: message,
        confirmButtonColor: "#d33",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const onInvalid = async (errors: any) => {
    console.log("VALIDATION ERROR LAPORAN AWAL:", errors);

    const firstError = Object.values(errors)?.[0] as any;

    await Swal.fire({
      icon: "warning",
      title: "Form Belum Lengkap",
      text:
        firstError?.message ||
        "Ada data yang belum valid. Cek kembali Nomor WP, Personil, RTUPP, Team, atau checklist keselamatan.",
      confirmButtonColor: "#0052A3",
    });
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
        title={isEditMode ? "Edit Laporan Awal" : "Laporan Awal"}
        description={
          isEditMode
            ? "Perbarui laporan yang masih menunggu validasi."
            : "Form pelaporan kegiatan sebelum pekerjaan dimulai."
        }
        actions={
          <div className="flex items-center gap-2">
            {!isEditMode && draftStatus !== "idle" && (
              <Badge
                variant="outline"
                className={cn(
                  "text-xs border-transparent font-medium",
                  draftStatus === "saving" && "bg-blue-500/15 text-blue-700 dark:text-blue-400",
                  draftStatus === "saved" && "bg-green-500/15 text-green-700 dark:text-green-400",
                  draftStatus === "error" && "bg-red-500/15 text-red-700 dark:text-red-400",
                )}
              >
                {draftStatus === "saving" && "Menyimpan..."}
                {draftStatus === "saved" && "Tersimpan"}
                {draftStatus === "error" && "Gagal menyimpan"}
              </Badge>
            )}
            <Badge
              variant="outline"
              className={cn(
                isEditMode
                  ? "border-info/40 text-info bg-info/10"
                  : "border-warning/40 text-warning bg-warning/10",
              )}
            >
              {isEditMode ? "Mode Edit" : "Draft"}
            </Badge>
          </div>
        }
      />

      <form onSubmit={form.handleSubmit(onSubmit as any)} className="space-y-6">
        <Section idx={1} title="Informasi Pekerjaan">
          <Field label="Hari" required>
            <Input {...form.register("hari")} readOnly />
          </Field>
          <Field label="Tanggal" required>
            <Input type="date" {...form.register("tanggal")} />
          </Field>
          <Field label="Nomor SPJ" required error={form.formState.errors.nomorSPJ?.message}>
            <Input {...form.register("nomorSPJ")} placeholder="" />
          </Field>
          <Field label="UP3" required error={form.formState.errors.up3?.message}>
            <Input {...form.register("up3")} placeholder="" />
          </Field>
          <Field label="Pekerjaan" required full error={form.formState.errors.pekerjaan?.message}>
            <Input {...form.register("pekerjaan")} placeholder="" />
          </Field>
          <Field
            label={lokasiLabel}
            required
            full
            error={
              isRtupp1
                ? form.formState.errors.lokasiGardu?.message?.replace("Lokasi gardu", "Lokasi GI")
                : form.formState.errors.lokasiGardu?.message
            }
          >
            <div className="flex gap-2">
              <Input {...form.register("lokasiGardu")} placeholder="" className="flex-1" />
              <Button
                type="button"
                variant="outline"
                onClick={handleAmbilLokasi}
                disabled={gpsLoading}
                title="Ambil koordinat GPS"
              >
                {gpsLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <MapPin className="size-4" />
                )}
                <span className="ml-1 hidden sm:inline">Lokasi</span>
              </Button>
            </div>
          </Field>
        </Section>

        {/* Informasi Tim - Auto dari Login */}
        <Section idx={2} title="Informasi Tim">
          <Field label="RTUPP">
            <Input
              value={currentUser?.rtupp?.name || "-"}
              readOnly
              className="bg-muted text-foreground"
            />
          </Field>
          <Field label="Team Bertugas">
            <Input
              value={currentUser?.team?.name || "-"}
              readOnly
              className="bg-muted text-foreground"
            />
          </Field>
        </Section>

        <Section idx={3} title="Tim Pelaksana">
          <Field label="Pengawas Pekerjaan">
            <Input {...form.register("pengawasPekerjaan")} placeholder="" />
          </Field>
          <Field label="Pengawas Manuver">
            <Input {...form.register("pengawasManuver")} placeholder="" />
          </Field>
          <Field label="Pengawas K3">
            <Input {...form.register("pengawasK3")} placeholder="" />
          </Field>
          <Field label="Nomor WP" required error={form.formState.errors.nomorWP?.message}>
            <Input {...form.register("nomorWP")} placeholder="" />
          </Field>

          {/* Personil Bertugas Hari Ini - Multi-select dengan Snapshot */}
          <Field
            label="Personil Bertugas Hari Ini"
            full
            required
            error={form.formState.errors.personilSnapshot?.message}
          >
            <div className="space-y-3">
              {/* Selected personil chips */}
              <div className="flex flex-wrap gap-2">
                {personilSnapshot.length === 0 && (
                  <span className="text-sm text-muted-foreground italic">
                    Belum ada personil dipilih
                  </span>
                )}
                {personilSnapshot.map((p) => (
                  <div
                    key={p.personilId}
                    data-testid="personil-chip"
                    className="flex items-center gap-1 px-2 py-1 bg-primary/10 rounded-md text-sm"
                  >
                    <span>{p.nama}</span>
                    {p.jabatan && (
                      <span className="text-xs text-muted-foreground">({p.jabatan})</span>
                    )}
                    <button
                      type="button"
                      data-testid="personil-remove"
                      onClick={() => removePersonilFromSnapshot(p.personilId)}
                      className="text-muted-foreground hover:text-destructive ml-1"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add personil section */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground" data-testid="personil-count">
                  Jumlah: <strong>{personilSnapshot.length}</strong> personil
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="personil-add"
                  onClick={() => setPersonilOpen(true)}
                  className="gap-1"
                >
                  <Plus className="size-4" />
                  Tambah Personil
                </Button>
              </div>

              {/* Personil search dropdown */}
              {personilOpen && (
                <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <Input
                    placeholder="Cari personil..."
                    value={personilSearch}
                    onChange={(e) => setPersonilSearch(e.target.value)}
                    className="h-9"
                  />
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {isPersonilLoading ? (
                      <p className="text-sm text-muted-foreground text-center py-2 flex items-center justify-center gap-2">
                        <Loader2 className="size-4 animate-spin" /> Memuat personil...
                      </p>
                    ) : !rtuppId ? (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Akun Anda belum terhubung ke RTUPP
                      </p>
                    ) : filteredPersonil.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        {personilSearch
                          ? "Tidak ditemukan"
                          : personilMaster.length === 0
                            ? "Belum ada master personil untuk RTUPP ini"
                            : "Ketik untuk mencari"}
                      </p>
                    ) : (
                      filteredPersonil.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          data-testid="personil-option"
                          onClick={() => {
                            addPersonilToSnapshot(p);
                            setPersonilOpen(false);
                          }}
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-primary/10 rounded"
                        >
                          <span>{p.nama}</span>
                          {p.jabatan && (
                            <span className="text-xs text-muted-foreground ml-2">
                              ({p.jabatan})
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPersonilOpen(false)}
                    className="w-full"
                  >
                    Tutup
                  </Button>
                </div>
              )}
            </div>
          </Field>
        </Section>

        <Section idx={4} title="Safety Checklist">
          <Field label="WP/JSA/HIRARC/SOP" full>
            <Controller
              name="safety.wpJsahirarcSop"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} id="wp-jsa" />
                  <label htmlFor="wp-jsa" className="text-sm cursor-pointer">
                    Dokumen WP, JSA, HIRARC, dan SOP sudah lengkap dan dipahami
                  </label>
                </div>
              )}
            />
          </Field>

          <Field label="Kondisi Personil" full>
            <Controller
              name="safety.kondisiPersonil"
              control={form.control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih kondisi personil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEHAT">Sehat</SelectItem>
                    <SelectItem value="KURANG_SEHAT">Kurang Sehat</SelectItem>
                    <SelectItem value="BUTUH_PERHATIAN">Butuh Perhatian</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <Field label="Potensi Bahaya Dijelaskan" full>
            <Controller
              name="safety.potensiBahayaDijelaskan"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    id="potensi-bahaya"
                  />
                  <label htmlFor="potensi-bahaya" className="text-sm cursor-pointer">
                    Sudah dijelaskan potensi bahaya dan pengendaliannya
                  </label>
                </div>
              )}
            />
          </Field>

          <Field label="APD Lengkap" full>
            <Controller
              name="safety.apdLengkap"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    id="apd-lengkap"
                  />
                  <label htmlFor="apd-lengkap" className="text-sm cursor-pointer">
                    Peralatan kerja, rambu, dan APD sudah lengkap
                  </label>
                </div>
              )}
            />
          </Field>

          <Field label="Asuransi Ketenagakerjaan" full>
            <Controller
              name="safety.asuransiKetenagakerjaan"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} id="asuransi" />
                  <label htmlFor="asuransi" className="text-sm cursor-pointer">
                    Asuransi ketenagakerjaan aktif (BPJS TK)
                  </label>
                </div>
              )}
            />
          </Field>

          <Field label="Berdoa Sebelum Bekerja" full>
            <Controller
              name="safety.berdoaSebelumBekerja"
              control={form.control}
              render={({ field }) => (
                <div className="flex items-center gap-3 p-3 border rounded-lg">
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} id="berdoa" />
                  <label htmlFor="berdoa" className="text-sm cursor-pointer">
                    Sudah berdoa sebelum memulai pekerjaan
                  </label>
                </div>
              )}
            />
          </Field>
        </Section>

        {/* Legacy safety fields for compatibility */}
        <Section idx={5} title="Keterangan Tambahan">
          <Field label="Potensi Bahaya" full>
            <Textarea {...form.register("potensiBahaya")} rows={2} placeholder="" />
          </Field>
          <Field label="Pengendalian Risiko" full>
            <Textarea {...form.register("pengendalianRisiko")} rows={2} placeholder="" />
          </Field>
          <Field label="APD">
            <Input {...form.register("apd")} placeholder="" />
          </Field>
          <Field label="Rambu Kerja">
            <Input {...form.register("rambuKerja")} placeholder="" />
          </Field>
          <Field label="Asuransi TK" full>
            <Input {...form.register("asuransiTK")} placeholder="" />
          </Field>
        </Section>

        {/* Kondisi Perangkat (Checklist) — Relay / RC / LR / ES / Status CB */}
        <Section idx={6} title="Kondisi Perangkat (Checklist)">
          {([
            ["cekRelay", "Relay"],
            ["cekRC", "RC"],
            ["cekLR", "LR"],
            ["cekES", "ES"],
            ["cekStatusCB", "Status CB"],
          ] as const).map(([name, label]) => (
            <Field key={name} label={label}>
              <Controller
                name={name}
                control={form.control}
                render={({ field }) => (
                  <Select value={field.value ?? undefined} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih kondisi" />
                    </SelectTrigger>
                    <SelectContent>
                      {CHECKLIST_CONDITIONS.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CHECKLIST_CONDITION_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          ))}
        </Section>

        {/* Dokumentasi All-in-One - Supports 40+ files, Images + Videos */}
        <Section idx={7} title="Dokumentasi Pekerjaan">
          <UploadZone
            label="Upload Dokumentasi"
            testId="upload-dokumentasi"
            onFilesSelected={(files) => {
              // Simpan file di state; upload dilakukan setelah laporan dibuat (pakai result.id)
              setDokumentasiFiles(files);
            }}
          />
        </Section>

        <FormToolbar
          onWa={() => setWaOpen(true)}
          onSubmit={() => form.handleSubmit(onSubmit as any, onInvalid)()}
          isSubmitting={isSubmitting}
          submitTestId="submit-laporan-awal"
        />

        {isSubmitting && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Menyimpan laporan...
          </div>
        )}
      </form>

      <Dialog open={waOpen} onOpenChange={setWaOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preview Template WhatsApp</DialogTitle>
          </DialogHeader>
          <div className="bg-[#e7ffdb] dark:bg-emerald-950/30 rounded-xl p-4 text-sm font-mono leading-relaxed whitespace-pre-wrap text-foreground">
            {formatWhatsAppMessage(
              formValues,
              currentUser?.rtupp?.name || "UP2D JAKARTA",
              currentUser?.team?.name || "-",
            )}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                navigator.clipboard?.writeText(
                  formatWhatsAppMessage(
                    formValues,
                    currentUser?.rtupp?.name || "UP2D JAKARTA",
                    currentUser?.team?.name || "-",
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
                  formatWhatsAppMessage(
                    formValues,
                    currentUser?.rtupp?.name || "UP2D JAKARTA",
                    currentUser?.team?.name || "-",
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
