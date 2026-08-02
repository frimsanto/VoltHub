// Field geo-verification control for the GIS site panel.
//
// During a gardu visit a PETUGAS confirms whether the pin sits where the gardu
// actually is. "Sesuai" logs the check and leaves the position untouched;
// "Tidak sesuai" reveals a small form to capture the real coordinates — one tap
// on "Gunakan GPS Saya" reads the device position (navigator.geolocation), or
// the officer types them in — and on save the gardu auto-moves on the map.
import { useState } from "react";
import { MapPin, Crosshair, Check, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { handleError } from "@/lib/api/client";
import { useVerifySiteCoordinates } from "./api";

type Mode = "idle" | "correcting";

export function LocationVerify({
  id,
  coordinates,
}: {
  id: string;
  /** Current pin position in GeoJSON [lng, lat] order, or null if ungeocoded. */
  coordinates: [number, number] | null;
}) {
  const verify = useVerifySiteCoordinates(id);
  const [mode, setMode] = useState<Mode>("idle");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [locating, setLocating] = useState(false);

  const currentLat = coordinates ? coordinates[1] : null;
  const currentLng = coordinates ? coordinates[0] : null;

  function startCorrecting() {
    setLat(currentLat != null ? String(currentLat) : "");
    setLng(currentLng != null ? String(currentLng) : "");
    setAccuracy(null);
    setNote("");
    setMode("correcting");
  }

  function useMyGps() {
    if (!("geolocation" in navigator)) {
      toast.error("Perangkat tidak mendukung GPS");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(7));
        setLng(pos.coords.longitude.toFixed(7));
        setAccuracy(Math.round(pos.coords.accuracy));
        setLocating(false);
        toast.success(`Lokasi GPS terbaca (±${Math.round(pos.coords.accuracy)} m)`);
      },
      (err) => {
        setLocating(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? "Izin lokasi ditolak — aktifkan GPS untuk perangkat ini"
            : "Gagal membaca lokasi GPS",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  }

  function confirm() {
    verify.mutate(
      { result: "CONFIRMED" },
      {
        onSuccess: () => toast.success("Lokasi gardu dikonfirmasi sesuai"),
        onError: (e) => toast.error(handleError(e as never)),
      },
    );
  }

  function submitCorrection() {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || latNum < -90 || latNum > 90) {
      toast.error("Latitude tidak valid (-90 s/d 90)");
      return;
    }
    if (!Number.isFinite(lngNum) || lngNum < -180 || lngNum > 180) {
      toast.error("Longitude tidak valid (-180 s/d 180)");
      return;
    }
    verify.mutate(
      {
        result: "CORRECTED",
        latitude: latNum,
        longitude: lngNum,
        accuracy,
        note: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success("Koordinat gardu diperbarui");
          setMode("idle");
        },
        onError: (e) => toast.error(handleError(e as never)),
      },
    );
  }

  return (
    <section className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
      <div className="flex items-center gap-1.5 font-semibold text-xs mb-1.5">
        <MapPin className="size-3.5" /> Verifikasi Lokasi
      </div>

      <p className="text-[11px] text-muted-foreground mb-2 tabular-nums">
        {coordinates
          ? `Posisi saat ini: ${currentLat?.toFixed(6)}, ${currentLng?.toFixed(6)}`
          : "Gardu ini belum punya koordinat."}
      </p>

      {mode === "idle" ? (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs"
            disabled={verify.isPending || !coordinates}
            onClick={confirm}
          >
            <Check className="size-3.5" /> Sesuai
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 h-8 text-xs"
            disabled={verify.isPending}
            onClick={startCorrecting}
          >
            <X className="size-3.5" /> Tidak sesuai
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            size="sm"
            variant="secondary"
            className="w-full h-8 text-xs"
            disabled={locating}
            onClick={useMyGps}
          >
            {locating ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Crosshair className="size-3.5" />
            )}
            Gunakan GPS Saya
          </Button>

          <div className="flex gap-2">
            <Input
              inputMode="decimal"
              placeholder="Latitude"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="h-8 text-xs"
            />
            <Input
              inputMode="decimal"
              placeholder="Longitude"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className="h-8 text-xs"
            />
          </div>
          {accuracy != null && (
            <p className="text-[11px] text-muted-foreground">Akurasi GPS ±{accuracy} m</p>
          )}
          <Input
            placeholder="Catatan (opsional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="h-8 text-xs"
          />

          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-8 text-xs"
              disabled={verify.isPending}
              onClick={submitCorrection}
            >
              {verify.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Simpan Koordinat
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              disabled={verify.isPending}
              onClick={() => setMode("idle")}
            >
              Batal
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
