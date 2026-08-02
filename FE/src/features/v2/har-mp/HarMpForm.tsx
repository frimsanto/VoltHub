// VoltHub — Form HAR MP (tipis; logika penuh di mp-shared/MpReportForm).
import { MpReportForm, type MpReportInitial, type SubmitIntent } from "@/features/v2/mp-shared/MpReportForm";
import type { CreateHarMp, HarMpDetail } from "./resource";

export type { SubmitIntent };

export function HarMpForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  disabled,
}: {
  initial?: Partial<HarMpDetail>;
  submitting?: boolean;
  onSubmit: (values: CreateHarMp, intent: SubmitIntent) => void;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  return (
    <MpReportForm
      variant="HAR"
      initial={initial as MpReportInitial}
      submitting={submitting}
      onCancel={onCancel}
      disabled={disabled}
      onSubmit={(values, intent) => onSubmit(values as CreateHarMp, intent)}
    />
  );
}
