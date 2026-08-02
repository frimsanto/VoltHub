import crypto from 'crypto';
import QRCode from 'qrcode';
import { env } from '../../config/env';
import { getBranding } from './report.branding';
import { signBytes, verifyBytes, getSigningKeys } from './signature.keys';
import type { ReportModel } from './report.templates';

/**
 * Cryptographic core of the Digital Signature module.
 *
 * For every generated report we build a canonical, signed payload and a
 * self-contained verification token (a compact "payload.signature" string, like
 * a JWS) that is embedded in the artifact as a QR code. The token is offline-
 * verifiable by anyone holding the published Ed25519 public key — no server
 * round-trip is required to prove authenticity, which satisfies "must work
 * offline after PDF generation". An online endpoint additionally cross-checks
 * revocation and stored-file integrity (docs/DIGITAL_SIGNATURE.md).
 *
 * Two distinct digests are used:
 *  - `contentHash` — SHA-256 over the *semantic* report content (title + meta +
 *    sections + identifiers). It is signed and travels inside the token, so it
 *    detects tampering of the report's data independently of file formatting.
 *  - `fileHash` (computed by the service after rendering, NOT signed) — SHA-256
 *    of the rendered bytes; lets the online endpoint detect a swapped stored file.
 */

export const SIGNATURE_VERSION = 1;
export const SIGNATURE_ALGORITHM = 'Ed25519' as const;

export interface SignaturePayload {
  /** Payload schema version. */
  v: number;
  /** Signature id (= ReportSignature.id, also the verify-page segment). */
  sigId: string;
  /** Human report number, e.g. INSP-20260609-AB12CD-V2. */
  reportNumber: string;
  sourceType: string;
  sourceId: string;
  version: number;
  /** SHA-256 (hex) of the canonical semantic content. */
  contentHash: string;
  algorithm: typeof SIGNATURE_ALGORITHM;
  /** Public-key fingerprint that signed this payload. */
  keyId: string;
  /** Issuer (company) snapshot. */
  issuer: string;
  /** Signer user id, if known. */
  signedBy: string | null;
  /** ISO timestamp. */
  issuedAt: string;
}

export interface SignatureArtifacts {
  sigId: string;
  payload: SignaturePayload;
  /** base64url canonical-payload JSON. */
  payloadB64: string;
  /** base64url Ed25519 signature over the canonical-payload JSON bytes. */
  signatureB64: string;
  /** Compact self-contained token: `<payloadB64>.<signatureB64>`. */
  token: string;
  /** Absolute verification URL encoded in the QR (token in query for offline use). */
  verifyUrl: string;
  /** QR PNG bytes (embedded into the rendered artifact). */
  qrPng: Buffer;
  contentHash: string;
  keyId: string;
  algorithm: typeof SIGNATURE_ALGORITHM;
  issuer: string;
  issuedAt: string;
}

const b64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromB64url = (s: string): Buffer =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** Deterministic JSON with sorted keys, so the same content always hashes alike. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Stable, format-agnostic fingerprint of a report's semantic content. */
export function computeContentHash(model: ReportModel, reportNumber: string, version: number): string {
  const canonical = canonicalJson({
    reportNumber,
    version,
    sourceType: model.sourceType,
    title: model.title,
    subtitle: model.subtitle,
    meta: model.meta,
    sections: model.sections.map((s) => ({ heading: s.heading, columns: s.columns, rows: s.rows })),
  });
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** SHA-256 (hex) of arbitrary bytes — used for the rendered-file integrity check. */
export function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function verifyBaseUrl(): string {
  // Where the public verification page lives. Falls back to CORS_ORIGIN (the web app).
  return (env.SIGNATURE_VERIFY_BASE_URL || env.CORS_ORIGIN || 'http://localhost:5173').replace(/\/+$/, '');
}

export interface BuildSignatureInput {
  sigId: string;
  model: ReportModel;
  reportNumber: string;
  version: number;
  sourceType: string;
  sourceId: string;
  signedBy: string | null;
}

/**
 * Build the full signature bundle for a report: canonical hash → signed payload →
 * compact token → verification URL → QR PNG. Pure & synchronous except the QR
 * raster. Persisting the result is the caller's job.
 */
export async function buildSignatureArtifacts(input: BuildSignatureInput): Promise<SignatureArtifacts> {
  const { sigId, model, reportNumber, version, sourceType, sourceId, signedBy } = input;
  const { keyId } = getSigningKeys();
  const issuer = getBranding().companyName;
  const issuedAt = new Date().toISOString();
  const contentHash = computeContentHash(model, reportNumber, version);

  const payload: SignaturePayload = {
    v: SIGNATURE_VERSION,
    sigId,
    reportNumber,
    sourceType,
    sourceId,
    version,
    contentHash,
    algorithm: SIGNATURE_ALGORITHM,
    keyId,
    issuer,
    signedBy,
    issuedAt,
  };

  const payloadBytes = Buffer.from(canonicalJson(payload), 'utf8');
  const payloadB64 = b64url(payloadBytes);
  const signatureB64 = b64url(signBytes(payloadBytes));
  const token = `${payloadB64}.${signatureB64}`;

  const verifyUrl = `${verifyBaseUrl()}/verify/${sigId}?t=${encodeURIComponent(token)}`;
  const qrPng = await QRCode.toBuffer(verifyUrl, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  });

  return {
    sigId,
    payload,
    payloadB64,
    signatureB64,
    token,
    verifyUrl,
    qrPng,
    contentHash,
    keyId,
    algorithm: SIGNATURE_ALGORITHM,
    issuer,
    issuedAt,
  };
}

/** Compact, render-facing view of a signature for the PDF/Excel validation block. */
export interface ReportSignatureBlock {
  sigId: string;
  reportNumber: string;
  algorithm: string;
  keyId: string;
  issuer: string;
  signerName: string | null;
  issuedAt: string;
  contentHash: string;
  verifyUrl: string;
  qrPng: Buffer;
}

export function toSignatureBlock(a: SignatureArtifacts, signerName: string | null): ReportSignatureBlock {
  return {
    sigId: a.sigId,
    reportNumber: a.payload.reportNumber,
    algorithm: a.algorithm,
    keyId: a.keyId,
    issuer: a.issuer,
    signerName,
    issuedAt: a.issuedAt,
    contentHash: a.contentHash,
    verifyUrl: a.verifyUrl,
    qrPng: a.qrPng,
  };
}

export interface TokenVerification {
  /** Structure parsed and Ed25519 signature checks out against the public key. */
  signatureValid: boolean;
  payload: SignaturePayload | null;
  error?: string;
}

/**
 * Offline-style verification of a compact token: re-parse the payload and verify
 * the Ed25519 signature with the (optionally supplied) public key. Does NOT touch
 * the database — pure cryptographic authenticity of the token itself.
 */
export function verifyToken(token: string, publicKeyPem?: string): TokenVerification {
  try {
    const [payloadB64, signatureB64] = token.split('.');
    if (!payloadB64 || !signatureB64) {
      return { signatureValid: false, payload: null, error: 'Malformed token' };
    }
    const payloadBytes = fromB64url(payloadB64);
    const signatureValid = verifyBytes(payloadBytes, fromB64url(signatureB64), publicKeyPem);
    const payload = JSON.parse(payloadBytes.toString('utf8')) as SignaturePayload;
    return { signatureValid, payload };
  } catch (err) {
    return { signatureValid: false, payload: null, error: (err as Error).message };
  }
}
