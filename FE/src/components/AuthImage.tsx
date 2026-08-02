import { useEffect, useState } from "react";
import { File as FileIcon } from "lucide-react";
import { fetchAttachmentBlob } from "@/lib/api/upload";

/**
 * Thumbnail for an attachment that lives behind the authenticated API.
 *
 * `/upload/preview/:id` requires a Bearer token, so a raw `<img src>` is rejected
 * with 401. We fetch the bytes through the api client (which attaches the token),
 * turn them into an object URL, and render that — revoking it on cleanup.
 *
 * On any failure (or for non-image files) it falls back to a file icon.
 */
export function AuthImage({
  attachmentId,
  alt,
  className,
}: {
  attachmentId: string;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;

    setUrl(null);
    setFailed(false);

    fetchAttachmentBlob(attachmentId)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!revoked) setFailed(true);
      });

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachmentId]);

  if (failed) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className ?? ""}`}>
        <FileIcon className="size-4 text-muted-foreground" />
      </div>
    );
  }

  if (!url) {
    return <div className={`animate-pulse bg-muted ${className ?? ""}`} />;
  }

  return <img src={url} alt={alt} className={className} onError={() => setFailed(true)} />;
}
