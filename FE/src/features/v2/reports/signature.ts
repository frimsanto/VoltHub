// VoltHub — Digital Signature (frontend).
// Public, unauthenticated verification (QR scans must work for anyone) plus
// authenticated signature lookup / revoke. Backend: BE/src/modules/reports
// (signature.*), routes /api/v1/verify (public) & /api/v1/reports (auth).
// Docs: docs/DIGITAL_SIGNATURE.md.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { v2Get, v2Post, handleError } from "@/lib/api/v2";

export type VerifyStatus =
  | "VALID"
  | "REVOKED"
  | "TAMPERED"
  | "INVALID_SIGNATURE"
  | "NOT_FOUND";

export interface VerifyResult {
  valid: boolean;
  status: VerifyStatus;
  signatureValid: boolean;
  contentIntact: boolean | null;
  signature?: {
    sigId: string;
    reportNumber: string;
    sourceType: string;
    version: number;
    algorithm: string;
    keyId: string;
    issuer: string;
    signerName: string | null;
    signedAt: string;
    revokedAt: string | null;
    revokedReason: string | null;
  };
  report?: { id: string; title: string | null; format: string; generatedAt: string };
  verifiedAt: string;
}

export interface ReportSignatureMeta {
  sigId: string;
  reportNumber: string;
  algorithm: string;
  keyId: string;
  contentHash: string;
  fileHash: string;
  token: string;
  verifyUrl: string;
  issuer: string;
  signerName: string | null;
  status: string;
  signedAt: string;
  verifyCount: number;
}

// ── Public verification (no auth) ────────────────────────────────────────────
// Uses a bare fetch against the API origin so it works for logged-out visitors
// scanning a QR code, bypassing the authenticated axios interceptors.
const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:3001/api").replace(/\/+$/, "");

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/v1${path}`, { headers: { Accept: "application/json" } });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || "Verifikasi gagal");
  return json.data as T;
}

export function useVerifySignature(sigId: string | undefined) {
  return useQuery<VerifyResult>({
    queryKey: ["report-signature", "verify", sigId],
    queryFn: () => publicGet<VerifyResult>(`/verify/${sigId}`),
    enabled: !!sigId,
    retry: false,
  });
}

// ── Authenticated signature metadata + lifecycle ─────────────────────────────
export function useReportSignature(reportId: string | undefined, enabled = true) {
  return useQuery<ReportSignatureMeta>({
    queryKey: ["report-signature", "meta", reportId],
    queryFn: () => v2Get<ReportSignatureMeta>(`/reports/generated/${reportId}/signature`),
    enabled: !!reportId && enabled,
    retry: false,
  });
}

export function useRevokeSignature() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { sigId: string; reason?: string }) =>
      v2Post(`/reports/signatures/${vars.sigId}/revoke`, { reason: vars.reason }),
    onSuccess: () => {
      toast.success("Tanda tangan dicabut");
      qc.invalidateQueries({ queryKey: ["report-signature"] });
    },
    onError: (e) => toast.error(handleError(e as never)),
  });
}

/** Absolute public verification URL for a signature (links / QR fallback). */
export function verifyPageUrl(sigId: string): string {
  if (typeof window !== "undefined") return `${window.location.origin}/verify/${sigId}`;
  return `/verify/${sigId}`;
}
