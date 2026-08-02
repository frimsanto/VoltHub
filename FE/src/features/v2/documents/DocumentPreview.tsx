// VoltHub — Document preview. Inline render for images & PDFs; download prompt
// for other file types (Office docs etc.).
import { FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { v2FileUrl } from "@/lib/api/v2";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const PDF_EXT = /\.pdf$/i;

export function DocumentPreview({ fileUrl, name }: { fileUrl: string; name: string }) {
  const url = v2FileUrl(fileUrl);

  if (url && IMAGE_EXT.test(fileUrl)) {
    return (
      <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
        <img src={url} alt={name} className="mx-auto max-h-[600px] w-auto object-contain" />
      </div>
    );
  }

  if (url && PDF_EXT.test(fileUrl)) {
    return (
      <iframe
        src={url}
        title={name}
        className="h-[600px] w-full rounded-lg border border-border bg-muted/30"
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-14 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <FileText className="size-6" />
      </div>
      <p className="text-sm text-muted-foreground">Pratinjau tidak tersedia untuk tipe file ini.</p>
      {url && (
        <Button asChild variant="outline" size="sm">
          <a href={url} target="_blank" rel="noreferrer" download>
            <Download className="size-4" /> Unduh untuk membuka
          </a>
        </Button>
      )}
    </div>
  );
}
