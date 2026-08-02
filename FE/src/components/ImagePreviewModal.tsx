import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Download, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { useState } from "react";

interface ImagePreviewModalProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  fileName?: string;
  downloadUrl?: string;
}

export function ImagePreviewModal({
  open,
  onClose,
  imageUrl,
  fileName,
  downloadUrl,
}: ImagePreviewModalProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  const handleZoomIn = () => setScale((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);
  const handleReset = () => {
    setScale(1);
    setRotation(0);
  };

  const handleDownload = () => {
    if (downloadUrl) {
      window.open(downloadUrl, "_blank");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full p-0 overflow-hidden bg-black/95">
        <DialogHeader className="absolute top-0 left-0 right-0 z-10 p-4 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-white text-sm font-medium truncate max-w-md">
              {fileName || "Image Preview"}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20"
                onClick={handleZoomOut}
                disabled={scale <= 0.5}
              >
                <ZoomOut className="size-4" />
              </Button>
              <span className="text-white text-xs font-mono w-12 text-center">
                {Math.round(scale * 100)}%
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20"
                onClick={handleZoomIn}
                disabled={scale >= 3}
              >
                <ZoomIn className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20"
                onClick={handleRotate}
              >
                <RotateCw className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20"
                onClick={handleReset}
              >
                Reset
              </Button>
              {downloadUrl && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-white hover:bg-white/20"
                  onClick={handleDownload}
                >
                  <Download className="size-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-white hover:bg-white/20"
                onClick={onClose}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="relative w-full h-[80vh] flex items-center justify-center bg-black">
          <img
            src={imageUrl}
            alt={fileName || "Preview"}
            className="max-w-full max-h-full object-contain transition-transform duration-200"
            style={{
              transform: `scale(${scale}) rotate(${rotation}deg)`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              setScale(scale === 1 ? 1.5 : 1);
            }}
          />
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10 p-4 bg-gradient-to-t from-black/80 to-transparent">
          <div className="text-center text-white/60 text-xs">
            Click image to toggle zoom • Use buttons for precise control
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
