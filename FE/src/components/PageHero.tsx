// VoltHub — PageHero (Opsi D "Gradient Hero").
// Header gradient gelap per halaman dashboard: judul + deskripsi di kiri, stat
// kunci (opsional) + jam/tanggal di kanan. Gradient FIXED gelap di kedua tema
// (identitas halaman), sehingga teks memakai white/opacity — bukan token tema.
// `clock` menyalakan jam live internal (interval 1 dtk terisolasi di subkomponen
// agar halaman induk tidak ikut re-render tiap detik); alternatifnya kirim
// `timestamp`/`dateLabel` statis.
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const HERO_GRADIENT = "linear-gradient(135deg, #1a1a2e 0%, #13131f 60%, #1a0d00 100%)";

// Label zona waktu pendek (WIB/WITA/WIT) — diturunkan dari Intl agar tetap benar
// untuk user di luar WIB; fallback "WIB".
const TZ_LABEL = (() => {
  try {
    const parts = new Intl.DateTimeFormat("id-ID", { timeZoneName: "short" }).formatToParts(
      new Date(),
    );
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "WIB";
  } catch {
    return "WIB";
  }
})();

const fmtTime = (d: Date) =>
  d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
const fmtDate = (d: Date) =>
  d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function TimeBlock({ timestamp, dateLabel }: { timestamp: string; dateLabel?: string }) {
  return (
    <div className="text-right">
      <p className="text-[18px] font-medium leading-none tabular-nums text-white">
        {timestamp}{" "}
        <span className="text-[11px] font-normal text-white/40">{TZ_LABEL}</span>
      </p>
      {dateLabel && <p className="mt-[2px] text-[10px] text-white/30">{dateLabel}</p>}
    </div>
  );
}

/** Jam live mandiri — interval tick hidup & mati bersama subkomponen ini saja. */
function LiveTimeBlock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <TimeBlock timestamp={fmtTime(now)} dateLabel={fmtDate(now)} />;
}

interface PageHeroProps {
  title: ReactNode;
  description?: ReactNode;
  /** Label stat kunci, mis. "AVA YTD" atau "SLA". */
  statLabel?: string;
  /** Nilai stat kunci, mis. "85.6%" — hanya tampil bila label & value keduanya ada. */
  statValue?: string;
  /** Jam statis, mis. "00.16" — abaikan bila `clock` dipakai. */
  timestamp?: string;
  /** Tanggal statis, mis. "Minggu, 12 Juli 2026". */
  dateLabel?: string;
  /** Jam + tanggal live (menggantikan timestamp/dateLabel statis). */
  clock?: boolean;
  /** Konten ekstra di dalam panel gradient (mis. mini-stat PETUGAS). */
  children?: ReactNode;
  className?: string;
}

export function PageHero({
  title,
  description,
  statLabel,
  statValue,
  timestamp,
  dateLabel,
  clock,
  children,
  className,
}: PageHeroProps) {
  const hasStat = Boolean(statLabel && statValue);
  const hasTime = clock || Boolean(timestamp);

  return (
    <div
      className={cn("overflow-hidden rounded-[10px] px-[18px] py-[18px]", className)}
      style={{ background: HERO_GRADIENT }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Kiri: judul + deskripsi */}
        <div className="min-w-0">
          <h1 className="mb-[3px] text-[18px] font-semibold leading-tight text-white">{title}</h1>
          {description && <p className="text-[12px] text-white/40">{description}</p>}
        </div>

        {/* Kanan: stat kunci + timestamp */}
        {(hasStat || hasTime) && (
          <div className="flex flex-shrink-0 items-center gap-[16px]">
            {hasStat && (
              <div className="text-right">
                <p className="mb-[2px] text-[9px] uppercase tracking-[0.08em] text-white/30">
                  {statLabel}
                </p>
                <p className="text-[22px] font-semibold leading-none tabular-nums text-primary">
                  {statValue}
                </p>
              </div>
            )}
            {hasStat && hasTime && <div className="h-[36px] w-[0.5px] bg-white/[0.08]" />}
            {clock ? (
              <LiveTimeBlock />
            ) : (
              timestamp && <TimeBlock timestamp={timestamp} dateLabel={dateLabel} />
            )}
          </div>
        )}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
