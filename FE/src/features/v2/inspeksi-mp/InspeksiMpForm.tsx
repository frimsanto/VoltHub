// VoltHub — Form Inspeksi MP (tipis; logika penuh di mp-shared/MpReportForm).
import { MpReportForm, type MpReportInitial, type SubmitIntent } from "@/features/v2/mp-shared/MpReportForm";
import type { CreateInspeksiMp, InspeksiMpDetail } from "./resource";

export type { SubmitIntent };

export function InspeksiMpForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  disabled,
}: {
  initial?: Partial<InspeksiMpDetail>;
  submitting?: boolean;
  onSubmit: (values: CreateInspeksiMp, intent: SubmitIntent) => void;
  onCancel?: () => void;
  disabled?: boolean;
}) {
  return (
    <MpReportForm
      variant="INSPEKSI"
      initial={initial as MpReportInitial}
      submitting={submitting}
      onCancel={onCancel}
      disabled={disabled}
      onSubmit={(values, intent) => onSubmit(values as CreateInspeksiMp, intent)}
    />
  );
}
