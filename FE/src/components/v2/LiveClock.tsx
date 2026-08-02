// VoltHub — live clock + date for the dashboard header.
// Enterprise dashboards (PLN-scale) anchor the header with a "who & when"
// context band: a greeting plus a live, ticking date/time. No dependency —
// a single 1s interval, cleaned up on unmount.
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

const DATE_FMT: Intl.DateTimeFormatOptions = {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
};
const TIME_FMT: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

// Short local timezone label (e.g. "GMT+7") — derived, not hardcoded, so it
// stays correct for WIB/WITA/WIT users alike.
const tzLabel = (() => {
  try {
    const parts = new Intl.DateTimeFormat("id-ID", { timeZoneName: "short" }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
})();

export function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/60 px-3.5 py-2 backdrop-blur">
      <span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">
        <Clock className="size-[18px]" />
      </span>
      <div className="leading-tight">
        <div className="text-lg font-bold tabular-nums tracking-tight">
          {now.toLocaleTimeString("id-ID", TIME_FMT)}
          {tzLabel && <span className="ml-1 text-xs font-normal text-muted-foreground">{tzLabel}</span>}
        </div>
        <div className="text-xs text-muted-foreground">{now.toLocaleDateString("id-ID", DATE_FMT)}</div>
      </div>
    </div>
  );
}
