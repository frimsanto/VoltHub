// VoltHub — Detail view (read-only) untuk Laporan Inspeksi MP & HAR MP.
// Section-by-section, kubikel tabel per-gardu dengan relayDetail collapsible,
// chip/badge kesimpulan per section. Mirror GhReportDetail.tsx.
import { useState } from "react";
import { ChevronDown, CheckCircle2, AlertTriangle, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  MP_SECTIONS,
  MP_KESIMPULAN_LABELS,
  RELAY_DETAIL_GROUPS,
  type MpFieldDef,
  type MpSectionDef,
  type KubikelEntry,
} from "./mpSections";

type Section = Record<string, unknown> | null | undefined;
export type MpReportDetailVariant = "INSPEKSI" | "HAR";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/50 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value ?? "—"}</span>
    </div>
  );
}

function fieldValue(obj: Section, f: MpFieldDef): React.ReactNode {
  const raw = obj?.[f.name];
  if (raw == null || raw === "") return null;
  if (f.name === "kesimpulan") return MP_KESIMPULAN_LABELS[String(raw)] ?? String(raw);
  return String(raw);
}

function KesimpulanBadge({ value }: { value?: unknown }) {
  if (typeof value !== "string" || !value) return null;
  const label = MP_KESIMPULAN_LABELS[value] ?? value;
  const variant = value === "BAIK" ? "default" : value === "RUSAK" ? "destructive" : "secondary";
  return (
    <Badge variant={variant as never} className="text-[10px]">
      {label}
    </Badge>
  );
}

