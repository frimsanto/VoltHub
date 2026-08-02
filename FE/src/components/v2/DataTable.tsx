// VoltHub V2 — DataTable (TanStack Table)
// Server-side pagination grid per DESIGN_SYSTEM §3. The contract exposes
// page/limit/search/filters (no server sort), so pagination is manual and sorting
// is intentionally omitted to avoid misleading single-page sorts. States: loading
// (skeleton rows), error (retry), empty (EmptyState).

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, AlertCircle, Loader2 } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StaggerList, StaggerItem } from "./Animated";

/**
 * Daftar nomor halaman dengan elipsis. Selalu menampilkan halaman pertama,
 * terakhir, dan tetangga halaman aktif (current ± 1). Untuk ≤ 7 halaman, tampil
 * semua tanpa elipsis. `current` berbasis-1.
 */
function pageItems(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: (number | "…")[] = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);
  if (left > 2) items.push("…");
  for (let i = left; i <= right; i++) items.push(i);
  if (right < total - 1) items.push("…");
  items.push(total);
  return items;
}

/** Default empty state — used by both the desktop table and the mobile card
 *  list when the caller doesn't pass a custom `emptyState`. */
function DefaultEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
      <div className="flex size-14 items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/30">
        <svg
          className="size-6 text-muted-foreground/40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
          />
        </svg>
      </div>
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium text-foreground/60">Belum ada data</p>
        <p className="text-xs text-muted-foreground/50">Data akan muncul setelah ada aktivitas</p>
      </div>
    </div>
  );
}

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, any>[];
  data: TData[];
  pageCount: number;
  pagination: PaginationState;
  onPaginationChange: (updater: React.SetStateAction<PaginationState>) => void;
  total?: number;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  emptyState?: React.ReactNode;
  onRowClick?: (row: TData) => void;
  toolbar?: React.ReactNode;
  /** Extra classes per row (visual only) — e.g. a status accent border. */
  rowClassName?: (row: TData) => string | undefined;
}

export function DataTable<TData>({
  columns,
  data,
  pageCount,
  pagination,
  onPaginationChange,
  total,
  isLoading,
  isError,
  onRetry,
  emptyState,
  onRowClick,
  toolbar,
  rowClassName,
}: DataTableProps<TData>) {
  const table = useReactTable({
    data,
    columns,
    pageCount,
    state: { pagination },
    onPaginationChange,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  const colCount = columns.length;
  const from = total === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const to = Math.min((pagination.pageIndex + 1) * pagination.pageSize, total ?? 0);

  // Column header labels keyed by column id, for the mobile card view. Rendered
  // from the same column defs the table uses so the two views never drift.
  const headerCells = table.getHeaderGroups().at(-1)?.headers ?? [];
  const labelFor = (id: string): React.ReactNode => {
    const h = headerCells.find((hc) => hc.column.id === id);
    if (!h || h.isPlaceholder) return null;
    return flexRender(h.column.columnDef.header, h.getContext());
  };

  return (
    <div className="space-y-3">
      {toolbar}

      {/* Mobile (< md): each row as a stacked card — tables overflow on phones. */}
      <div className="space-y-3 md:hidden">
        {isError ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card p-6 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <p className="text-sm text-destructive">Gagal memuat data.</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                Coba lagi
              </Button>
            )}
          </div>
        ) : isLoading ? (
          Array.from({ length: pagination.pageSize > 6 ? 6 : pagination.pageSize }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-4">
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          ))
        ) : data.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6">
            {emptyState ?? <DefaultEmpty />}
          </div>
        ) : (
          <StaggerList className="space-y-3">
            {table.getRowModel().rows.map((row) => (
              <StaggerItem key={row.id}>
                <div
                  className={cn(
                    "rounded-lg border border-border bg-card p-4 space-y-2.5",
                    onRowClick && "cursor-pointer active:bg-muted/50",
                    rowClassName?.(row.original),
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => {
                    const isActions = cell.column.id === "actions";
                    if (isActions) {
                      return (
                        <div
                          key={cell.id}
                          className="flex justify-end border-t border-border/50 pt-2.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      );
                    }
                    return (
                      <div key={cell.id} className="flex items-start justify-between gap-3 text-sm">
                        <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {labelFor(cell.column.id)}
                        </span>
                        <span className="min-w-0 wrap-break-word text-right">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </div>

      {/* Desktop (md+): full data table. */}
      <div className="hidden rounded-lg border border-border bg-card md:block">
        <Table className="text-sm">
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="border-border/40 hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isError ? (
              <TableRow>
                <TableCell colSpan={colCount} className="h-40">
                  <div className="flex flex-col items-center justify-center gap-3 text-center">
                    <AlertCircle className="size-8 text-destructive" />
                    <p className="text-sm text-destructive">Gagal memuat data.</p>
                    {onRetry && (
                      <Button variant="outline" size="sm" onClick={onRetry}>
                        Coba lagi
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : isLoading ? (
              Array.from({ length: pagination.pageSize > 8 ? 8 : pagination.pageSize }).map(
                (_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: colCount }).map((__, j) => (
                      <TableCell key={j}>
                        <div className="h-4 w-full max-w-[160px] animate-pulse rounded bg-muted" />
                      </TableCell>
                    ))}
                  </TableRow>
                ),
              )
            ) : data.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colCount} className="h-64 text-center">
                  {emptyState ?? <DefaultEmpty />}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={cn(
                    "border-border/30 transition-colors duration-100 hover:bg-accent/40",
                    onRowClick && "cursor-pointer",
                    rowClassName?.(row.original),
                  )}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          {isLoading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" /> Memuat…
            </span>
          ) : (
            <>
              Menampilkan {from}–{to} dari {total ?? data.length}
            </>
          )}
        </p>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage() || isLoading}
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="size-4" />
          </Button>
          {pageItems(pagination.pageIndex + 1, Math.max(pageCount, 1)).map((item, i) =>
            item === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={item}
                variant={item === pagination.pageIndex + 1 ? "default" : "outline"}
                size="sm"
                className="min-w-9 tabular-nums"
                onClick={() => table.setPageIndex(item - 1)}
                disabled={isLoading}
                aria-label={`Halaman ${item}`}
                aria-current={item === pagination.pageIndex + 1 ? "page" : undefined}
              >
                {item}
              </Button>
            ),
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage() || isLoading}
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
