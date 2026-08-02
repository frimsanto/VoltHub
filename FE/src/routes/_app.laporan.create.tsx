/**
 * Buat Laporan — entry point / wizard sederhana.
 *
 * Halaman ini HANYA memilih jenis laporan lalu mengarahkan ke form existing.
 * Tidak mengubah form, logic submit, maupun API.
 *   - Laporan Awal  → /laporan-awal
 *   - Laporan Akhir → /laporan-akhir
 */

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireV2Role, FIELD_ONLY_ROLES } from "@/lib/v2/route-guards";
import { FileText, FileCheck2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/laporan/create")({
  beforeLoad: () => requireV2Role(FIELD_ONLY_ROLES),
  component: BuatLaporanPage,
  head: () => ({ meta: [{ title: "Buat Laporan — VoltHub" }] }),
});

interface ReportOption {
  to: "/laporan-awal" | "/laporan-akhir";
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
  iconBg: string;
}

const OPTIONS: ReportOption[] = [
  {
    to: "/laporan-awal",
    title: "Laporan Awal",
    description:
      "Form sebelum pekerjaan dimulai — safety checklist, personil, pengawas, WP/JSA/HIRARC.",
    icon: FileText,
    accent: "hover:border-info/50 hover:shadow-info/5",
    iconBg: "bg-info/10 text-info",
  },
  {
    to: "/laporan-akhir",
    title: "Laporan Akhir",
    description:
      "Form setelah pekerjaan selesai — aset SCADA, RTU/media/rectifier/baterai, kondisi perangkat.",
    icon: FileCheck2,
    accent: "hover:border-success/50 hover:shadow-success/5",
    iconBg: "bg-success/10 text-success",
  },
];

function BuatLaporanPage() {
  const navigate = useNavigate();

  return (
    <div>
      <PageHeader title="Buat Laporan" description="Pilih jenis laporan yang ingin Anda buat." />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
        {OPTIONS.map((opt) => (
          <Card
            key={opt.to}
            role="button"
            tabIndex={0}
            onClick={() => navigate({ to: opt.to })}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate({ to: opt.to });
              }
            }}
            className={cn(
              "group cursor-pointer rounded-2xl border-border/60 shadow-soft transition-all",
              "hover:-translate-y-0.5 hover:shadow-md",
              opt.accent,
            )}
          >
            <CardContent className="flex flex-col gap-4 p-6">
              <div
                className={cn("size-12 rounded-xl flex items-center justify-center", opt.iconBg)}
              >
                <opt.icon className="size-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-foreground">{opt.title}</h3>
                <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                  {opt.description}
                </p>
              </div>
              <Button
                variant="ghost"
                className="self-start gap-1.5 px-0 text-primary hover:bg-transparent hover:text-primary group-hover:gap-2.5 transition-all"
                tabIndex={-1}
              >
                Mulai isi form
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
