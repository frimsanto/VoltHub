// VoltHub — Pencarian GARDU (Metering Point / Gardu Distribusi, RTUPP2-5).
// Autocomplete debounced ke GET /mp/inspeksi/search-gardu?q=&limit= (RTUPP-scoped,
// endpoint SAMA dipakai Inspeksi MP & HAR MP — satu hook untuk keduanya). Dipakai
// sebagai picker lokasi GARDU pada Work Order (menggantikan dropdown top-100 statis
// karena jumlah gardu distribusi jauh lebih besar dari GI/GH).
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Loader2, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { v2Get } from "@/lib/api/v2";

export interface GarduSearchResult {
  id: string;
  code: string;
  name: string;
  up3: string | null;
  feederId: string | null;
  feederName: string | null;
}

/** Debounced (~300ms) search-gardu lookup, RTUPP-scoped, min 2 chars, capped 20-50. */
export function useSearchGardu(query: string, limit = 20) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  const q = debounced.trim();
  const enabled = q.length >= 2;
  const cappedLimit = Math.min(Math.max(limit, 1), 50);

  return useQuery({
    queryKey: ["v2-mp-search-gardu", q, cappedLimit],
    queryFn: () => v2Get<GarduSearchResult[]>("/mp/inspeksi/search-gardu", { params: { q, limit: cappedLimit } }),
    enabled,
  });
}

export function GarduSearchInput({
  value,
  onSelect,
  disabled,
  placeholder = "Cari kode / nama gardu…",
  limit = 20,
}: {
  value?: GarduSearchResult | null;
  onSelect: (gardu: GarduSearchResult) => void;
  disabled?: boolean;
  placeholder?: string;
  limit?: number;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchQ = useSearchGardu(term, limit);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const results = searchQ.data ?? [];
  const showDropdown = open && term.trim().length >= 2;

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          value={open || !value ? term : `${value.code} — ${value.name}`}
          placeholder={value ? `${value.code} — ${value.name}` : placeholder}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setTerm(e.target.value);
            setOpen(true);
          }}
        />
        {searchQ.isFetching && (
          <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {showDropdown && (
        <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-md border bg-popover shadow-md">
          {term.trim().length < 2 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Ketik minimal 2 karakter…</p>
          ) : searchQ.isLoading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Mencari…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Tidak ditemukan.</p>
          ) : (
            results.map((g) => (
              <button
                type="button"
                key={g.id}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onSelect(g);
                  setTerm("");
                  setOpen(false);
                }}
              >
                <span className="font-medium">
                  {g.code} — {g.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  UP3: {g.up3 ?? "—"}
                  {g.feederName ? ` · Penyulang: ${g.feederName}` : ""}
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {!showDropdown && (
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground opacity-50" />
      )}
    </div>
  );
}
