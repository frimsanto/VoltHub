// VoltHub — Form Inspeksi GH (tipis; logika penuh di gh-shared/GhReportForm).
import { GhReportForm, type GhReportInitial, type SubmitIntent } from "@/features/v2/gh-shared/GhReportForm";
import type { CreateInspeksiGh, InspeksiGhDetail } from "./resource";

export type { SubmitIntent };

export function InspeksiGhForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  disabled,
}: {
  initial?: Partial<InspeksiGhDetail>;
  submitting?: boolean;
  onSubmit: (values: CreateInspeksiGh, intent: SubmitIntent) => void;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  return (
    <GhReportForm
      variant="INSPEKSI"
      initial={initial as GhReportInitial}
      submitting={submitting}
      onCancel={onCancel}
      disabled={disabled}
      onSubmit={(values, intent) => onSubmit(values as CreateInspeksiGh, intent)}
    />
  );
}
