import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export interface Coords {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/**
 * Get the current GPS position. Uses the Capacitor plugin on native (with
 * proper permission prompts) and the browser Geolocation API on web. Throws a
 * human-readable Error on denial/timeout so callers can toast it.
 */
export async function getCurrentPosition(): Promise<Coords> {
  if (Capacitor.isNativePlatform()) {
    const perm = await Geolocation.checkPermissions();
    if (perm.location !== "granted") {
      const req = await Geolocation.requestPermissions();
      if (req.location !== "granted") {
        throw new Error("Izin lokasi ditolak");
      }
    }
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
    });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
    };
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Perangkat tidak mendukung GPS");
  }
  return new Promise<Coords>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        }),
      (err) => reject(new Error(err.message || "Gagal mengambil lokasi")),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  });
}

/** Format coordinates to 6 decimals (~0.1 m) for display/append. */
export function formatCoords(c: Coords): string {
  return `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}`;
}
