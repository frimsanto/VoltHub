// VoltHub V2 — Asset edit modal.
// Asset PUT replaces the whole resource (UpdateAsset = CreateAsset) and the list
// row carries only a subset of fields, so edits load the FULL detail first to
// avoid nulling unshown fields. Reused by the Assets list and Asset detail.
import { Loader2 } from "lucide-react";
import { EntityFormModal } from "@/components/v2/EntityFormModal";
import { assets, type AssetFormValues } from "./resource";
import { AssetForm } from "./AssetForm";

export function AssetEditModal({
  assetId,
  open,
  onOpenChange,
  onSuccess,
}: {
  assetId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}) {
  const { data, isLoading } = assets.useOne(open ? assetId ?? undefined : undefined);
  const updateM = assets.useUpdate();

  return (
    <EntityFormModal open={open} onOpenChange={onOpenChange} title="Ubah Asset" className="sm:max-w-2xl">
      {isLoading || !data ? (
        <div className="flex h-40 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" /> Memuat data aset…
        </div>
      ) : (
        <AssetForm
          defaultValues={data as AssetFormValues}
          excludeId={assetId ?? undefined}
          submitting={updateM.isPending}
          onCancel={() => onOpenChange(false)}
          onSubmit={(values) =>
            updateM.mutate(
              { id: assetId as string, body: values },
              {
                onSuccess: () => {
                  onOpenChange(false);
                  onSuccess?.();
                },
              },
            )
          }
        />
      )}
    </EntityFormModal>
  );
}
