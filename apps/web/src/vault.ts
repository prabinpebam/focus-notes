/**
 * The token vault (D-81): the GitHub token is encrypted with an AES-GCM key that WebCrypto creates as
 * non-extractable, so neither the key nor the token can be read back out of the browser's storage.
 * The token exists in plain text only in memory, to be sent to api.github.com.
 */
import type { WebDb } from "./idb.ts";

interface Sealed {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

async function key(db: WebDb): Promise<CryptoKey> {
  const existing = await db.getMeta<CryptoKey>("vaultKey");
  if (existing) return existing;
  const k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await db.setMeta("vaultKey", k);
  return k;
}

export async function storeToken(db: WebDb, token: string): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(db), new TextEncoder().encode(token));
  await db.setMeta("token", { iv, data } satisfies Sealed);
}

export async function loadToken(db: WebDb): Promise<string | undefined> {
  const sealed = await db.getMeta<Sealed>("token");
  if (!sealed) return undefined;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.iv }, await key(db), sealed.data);
    return new TextDecoder().decode(plain);
  } catch {
    return undefined;
  }
}

export async function forgetToken(db: WebDb): Promise<void> {
  await db.deleteMeta("token");
}
