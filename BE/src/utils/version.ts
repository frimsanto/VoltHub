/**
 * Tiny semver comparison for the app force-update gate. Handles plain
 * "MAJOR.MINOR.PATCH" strings (pre-release tags are ignored). Missing/garbage
 * input compares as 0.0.0.
 */
export const parseSemver = (v: string | undefined | null): [number, number, number] => {
  const parts = String(v ?? '')
    .trim()
    .split('.')
    .map((n) => parseInt(n, 10));
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
};

/** -1 if a<b, 0 if equal, 1 if a>b. */
export const compareSemver = (a: string, b: string): number => {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
};

/** True when `version` is older than `min`. */
export const isBelow = (version: string, min: string): boolean =>
  compareSemver(version, min) < 0;
