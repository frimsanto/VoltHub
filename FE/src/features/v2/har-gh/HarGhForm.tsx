// VoltHub — Form HAR GH (tipis; logika penuh di gh-shared/GhReportForm).
import { GhReportForm, type GhReportInitial, type SubmitIntent } from "@/features/v2/gh-shared/GhReportForm";
import type { CreateHarGh, HarGhDetail } from "./resource";

export type { SubmitIntent };

export function HarGhForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  disabled,
}: {
  initial?: Partial<HarGhDetail>;
  submitting?: boolean;
  onSubmit: (values: CreateHarGh, intent: SubmitIntent) => void;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  return (
    <GhReportForm
      variant="HAR"
      initial={initial as GhReportInitial}
      submitting={submitting}
      onCancel={onCancel}
      disabled={disabled}
      onSubmit={(values, intent) => onSubmit(values as CreateHarGh, intent)}
    />
  );
}
