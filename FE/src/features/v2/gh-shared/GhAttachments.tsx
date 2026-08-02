// VoltHub — Lampiran Laporan GH (SLD/Logger/Foto/Video), dipakai Inspeksi GH & HAR
// GH. Mirror LaporanGiAttachments.tsx 1:1, diparameterisasi lewat `basePath` +
// `parentId` (endpoint attachment BE mirror pola GI, lihat gh-shared/gh-attachment.*
// di BE). ADITIF — tidak mengubah komponen GI.
import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  FileText, Image as ImageIcon, Video, Trash2, Download, Upload, AlertCircle, RefreshCw, Loader2, Play
} from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface Attachment {
  id: string;
  category: "SLD" | "LOGGER" | "FOTO" | "VIDEO";
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  fileName: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  errorMessage?: string | null;
}

export interface GhAttachmentsProps {
  /** "/v1/gh/inspeksi" atau "/v1/gh/har". */
  basePath: string;
  parentId?: string;
  readOnly?: boolean;
}

export function GhAttachments({ basePath, parentId, readOnly = false }: GhAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [videoPlayUrl, setVideoPlayUrl] = useState<{ [attId: string]: string }>({});
  const [videoLoading, setVideoLoading] = useState<{ [attId: string]: boolean }>({});

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  const fetchAttachments = async (silent = false) => {
    if (!parentId) return;
    if (!silent) setLoading(true);
    try {
      const res = await apiClient.get(`${basePath}/${parentId}/attachments`);
      setAttachments(res.data.data || []);
    } catch (err) {
      console.error("Gagal mengambil data lampiran:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttachments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, basePath]);

  useEffect(() => {
    const hasProcessing = attachments.some((a) => a.status === "PROCESSING");
    if (hasProcessing) {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => fetchAttachments(true), 3000);
      }
    } else if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachments]);

  if (!parentId) {
    return (
      <Card className="border-dashed border-muted-foreground/35">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Lampiran (SLD, Logger, Foto, Video)</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Pemberitahuan</AlertTitle>
            <AlertDescription className="text-xs">
              Simpan draft terlebih dahulu untuk dapat menambahkan atau mengelola lampiran laporan.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: "SLD" | "LOGGER" | "FOTO" | "VIDEO") => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (category === "SLD") {
      const existingSld = attachments.find((a) => a.category === "SLD");
      if (existingSld) {
        try {
          await apiClient.delete(`${basePath}/attachments/${existingSld.id}`);
        } catch {
          toast.error("Gagal mengganti berkas SLD lama");
          return;
        }
      }
    }

    setUploadingCategory(category);
    setUploadProgress(0);

    const uploadSingle = async (file: File) => {
      if (file.size > 150 * 1024 * 1024) {
        toast.error(`Ukuran file "${file.name}" melebihi batas maksimal 150MB`);
        return;
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);
      try {
        await apiClient.post(`${basePath}/${parentId}/attachments`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (progressEvent) => {
            const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
            setUploadProgress(percent);
          },
        });
        toast.success(`Berkas "${file.name}" berhasil diunggah`);
      } catch (err: any) {
        const errorMsg = err.response?.data?.message || err.message || "Gagal mengunggah berkas";
        toast.error(`Gagal mengunggah "${file.name}": ${errorMsg}`);
      }
    };

    for (let i = 0; i < files.length; i++) {
      if (category === "FOTO" && attachments.filter((a) => a.category === "FOTO").length + i >= 20) {
        toast.error("Maksimal 20 foto yang diperbolehkan");
        break;
      }
      await uploadSingle(files[i]);
    }

    setUploadingCategory(null);
    setUploadProgress(0);
    fetchAttachments(true);
  };

  const handleDelete = async (attId: string) => {
    if (window.confirm("Apakah Anda yakin ingin menghapus lampiran ini?")) {
      try {
        await apiClient.delete(`${basePath}/attachments/${attId}`);
        toast.success("Lampiran berhasil dihapus");
        fetchAttachments(true);
        if (videoPlayUrl[attId]) {
          window.URL.revokeObjectURL(videoPlayUrl[attId]);
          setVideoPlayUrl((prev) => {
            const copy = { ...prev };
            delete copy[attId];
            return copy;
          });
        }
      } catch {
        toast.error("Gagal menghapus lampiran");
      }
    }
  };

  const handleDownload = async (attId: string, originalName: string) => {
    try {
      toast.info("Mengunduh berkas...");
      const res = await apiClient.get(`${basePath}/attachments/${attId}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error("Gagal mengunduh berkas");
    }
  };

  const handlePlayVideo = async (attId: string) => {
    if (videoPlayUrl[attId]) return;
    setVideoLoading((prev) => ({ ...prev, [attId]: true }));
    try {
      const res = await apiClient.get(`${basePath}/attachments/${attId}/download`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      setVideoPlayUrl((prev) => ({ ...prev, [attId]: url }));
    } catch {
      toast.error("Gagal memuat video");
    } finally {
      setVideoLoading((prev) => ({ ...prev, [attId]: false }));
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const sldFile = attachments.find((a) => a.category === "SLD");
  const loggerFiles = attachments.filter((a) => a.category === "LOGGER");
  const photoFiles = attachments.filter((a) => a.category === "FOTO");
  const videoFiles = attachments.filter((a) => a.category === "VIDEO");

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="text-base font-bold">Dokumen &amp; Lampiran Teknis GH</CardTitle>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* SLD */}
        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <ImageIcon className="h-4 w-4 text-blue-500" /> Single Line Diagram (SLD)
              </h4>
              <p className="text-xs text-muted-foreground">Wajib format Gambar (PNG/JPG). Maks 1 berkas (replace otomatis jika ganti).</p>
            </div>
            {!readOnly && (
              <div className="relative">
                <input type="file" id="gh-sld-upload" accept="image/png, image/jpeg, image/jpg" className="hidden" disabled={uploadingCategory !== null} onChange={(e) => handleUpload(e, "SLD")} />
                <Button size="sm" variant="outline" asChild disabled={uploadingCategory !== null}>
                  <label htmlFor="gh-sld-upload" className="cursor-pointer flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> Unggah SLD</label>
                </Button>
              </div>
            )}
          </div>
          <div className="mt-3">
            {uploadingCategory === "SLD" && (
              <div className="space-y-1 py-2">
                <div className="flex justify-between text-xs"><span>Mengunggah berkas...</span><span>{uploadProgress}%</span></div>
                <Progress value={uploadProgress} className="h-1.5" />
              </div>
            )}
            {sldFile ? (
              <div className="flex items-center justify-between rounded border p-2 bg-muted/40">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded border bg-background overflow-hidden flex items-center justify-center">
                    <AttachmentPreviewImage basePath={basePath} attId={sldFile.id} alt="SLD" />
                  </div>
                  <div>
                    <p className="text-xs font-medium truncate max-w-[200px] sm:max-w-sm" title={sldFile.originalName}>{sldFile.originalName}</p>
                    <p className="text-[10px] text-muted-foreground">{formatSize(sldFile.fileSize)}</p>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => handleDownload(sldFile.id, sldFile.originalName)}><Download className="h-4 w-4" /></Button>
                  {!readOnly && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(sldFile.id)}><Trash2 className="h-4 w-4" /></Button>}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic py-2">Belum ada berkas SLD diunggah.</p>
            )}
          </div>
        </div>

        {/* LOGGER */}
        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5"><FileText className="h-4 w-4 text-emerald-500" /> Data Logger SCADA / RTU</h4>
              <p className="text-xs text-muted-foreground">Menerima berkas Spreadsheet Excel (.xls, .xlsx) atau Text (.csv).</p>
            </div>
            {!readOnly && (
              <div className="relative">
                <input type="file" id="gh-logger-upload" accept=".xls, .xlsx, .csv" className="hidden" disabled={uploadingCategory !== null} onChange={(e) => handleUpload(e, "LOGGER")} />
                <Button size="sm" variant="outline" asChild disabled={uploadingCategory !== null}>
                  <label htmlFor="gh-logger-upload" className="cursor-pointer flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> Unggah Logger</label>
                </Button>
              </div>
            )}
          </div>
          <div className="mt-3 space-y-2">
            {uploadingCategory === "LOGGER" && (
              <div className="space-y-1 py-2">
                <div className="flex justify-between text-xs"><span>Mengunggah berkas...</span><span>{uploadProgress}%</span></div>
                <Progress value={uploadProgress} className="h-1.5" />
              </div>
            )}
            {loggerFiles.length > 0 ? (
              loggerFiles.map((file) => (
                <div key={file.id} className="flex items-center justify-between rounded border p-2 bg-muted/40">
                  <div className="flex items-center gap-2.5">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium truncate max-w-[200px] sm:max-w-sm" title={file.originalName}>{file.originalName}</p>
                      <p className="text-[10px] text-muted-foreground">{formatSize(file.fileSize)}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => handleDownload(file.id, file.originalName)}><Download className="h-4 w-4" /></Button>
                    {!readOnly && <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(file.id)}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground italic py-2">Belum ada berkas Logger diunggah.</p>
            )}
          </div>
        </div>

        {/* FOTO */}
        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5"><ImageIcon className="h-4 w-4 text-violet-500" /> Dokumentasi Foto Lapangan</h4>
              <p className="text-xs text-muted-foreground">Maksimal 20 berkas gambar (PNG/JPG). Klik ikon untuk unduh.</p>
            </div>
            {!readOnly && (
              <div className="relative">
                <input type="file" id="gh-photo-upload" accept="image/png, image/jpeg, image/jpg" multiple className="hidden" disabled={uploadingCategory !== null || photoFiles.length >= 20} onChange={(e) => handleUpload(e, "FOTO")} />
                <Button size="sm" variant="outline" asChild disabled={uploadingCategory !== null || photoFiles.length >= 20}>
                  <label htmlFor="gh-photo-upload" className="cursor-pointer flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> Unggah Foto</label>
                </Button>
              </div>
            )}
          </div>
          <div className="mt-3">
            {uploadingCategory === "FOTO" && (
              <div className="space-y-1 py-2 mb-3">
                <div className="flex justify-between text-xs"><span>Mengunggah beberapa foto...</span><span>{uploadProgress}%</span></div>
                <Progress value={uploadProgress} className="h-1.5" />
              </div>
            )}
            {photoFiles.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {photoFiles.map((file) => (
                  <div key={file.id} className="relative group rounded border overflow-hidden bg-muted/40 aspect-square flex flex-col justify-between">
                    <div className="relative flex-1 w-full overflow-hidden flex items-center justify-center bg-background cursor-pointer" onClick={() => handleDownload(file.id, file.originalName)}>
                      <AttachmentPreviewImage basePath={basePath} attId={file.id} alt="Foto" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Download className="h-5 w-5 text-white" />
                      </div>
                    </div>
                    <div className="bg-background border-t p-1 flex items-center justify-between text-[10px]">
                      <span className="truncate max-w-[80px]" title={file.originalName}>{file.originalName}</span>
                      {!readOnly && (
                        <button className="text-destructive hover:text-red-700" onClick={() => handleDelete(file.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic py-2">Belum ada berkas Foto diunggah.</p>
            )}
          </div>
        </div>

        {/* VIDEO */}
        <div className="rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b">
            <div>
              <h4 className="text-sm font-semibold flex items-center gap-1.5"><Video className="h-4 w-4 text-rose-500" /> Video Aktivitas Pengujian</h4>
              <p className="text-xs text-muted-foreground">Maks 3 menit (≤150MB). Auto-kompresi in-process backend H.264.</p>
            </div>
            {!readOnly && (
              <div className="relative">
                <input type="file" id="gh-video-upload" accept="video/mp4" className="hidden" disabled={uploadingCategory !== null} onChange={(e) => handleUpload(e, "VIDEO")} />
                <Button size="sm" variant="outline" asChild disabled={uploadingCategory !== null}>
                  <label htmlFor="gh-video-upload" className="cursor-pointer flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> Unggah Video</label>
                </Button>
              </div>
            )}
          </div>
          <div className="mt-3 space-y-3">
            {uploadingCategory === "VIDEO" && (
              <div className="space-y-1 py-2">
                <div className="flex justify-between text-xs"><span>Mengunggah video...</span><span>{uploadProgress}%</span></div>
                <Progress value={uploadProgress} className="h-1.5" />
              </div>
            )}
            {videoFiles.length > 0 ? (
              videoFiles.map((file) => (
                <div key={file.id} className="rounded border p-3 bg-muted/40 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold truncate max-w-xs sm:max-w-md" title={file.originalName}>{file.originalName}</p>
                      <p className="text-[10px] text-muted-foreground">{formatSize(file.fileSize)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <VideoStatusBadge status={file.status} />
                      <div className="flex gap-1.5">
                        {file.status === "READY" && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" onClick={() => handleDownload(file.id, file.originalName)}><Download className="h-4 w-4" /></Button>
                        )}
                        {!readOnly && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDelete(file.id)}><Trash2 className="h-4 w-4" /></Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {file.status === "FAILED" && (
                    <Alert variant="destructive" className="py-2 px-3 text-xs">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <div>
                        <AlertTitle className="text-[11px] font-semibold">Kompresi Gagal</AlertTitle>
                        <AlertDescription className="text-[10px] mt-0.5">{file.errorMessage || "Terjadi kesalahan kompresi video di backend."}</AlertDescription>
                      </div>
                    </Alert>
                  )}

                  {file.status === "READY" && (
                    <div className="rounded border bg-background overflow-hidden relative max-w-md mx-auto aspect-video flex items-center justify-center">
                      {videoPlayUrl[file.id] ? (
                        <video controls className="w-full h-full object-cover" src={videoPlayUrl[file.id]} autoPlay />
                      ) : (
                        <div className="relative w-full h-full group cursor-pointer flex items-center justify-center" onClick={() => handlePlayVideo(file.id)}>
                          <AttachmentPreviewVideoPoster basePath={basePath} attId={file.id} />
                          <div className="absolute inset-0 bg-black/30 group-hover:bg-black/45 transition-colors flex items-center justify-center">
                            {videoLoading[file.id] ? (
                              <Loader2 className="h-10 w-10 text-white animate-spin" />
                            ) : (
                              <div className="h-12 w-12 rounded-full bg-white/90 hover:bg-white flex items-center justify-center shadow-lg transform group-hover:scale-105 transition-all">
                                <Play className="h-6 w-6 text-black fill-black ml-0.5" />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {file.status === "PROCESSING" && (
                    <div className="flex items-center gap-2.5 text-xs text-muted-foreground justify-center py-4 border border-dashed rounded bg-background">
                      <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                      <span>Mengompresi video ke H.264 (proses latar belakang)...</span>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground italic py-2">Belum ada berkas Video diunggah.</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AttachmentPreviewImage({ basePath, attId, alt }: { basePath: string; attId: string; alt: string }) {
  const [src, setSrc] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient
      .get(`${basePath}/attachments/${attId}/download`, { responseType: "blob" })
      .then((res) => {
        if (active) {
          setSrc(window.URL.createObjectURL(res.data));
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attId]);

  if (loading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!src) return <ImageIcon className="h-6 w-6 text-muted-foreground" />;
  return <img src={src} alt={alt} className="w-full h-full object-cover" />;
}

function AttachmentPreviewVideoPoster({ basePath, attId }: { basePath: string; attId: string }) {
  const [src, setSrc] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiClient
      .get(`${basePath}/attachments/${attId}/thumbnail`, { responseType: "blob" })
      .then((res) => {
        if (active) {
          setSrc(window.URL.createObjectURL(res.data));
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attId]);

  if (loading) return <div className="w-full h-full bg-slate-900 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-white" /></div>;
  if (!src) return <div className="w-full h-full bg-slate-900" />;
  return <img src={src} alt="Video Poster" className="w-full h-full object-cover" />;
}

function VideoStatusBadge({ status }: { status: Attachment["status"] }) {
  switch (status) {
    case "UPLOADING":
      return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/25">Mengunggah</Badge>;
    case "PROCESSING":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/25 animate-pulse">Memproses</Badge>;
    case "READY":
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/25">Selesai</Badge>;
    case "FAILED":
      return <Badge variant="destructive" className="bg-red-500/10 text-red-600 border-red-500/25">Gagal</Badge>;
    default:
      return null;
  }
}
