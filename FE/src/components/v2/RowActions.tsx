// VoltHub V2 — table row actions (view / edit / delete).
// Edit & delete render only when `canWrite` (RBAC) is true.
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RowActions({
  onView,
  onEdit,
  onDelete,
  canWrite,
}: {
  onView?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  canWrite?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {onView && (
        <Button variant="ghost" size="icon" className="size-8" onClick={onView} aria-label="Lihat">
          <Eye className="size-4" />
        </Button>
      )}
      {canWrite && onEdit && (
        <Button variant="ghost" size="icon" className="size-8" onClick={onEdit} aria-label="Ubah">
          <Pencil className="size-4" />
        </Button>
      )}
      {canWrite && onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive"
          onClick={onDelete}
          aria-label="Hapus"
        >
          <Trash2 className="size-4" />
        </Button>
      )}
    </div>
  );
}
