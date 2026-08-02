/**
 * Auto-generate a stable, unique business "code" from a human-entered name.
 *
 * The UI no longer asks operators for a Kode — the name (e.g. "GI Grogol",
 * "TD250", "GH0012") is the human identifier, and `code` is just an internal,
 * NOT-NULL UNIQUE column. When a create request omits `code`, the service
 * derives one from the name and de-duplicates it against existing rows.
 */

/** Uppercase alnum slug, dash-separated. Falls back to `fallback` when empty. */
export function slugifyCode(input: string, fallback = 'ITM'): string {
  const base = (input || '')
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-') // any run of non-alnum → single dash
    .replace(/^-+|-+$/g, ''); // trim leading/trailing dashes
  return base || fallback;
}

/**
 * Produce a code unique under `exists`. Tries the slug first, then appends
 * `-2`, `-3`, … keeping within `maxLength`. A timestamp suffix is the final
 * (practically unreachable) guarantee.
 */
export async function generateUniqueCode(
  name: string,
  exists: (code: string) => Promise<boolean>,
  opts: { fallback?: string; maxLength?: number } = {},
): Promise<string> {
  const maxLength = opts.maxLength ?? 50;
  const root = slugifyCode(name, opts.fallback ?? 'ITM').slice(0, maxLength);

  if (!(await exists(root))) return root;

  for (let i = 2; i < 10000; i++) {
    const suffix = `-${i}`;
    const candidate = `${root.slice(0, maxLength - suffix.length)}${suffix}`;
    if (!(await exists(candidate))) return candidate;
  }

  const stamp = `-${Date.now().toString(36).slice(-6).toUpperCase()}`;
  return `${root.slice(0, maxLength - stamp.length)}${stamp}`;
}
