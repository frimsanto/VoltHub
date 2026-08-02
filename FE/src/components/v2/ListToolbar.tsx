// VoltHub V2 — list toolbar: debounced search + filter slot + actions slot.
import { useEffect, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function ListToolbar({
  searchPlaceholder = "Cari…",
  onSearch,
  filters,
  actions,
}: {
  searchPlaceholder?: string;
  onSearch: (value: string) => void;
  filters?: ReactNode;
  actions?: ReactNode;
}) {
  const [value, setValue] = useState("");

  // Debounce search so each keystroke doesn't refetch the list.
  useEffect(() => {
    const t = setTimeout(() => onSearch(value.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9"
          />
        </div>
        {filters}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Inclusive from/to date-range filter (native date pickers). Emits undefined
 *  for a cleared bound so callers can drop it from the query params. */
export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string | undefined;
  to: string | undefined;
  onChange: (range: { from?: string; to?: string }) => void;
}) {
  const inputCls =
    "h-9 rounded-md border border-input bg-background px-2 text-sm shadow-xs text-muted-foreground [color-scheme:dark]";
  return (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        value={from ?? ""}
        max={to || undefined}
        onChange={(e) => onChange({ from: e.target.value || undefined, to })}
        className={inputCls}
        aria-label="Dari tanggal"
      />
      <span className="text-sm text-muted-foreground">–</span>
      <input
        type="date"
        value={to ?? ""}
        min={from || undefined}
        onChange={(e) => onChange({ from, to: e.target.value || undefined })}
        className={inputCls}
        aria-label="Sampai tanggal"
      />
    </div>
  );
}

/** Small uncontrolled-friendly select for column filters (string enums). */
export function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs"
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
