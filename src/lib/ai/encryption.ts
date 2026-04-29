/**
 * AES-256-GCM encryption for user-supplied API keys.
 *
 * Uses Web Crypto API so it runs in Edge runtimes (Cloudflare Workers,
 * Supabase Edge Functions, Vercel Edge) without Node-specific dependencies.
 *
 * The encryption secret is provided via env var `KEY_ENCRYPTION_SECRET`
 * (32-byte hex). The ciphertext format stores everything required for
 * decryption: `${ivBase64}:${authTagBase64}:${ciphertextBase64}`.
 */

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex length');
  const buf = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getKey(secretHex: string): Promise<CryptoKey> {
  const raw = hexToBytes(secretHex);
  if (raw.length !== 32) {
    throw new Error('KEY_ENCRYPTION_SECRET must be 32 bytes (64 hex chars)');
  }
  return crypto.subtle.importKey(
    'raw',
    raw as BufferSource,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptKey(plaintext: string, secretHex: string): Promise<string> {
  const key = await getKey(secretHex);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const encoded = ENCODER.encode(plaintext);
  const plainBytes = new Uint8Array(new ArrayBuffer(encoded.length));
  plainBytes.set(encoded);
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plainBytes as BufferSource,
  );
  const ciphertext = new Uint8Array(ctBuf);
  return `${bytesToBase64(iv)}:${bytesToBase64(ciphertext)}`;
}

export async function decryptKey(encrypted: string, secretHex: string): Promise<string> {
  const parts = encrypted.split(':');
  if (parts.length !== 2) throw new Error('Malformed encrypted key');
  const [ivB64, ctB64] = parts;
  const iv = base64ToBytes(ivB64!);
  const ct = base64ToBytes(ctB64!);
  const key = await getKey(secretHex);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  return DECODER.decode(plain);
}

/** Last-4-character hint, safe to display in UI. */
export function makeHint(plaintext: string): string {
  return plaintext.slice(-4).padStart(8, '•');
}
