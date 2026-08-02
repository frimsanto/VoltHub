import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

/** Whether the native camera plugin is available (Capacitor app only). */
export function isNativeCamera(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Capture a single photo with the device camera and return it as a File ready
 * for FormData upload. Native only — on web, callers should fall back to a
 * `<input type="file" accept="image/*" capture="environment">`.
 */
export async function capturePhotoFile(): Promise<File | null> {
  if (!isNativeCamera()) return null;

  const photo = await Camera.getPhoto({
    quality: 70,
    resultType: CameraResultType.Uri,
    source: CameraSource.Camera,
    saveToGallery: false,
  });

  if (!photo.webPath) return null;
  const res = await fetch(photo.webPath);
  const blob = await res.blob();
  const ext = photo.format || "jpeg";
  const name = `foto-${Date.now()}.${ext}`;
  return new File([blob], name, { type: blob.type || `image/${ext}` });
}
