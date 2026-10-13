/**
 * Sealing a value for a GitHub Actions secret (FRE-08). GitHub accepts a secret only as a libsodium
 * sealed box (`crypto_box_seal`) to the repository's Curve25519 public key: an ephemeral key pair,
 * a nonce that's BLAKE2b(ephemeral public key ‖ recipient public key) cut to 24 bytes, and
 * XSalsa20-Poly1305 (`crypto_box`). The output is the ephemeral public key followed by the box.
 * Only GitHub, holding the private key, can open it.
 */
import nacl from "tweetnacl";
import { blake2b } from "@noble/hashes/blake2.js";

const KEY_BYTES = 32;
const NONCE_BYTES = 24;

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0));
}

const concat = (a: Uint8Array, b: Uint8Array) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
};

/** The sealed box's nonce: BLAKE2b-192 over the two public keys, as libsodium makes it. */
export const sealNonce = (ephemeral: Uint8Array, recipient: Uint8Array) => blake2b(concat(ephemeral, recipient), { dkLen: NONCE_BYTES });

/** `crypto_box_seal`: anyone can seal to `recipient`, only its private key opens it. */
export function sealedBox(message: Uint8Array, recipient: Uint8Array): Uint8Array {
  if (recipient.length !== KEY_BYTES) throw new Error("The repository's public key isn't 32 bytes");
  // The ephemeral secret comes from Web Crypto, so this never depends on tweetnacl finding a random source.
  const secret = globalThis.crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  const eph = nacl.box.keyPair.fromSecretKey(secret);
  try {
    return concat(eph.publicKey, nacl.box(message, sealNonce(eph.publicKey, recipient), recipient, eph.secretKey));
  } finally {
    secret.fill(0);
    eph.secretKey.fill(0);
  }
}

/** A secret's value sealed to a repository's Actions public key, ready for `setActionsSecret`. */
export function sealSecret(publicKey: { keyId: string; key: string }, value: string): { keyId: string; encryptedValue: string } {
  return { keyId: publicKey.keyId, encryptedValue: bytesToBase64(sealedBox(new TextEncoder().encode(value), base64ToBytes(publicKey.key))) };
}
