import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';

/**
 * Signing-key management for the Digital Signature module.
 *
 * Uses Node's built-in `crypto` with **Ed25519** — an asymmetric scheme that is
 * native to Node (no external/paid service, fully offline). Asymmetric (vs an
 * HMAC) is deliberate: the *public* key can be published so anyone can verify a
 * report's signature token offline, while the private key never leaves the
 * server. This is what makes a generated PDF self-verifying after the fact.
 *
 * Key resolution order (first hit wins, memoised):
 *   1. env SIGNATURE_PRIVATE_KEY / SIGNATURE_PUBLIC_KEY (PEM) — production.
 *   2. A persisted keypair under <UPLOAD_DIR>/keys/ — generated once on first
 *      boot and reused across restarts (dev/self-hosted convenience).
 *
 * `keyId` is a short fingerprint of the public key (SPKI DER → sha256) so a
 * verifier can tell which key signed a token even after a future key rotation.
 */

export interface SigningKeys {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  publicKeyPem: string;
  keyId: string;
}

const KEY_DIR = 'keys';
const PRIV_FILE = 'report-signing.key.pem';
const PUB_FILE = 'report-signing.pub.pem';

let cached: SigningKeys | null = null;

/** Normalise a PEM passed via env (supports literal "\n" escapes from .env). */
function pemFromEnv(raw: string): string {
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

function fingerprint(publicKey: crypto.KeyObject): string {
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return crypto.createHash('sha256').update(der).digest('hex').slice(0, 16);
}

function buildFromPem(privPem: string, pubPem: string): SigningKeys {
  const privateKey = crypto.createPrivateKey(privPem);
  const publicKey = crypto.createPublicKey(pubPem);
  return {
    privateKey,
    publicKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    keyId: fingerprint(publicKey),
  };
}

function keysDir(): string {
  return path.join(process.cwd(), env.UPLOAD_DIR, KEY_DIR);
}

function loadOrCreatePersisted(): SigningKeys {
  const dir = keysDir();
  const privPath = path.join(dir, PRIV_FILE);
  const pubPath = path.join(dir, PUB_FILE);

  if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
    return buildFromPem(fs.readFileSync(privPath, 'utf8'), fs.readFileSync(pubPath, 'utf8'));
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  const privPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

  fs.mkdirSync(dir, { recursive: true });
  // Restrictive mode on the private key (best-effort on Windows).
  fs.writeFileSync(privPath, privPem, { mode: 0o600 });
  fs.writeFileSync(pubPath, pubPem, { mode: 0o644 });

  return buildFromPem(privPem, pubPem);
}

/** Resolve (and memoise) the active signing keypair. */
export function getSigningKeys(): SigningKeys {
  if (cached) return cached;

  if (env.SIGNATURE_PRIVATE_KEY && env.SIGNATURE_PUBLIC_KEY) {
    cached = buildFromPem(pemFromEnv(env.SIGNATURE_PRIVATE_KEY), pemFromEnv(env.SIGNATURE_PUBLIC_KEY));
  } else {
    cached = loadOrCreatePersisted();
  }
  return cached;
}

/** Public key (PEM) + fingerprint — published so third parties verify offline. */
export function getPublicKeyInfo(): { keyId: string; algorithm: 'Ed25519'; publicKeyPem: string } {
  const { keyId, publicKeyPem } = getSigningKeys();
  return { keyId, algorithm: 'Ed25519', publicKeyPem };
}

/** Sign raw bytes with the active private key (Ed25519 → no hash algo arg). */
export function signBytes(data: Buffer): Buffer {
  return crypto.sign(null, data, getSigningKeys().privateKey);
}

/** Verify a signature against bytes using a given (or the active) public key. */
export function verifyBytes(data: Buffer, signature: Buffer, publicKeyPem?: string): boolean {
  try {
    const key = publicKeyPem ? crypto.createPublicKey(pemFromEnv(publicKeyPem)) : getSigningKeys().publicKey;
    return crypto.verify(null, data, key, signature);
  } catch {
    return false;
  }
}

/** Test seam — clears the memoised keypair (e.g. after rotating env keys). */
export function resetSigningKeyCache(): void {
  cached = null;
}
