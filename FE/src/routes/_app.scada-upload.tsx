import { createFileRoute } from "@tanstack/react-router";
import { requireV2Role, SCADA_UPLOAD_ROLES } from "@/lib/v2/route-guards";
import { PageHero } from "@/components/PageHero";
import { ScadaUploadPage } from "@/features/v2/scada-snapshot/ScadaUploadPage";

// SCADA Upload (NOC) — replace snapshot harian dari export Siemens Spectrum
// Power 7 (csd_IFS-IFS_RTUs*.xlsx + csd_IFS-IFS_Lines*.xlsx). Setiap upload
// menggantikan total snapshot fileType yang sama. Guard = MASTER/MANAGER/NOC
// (mirror backend SCADA_UPLOAD_ROLES).
export const Route = createFileRoute("/_app/scada-upload")({
  beforeLoad: () => requireV2Role(SCADA_UPLOAD_ROLES),
  component: ScadaUploadRoute,
  head: () => ({ meta: [{ title: "SCADA Upload — VoltHub" }] }),
});

function ScadaUploadRoute() {
  return (
    <div className="space-y-6">
      <PageHero
        title="SCADA Upload"
        description="Upload export harian Siemens SP7: file RTU (Inscan/OOP gardu) dan Lines (channel IFS). Upload baru menggantikan snapshot sebelumnya."
        clock
      />
      <ScadaUploadPage />
    </div>
  );
}
