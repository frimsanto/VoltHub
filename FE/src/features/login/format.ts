const idNum = new Intl.NumberFormat("id-ID");

/** Full grouped digits, id-ID style (14832 → "14.832"). */
export function full(n: number): string {
  return idNum.format(n);
}

/** Compact label for very large counts (115080 → "115K", 11435 → "11,4K"). */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (n >= 1_000) {
    const k = n / 1_000;
    return k >= 100 ? `${Math.round(k)}K` : `${k.toFixed(1).replace(".", ",")}K`;
  }
  return idNum.format(n);
}
