// Detail "popup" rendered as a side panel (richer than a Leaflet popup): shows
// the selected site's health, asset breakdown, open work orders and recent
// inspections — lazily fetched via /gis/locations/:id when a marker is clicked.
import { Link } from "@tanstack/react-router";
import {
  X,
  MapPin,
  Boxes,
  Ticket,
  ClipboardCheck,
  GitBranch,
  ArrowRight,
  Navigation,
} from "lucide-react";
import { useV2Role } from "@/lib/v2/rbac";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGisSiteDetail, type SiteHealth } from "./api";
import { LocationVerify } from "./LocationVerify";
import { HEALTH_COLOR, HEALTH_LABEL } from "./style";

function HealthBadge({ health }: { health: SiteHealth }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
      style={{ background: HEALTH_COLOR[health] }}
    >
      <span className="size-1.5 rounded-full bg-white/90" />
      {HEALTH_LABEL[health]}
    </span>
  );
}

export function SiteDetailPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, isLoading, isError } = useGisSiteDetail(id);
  const role = useV2Role();
  // The full Gardu detail page is OPS-only; PETUGAS sees the panel summary only.
  const canOpenDetail = role !== "PETUGAS";
  // Geo-verification is a write action → everyone except the read-only MANAGER.
  const canVerify = role !== "MANAGER";

  // PETUGAS phones: slide up from the bottom (native bottom-sheet feel) instead
  // of floating top-anchored. Desktop/tablet and every other role keep the
  // original floating card position untouched.
  const bottomSheet = role === "PETUGAS";

  return (
    <Card
      data-testid="gis-detail-panel"
      className={
        bottomSheet
          ? "absolute inset-x-0 bottom-0 top-auto z-[1000] max-h-[75%] w-auto overflow-auto rounded-b-none rounded-t-2xl border-border/60 bg-card shadow-lg md:inset-x-auto md:right-4 md:top-4 md:bottom-auto md:max-h-[calc(100%-2rem)] md:w-[340px] md:rounded-2xl md:bg-card/95 md:backdrop-blur"
          : "absolute inset-x-3 top-14 z-[1000] max-h-[calc(100%-var(--bottomnav-h)-4rem)] w-auto overflow-auto rounded-2xl border-border/60 bg-card/95 shadow-lg backdrop-blur md:inset-x-auto md:right-4 md:top-4 md:max-h-[calc(100%-2rem)] md:w-[340px]"
      }
    >
      {bottomSheet && (
        <div className="flex justify-center pt-2.5 md:hidden" aria-hidden>
          <span className="h-1 w-10 rounded-full bg-white/15" />
        </div>
      )}
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
        <div className="min-w-0">
          {isLoading ? (
            <Skeleton className="h-5 w-40" />
          ) : (
            <>
              <CardTitle className="text-base truncate">{data?.name ?? "—"}</CardTitle>
              <div className="text-xs text-muted-foreground mt-0.5">{data?.locationType}</div>
            </>
          )}
        </div>
        <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {isError && <div className="text-destructive text-xs">Gagal memuat detail lokasi.</div>}
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {data && (
          <>
            <div className="flex items-center justify-between">
              <Badge variant="outline">{data.locationType}</Badge>
              <HealthBadge health={data.health} />
            </div>

            {(data.up3 || data.address) && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPin className="size-3.5 mt-0.5 shrink-0" />
                <span>{[data.up3, data.address].filter(Boolean).join(" · ")}</span>
              </div>
            )}

            {/* Lanjut navigasi di Google Maps (koordinat GeoJSON = [lng, lat]) */}
            {data.coordinates && (
              <Button
                size="sm"
                className="w-full gap-1.5"
                onClick={() =>
                  window.open(
                    `https://www.google.com/maps/dir/?api=1&destination=${data.coordinates![1]},${data.coordinates![0]}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                <Navigation className="size-3.5" /> Buka di Google Maps
              </Button>
            )}

            {/* Field geo-verification (PETUGAS confirms / corrects the pin) */}
            {canVerify && <LocationVerify id={id} coordinates={data.coordinates} />}

            {/* Assets by type */}
            <section>
              <div className="flex items-center gap-1.5 font-semibold text-xs mb-1.5">
                <Boxes className="size-3.5" /> Asset
              </div>
              {data.assetsByType.length === 0 ? (
                <p className="text-xs text-muted-foreground">Tidak ada asset terdaftar.</p>
              ) : (
                <ul className="space-y-1">
                  {data.assetsByType.map((a) => (
                    <li key={a.assetType} className="flex items-center justify-between text-xs">
                      <span>{a.assetType}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {a.total} total
                        {a.faulty > 0 && (
                          <span className="text-destructive"> · {a.faulty} bermasalah</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Feeders / Penyulang */}
            {data.feeders.length > 0 && (
              <section>
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1.5">
                  <GitBranch className="size-3.5" /> Penyulang
                </div>
                <ul className="space-y-1">
                  {data.feeders.map((f) => (
                    <li key={f.id} className="flex items-center justify-between text-xs">
                      <span className="truncate">{f.feederName}</span>
                      <span className="text-muted-foreground shrink-0">{f.assetCount} asset</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Open work orders */}
            <section>
              <div className="flex items-center gap-1.5 font-semibold text-xs mb-1.5">
                <Ticket className="size-3.5" /> Work Order Aktif ({data.openTickets.length})
              </div>
              {data.openTickets.length === 0 ? (
                <p className="text-xs text-muted-foreground">Tidak ada work order aktif.</p>
              ) : (
                <ul className="space-y-1">
                  {data.openTickets.map((t) => (
                    <li key={t.id} className="flex items-center justify-between text-xs">
                      <span className="font-mono">{t.ticketNumber}</span>
                      <Badge
                        variant={t.priority === "CRITICAL" ? "destructive" : "outline"}
                        className="text-[10px]"
                      >
                        {t.priority}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Recent inspections */}
            {data.recentInspections.length > 0 && (
              <section>
                <div className="flex items-center gap-1.5 font-semibold text-xs mb-1.5">
                  <ClipboardCheck className="size-3.5" /> Inspeksi Terakhir
                </div>
                <ul className="space-y-1">
                  {data.recentInspections.map((i) => (
                    <li key={i.id} className="flex items-center justify-between text-xs">
                      <span>{new Date(i.inspectionDate).toLocaleDateString("id-ID")}</span>
                      {i.worstStatus && (
                        <span className="text-muted-foreground">{i.worstStatus}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Jump to the full Gardu detail page (OPS roles only) */}
            {canOpenDetail && (
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/gardu/$id" params={{ id }}>
                  Buka Detail Gardu <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
