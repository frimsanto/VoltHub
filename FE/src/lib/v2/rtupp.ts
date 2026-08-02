// RTUPP-specific business rules.
//
// PLN Jakarta currently runs 5 RTUPP units (RTUPP1–RTUPP5). RTUPP1 is special:
// it operates Gardu Induk (GIS) feeders, so its work is described in terms of
// "Penyulang" (feeder) and "Lokasi GI" rather than the ordinary "Gardu" /
// "Lokasi Gardu" used by RTUPP2–RTUPP5. The field reports (Laporan Awal &
// Laporan Akhir) relabel accordingly for RTUPP1 accounts only.
//
// RTUPP1 is detected by its RTUPP *name* containing "GIS" (it is the GIS unit);
// the other units' names do not contain "GIS".

type RtuppRef = { code?: string | null; name?: string | null } | null | undefined;

const normalize = (s?: string | null) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// Matches RTUPP1 / RTUPP-1 / RTUPP 1 / RTUPP01 — but NOT RTUPP10..RTUPP19.
const RTUPP1_RE = /^RTUPP0*1$/;

/** True when the logged-in user belongs to RTUPP1 — the GIS unit. Detected by
 *  the RTUPP name/code matching "RTUPP1" (the static selector value), or by the
 *  name containing "GIS" (legacy data). */
export function isRtupp1User(user: { rtupp?: RtuppRef } | null | undefined): boolean {
  const r = user?.rtupp;
  if (!r) return false;
  if (RTUPP1_RE.test(normalize(r.code)) || RTUPP1_RE.test(normalize(r.name))) return true;
  return (r.name ?? "").toUpperCase().includes("GIS");
}