function FlatSectionCard({ section, data }: { section: MpSectionDef; data: Section }) {
  const absent = section.absentable && data?.tidakAda === true;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 py-3">
        <CardTitle className="text-sm">{section.label}</CardTitle>
        <div className="flex items-center gap-1.5">
          {absent && (
            <Badge variant="outline" className="text-[10px]">
              Tidak ada
            </Badge>
          )}
          <KesimpulanBadge value={data?.kesimpulan} />
        </div>
      </CardHeader>
      <CardContent>
        {absent ? (
          <p className="text-sm text-muted-foreground">Peralatan tidak ada.</p>
        ) : (
          (section.fields ?? []).map((f) => (
            <Row key={f.name} label={f.label} value={fieldValue(data, f)} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RelayDetailTable({ relayDetail }: { relayDetail: KubikelEntry["relayDetail"] }) {
  if (!relayDetail)
    return <p className="text-sm text-muted-foreground">Tidak ada data relay detail.</p>;
  return (
    <div className="overflow-x-auto rounded border text-[11px]">
      <table className="w-full border-collapse text-left">
        <thead className="bg-muted font-semibold text-muted-foreground">
          <tr>
            <th className="border-b p-2">Elemen</th>
            <th className="border-b p-2">Cubicle</th>
            <th className="border-b p-2">Master</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {RELAY_DETAIL_GROUPS.map((g) => {
            const pair = relayDetail[g.key];
            return (
              <tr key={g.key}>
                <td className="p-2 font-medium">{g.label}</td>
                <td className="p-2 font-mono">{pair?.cubicle ?? "—"}</td>
                <td className="p-2 font-mono">{pair?.master ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function KubikelEntryRow({ entry, index }: { entry: KubikelEntry; index: number }) {
  const [open, setOpen] = useState(false);
  const hasRelayDetail =
    !!entry.relayDetail && Object.values(entry.relayDetail).some((p) => p?.cubicle || p?.master);
  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{entry.namaGardu || `Gardu #${index + 1}`}</p>
        {entry.penyulangId ? (
          <Badge variant="outline" className="text-[10px]">
            Dari DB
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px]">
            Manual
          </Badge>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
        <Row label="Merek Cubicle" value={entry.merekCubicle} />
        <Row label="Tipe RC" value={entry.tipeRc} />
        <Row label="Arah RC" value={entry.arahRc} />
        <Row label="Tipe Gardu Master" value={entry.tipeGarduMaster} />
        <Row label="Status Cubicle" value={entry.statusCubicle} />
        <Row label="Status Cubicle Master" value={entry.statusCubicleMaster} />
        <Row label="Status L/R Cubicle" value={entry.statusLrCubicle} />
        <Row label="Status L/R Master" value={entry.statusLrMaster} />
        <Row label="MFS Cubicle" value={entry.mfsCubicle} />
        <Row label="MFS Master" value={entry.mfsMaster} />
        <Row label="HFD Cubicle" value={entry.hfdCubicle} />
        <Row label="HFD Master" value={entry.hfdMaster} />
        <Row label="Test RC/Dummy" value={entry.testRcDummy} />
        <Row label="Status RC" value={entry.statusRc} />
      </div>
      {entry.catatan && <Row label="Catatan" value={entry.catatan} />}

      <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
        <CollapsibleTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="w-full justify-between">
            Relay Detail {hasRelayDetail ? "" : "(kosong)"}
            <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <RelayDetailTable relayDetail={entry.relayDetail} />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function KubikelCard({ kubikel }: { kubikel: KubikelEntry[] | null | undefined }) {
  const list = Array.isArray(kubikel) ? kubikel : [];
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Kubikel ({list.length} gardu)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada gardu.</p>
        ) : (
          list.map((k, i) => <KubikelEntryRow key={i} entry={k} index={i} />)
        )}
      </CardContent>
    </Card>
  );
}

function PenangananCard({ penanganan }: { penanganan: Section }) {
  if (!penanganan) return null;
  const has = Object.values(penanganan).some((v) => v != null && v !== "");
  if (!has) return null;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-sm">Penanganan</CardTitle>
        <KesimpulanBadge value={penanganan.kesimpulan} />
      </CardHeader>
      <CardContent>
        <Row label="Analisa" value={penanganan.analisa as string} />
        <Row label="Langkah Penanganan" value={penanganan.langkah as string} />
        <Row label="Hasil" value={penanganan.hasil as string} />
        <Row label="Tindakan Tambahan" value={penanganan.tambahan as string} />
        <Row label="Catatan Lain" value={penanganan.catatanLain as string} />
      </CardContent>
    </Card>
  );
}

// Section status icon (Screen 8, mobile accordion) — green check when filled,
// red ! when marked RUSAK, grey circle when empty/not yet assessed.
function sectionStatusIcon(section: MpSectionDef, data: Section) {
  const absent = section.absentable && data?.tidakAda === true;
  const kesimpulan = data?.kesimpulan;
  if (absent) return { Icon: Circle, className: "text-muted-foreground" };
  if (kesimpulan === "RUSAK") return { Icon: AlertTriangle, className: "text-destructive" };
  if (typeof kesimpulan === "string" && kesimpulan)
    return { Icon: CheckCircle2, className: "text-success" };
  const hasAnyValue = (section.fields ?? []).some((f) => {
    const raw = data?.[f.name];
    return raw != null && raw !== "";
  });
  return hasAnyValue
    ? { Icon: CheckCircle2, className: "text-success" }
    : { Icon: Circle, className: "text-muted-foreground" };
}

/** Mobile-only accordion (Screen 8) — same sections/data as the desktop card
 * grid below, just collapsed with a status icon per section. */
function MobileSectionAccordion({
  sections,
  data,
}: {
  sections: MpSectionDef[];
  data: Record<string, unknown>;
}) {
  return (
    <Accordion type="multiple" className="md:hidden">
      {sections.map((s) => {
        const sectionData = data[s.key] as Section;
        const { Icon, className } = sectionStatusIcon(s, sectionData);
        const absent = s.absentable && sectionData?.tidakAda === true;
        return (
          <AccordionItem key={s.key} value={s.key}>
            <AccordionTrigger className="text-sm">
              <span className="flex flex-1 items-center gap-2">
                <Icon className={`size-4.5 shrink-0 ${className}`} />
                {s.label}
                <KesimpulanBadge value={sectionData?.kesimpulan} />
                {absent && (
                  <Badge variant="outline" className="text-[10px]">
                    Tidak ada
                  </Badge>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              {absent ? (
                <p className="text-sm text-muted-foreground">Peralatan tidak ada.</p>
              ) : (
                <div className="grid grid-cols-2 gap-x-3">
                  {(s.fields ?? []).map((f) => (
                    <Row key={f.name} label={f.label} value={fieldValue(sectionData, f)} />
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

export function MpReportDetail({
  variant,
  data,
}: {
  variant: MpReportDetailVariant;
  data: Record<string, unknown>;
}) {
  const flatSections = MP_SECTIONS.filter((s) => s.variant === "flat");
  return (
    <div className="space-y-4">
      {variant === "HAR" &&
        Array.isArray(data.penyebabGangguan) &&
        data.penyebabGangguan.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Penyebab Gangguan:</span>
            {(data.penyebabGangguan as string[]).map((p) => (
              <Badge key={p} variant="outline" className="text-[10px]">
                {p}
              </Badge>
            ))}
          </div>
        )}

      <MobileSectionAccordion sections={flatSections} data={data} />

      <div className="hidden grid-cols-1 gap-4 md:grid md:grid-cols-2">
        {flatSections.map((s) => (
          <FlatSectionCard key={s.key} section={s} data={data[s.key] as Section} />
        ))}
      </div>

      <KubikelCard kubikel={data.kubikel as KubikelEntry[] | null | undefined} />

      {variant === "HAR" && <PenangananCard penanganan={data.penanganan as Section} />}
    </div>
  );
}
