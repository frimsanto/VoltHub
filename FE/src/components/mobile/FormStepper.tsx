// VoltHub — mobile 4-step form chrome (Screens 4-7, PETUGAS mobile only).
// Pure presentation: groups a form's EXISTING sections into 4 steps by toggling
// visibility (not mount state), so react-hook-form state/validation never
// changes and desktop (which always shows every group via `md:block`) is
// byte-for-byte unaffected. See GhReportForm/MpReportForm for usage — they wrap
// their real accordion sections in <MobileStepSection step={n}> instead of
// re-deriving fake step content.
import type { ReactNode } from "react";
import { motion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileStepSection({
  step,
  active,
  children,
}: {
  step: number;
  /** Current mobile step, or `null` to bypass stepping (show every group — used
   * for read-only/disabled forms where there's nothing to step through). */
  active: number | null;
  children: ReactNode;
}) {
  const visible = active === null || step === active;
  return <div className={cn(visible ? "block" : "hidden", "md:block")}>{children}</div>;
}

export function FormStepperHeader({
  step,
  labels,
}: {
  step: number;
  labels: [string, string, string, string];
}) {
  return (
    <div className="flex items-center px-4 pb-3 pt-safe pt-3 md:hidden">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-[11px] font-bold transition-colors",
                  done && "bg-primary text-white",
                  active && "bg-primary text-white ring-4 ring-primary/25",
                  !done && !active && "bg-[#131320] text-white/30",
                )}
              >
                {done ? <Check className="size-3.5" /> : n}
              </span>
              <span
                className={cn(
                  "max-w-14 truncate text-[8.5px] font-semibold",
                  active || done ? "text-white/70" : "text-white/25",
                )}
              >
                {label}
              </span>
            </div>
            {n < 4 && (
              <span
                className={cn(
                  "mx-1 h-0.5 flex-1 rounded-full",
                  done ? "bg-primary" : "bg-[#131320]",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FormStepperBottomBar({
  step,
  totalSteps = 4,
  onBack,
  onNext,
  onSaveDraft,
  onSubmit,
  submitting,
  submitLabel = "Ajukan ke Approval",
}: {
  step: number;
  totalSteps?: number;
  onBack: () => void;
  onNext: () => void;
  onSaveDraft: () => void;
  onSubmit: () => void;
  submitting?: boolean;
  submitLabel?: string;
}) {
  const isLast = step === totalSteps;
  return (
    // bottom: var(--bottomnav-h) — PetugasBottomNav is always mounted (every
    // petugas route renders it), also fixed at bottom-0 with a higher paint
    // order, so a bar literally at bottom-0 here would sit UNDER it and eat
    // its own clicks. Raising this above the nav's own height fixes that.
    <div
      className="fixed inset-x-0 z-20 flex gap-2.5 border-t px-4 pb-3 pt-3 md:hidden"
      style={{
        bottom: "var(--bottomnav-h)",
        background: "#0e0e16",
        borderColor: "rgba(255,255,255,.07)",
      }}
    >
      {isLast ? (
        <>
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={onBack}
            className="flex touch-target items-center justify-center rounded-xl border px-4 text-[13px] font-semibold text-white/70"
            style={{ borderColor: "rgba(255,255,255,.15)" }}
          >
            ← Edit
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            disabled={submitting}
            onClick={onSubmit}
            className="flex touch-target flex-1 items-center justify-center rounded-xl bg-primary text-[13px] font-bold text-white disabled:opacity-50"
          >
            {submitLabel}
          </motion.button>
        </>
      ) : (
        <>
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            disabled={submitting}
            onClick={onSaveDraft}
            className="flex touch-target items-center justify-center rounded-xl border px-4 text-[13px] font-semibold text-white/70 disabled:opacity-50"
            style={{ borderColor: "rgba(255,255,255,.15)" }}
          >
            Simpan Draft
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="button"
            onClick={onNext}
            className="flex touch-target flex-1 items-center justify-center rounded-xl bg-primary text-[13px] font-bold text-white"
          >
            Lanjut →
          </motion.button>
        </>
      )}
    </div>
  );
}
