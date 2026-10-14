/**
 * The sealing format (D-41, D-90): what the Deploy app workflow publishes for private notes, and how a
 * browser opens it. Web Crypto only, so the same code seals in Node and opens in every browser.
 * See documentations/architecture/repository-and-publishing.html#the-vault.
 */

export const KDF = "pbkdf2-sha256";
/** OWASP's figure for PBKDF2-HMAC-SHA256. Readers refuse any other value, so the format can't be downgraded. */
export const ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const KEY_BYTES = 32;
export const LIMITS = { keyring: 64 * 1024, manifest: 4 * 1024 * 1024, note: 8 * 1024 * 1024, site: 64 * 1024, index: 8 * 1024 * 1024 } as const;

export class SealError extends Error {
  /** format: the file isn't one we accept. key: the passphrase or key doesn't open it. */
  readonly code: "format" | "key";
  constructor(code: "format" | "key", message: string = code) {
    super(message);
    this.code = code;
  }
}

export type Bytes = Uint8Array<ArrayBuffer>;
const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder("utf-8", { fatal: true });
const utf8 = (text: string): Bytes => new Uint8Array(enc.encode(text));

export function toB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function fromB64url(text: string): Bytes {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]*$/.test(text)) throw new SealError("format", "not base64url");
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export const randomBytes = (n: number): Bytes => globalThis.crypto.getRandomValues(new Uint8Array(n));
/** A random, opaque ID: `prefix` plus base32 characters. */
export function randomId(prefix = "", chars = 16): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  return prefix + [...randomBytes(chars)].map((b) => alphabet[b & 31]).join("");
}

/**
 * A rough strength estimate for the vault passphrase (SEC-08): length times the size of the character
 * classes used, discounted for repeats. Setup accepts 60 bits or more (about 4 random words, or 11
 * random characters of mixed classes), because the keyring can be attacked offline.
 */
export function passphraseStrength(p: string): { bits: number; ok: boolean } {
  const s = normalizePassphrase(p);
  let pool = 0;
  if (/[a-z]/.test(s)) pool += 26;
  if (/[A-Z]/.test(s)) pool += 26;
  if (/[0-9]/.test(s)) pool += 10;
  if (/[^A-Za-z0-9]/.test(s)) pool += 33;
  const distinct = new Set(s).size;
  const bits = Math.round(Math.min(s.length, distinct * 2) * Math.log2(Math.max(pool, 1)));
  return { bits, ok: bits >= 60 && s.length >= 12 };
}

/** The passphrase as it's derived: Unicode NFC, trimmed. */
export const normalizePassphrase = (p: string) => p.normalize("NFC").trim();

/** PBKDF2-HMAC-SHA256 → 256 raw bits. The desktop setup stores these as `passcodeKey`, never the passphrase. */
export async function derivePasscodeBits(passphrase: string, salt: Bytes): Promise<Bytes> {
  const base = await subtle().importKey("raw", utf8(normalizePassphrase(passphrase)), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, base, KEY_BYTES * 8));
}
/** The same derivation straight to a non-extractable key, as the browser does it. */
export async function derivePasscodeKey(passphrase: string, salt: Bytes): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", utf8(normalizePassphrase(passphrase)), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS }, base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}
export function importKey(raw: Bytes, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  if (raw.length !== KEY_BYTES) throw new SealError("format", "key length");
  return subtle().importKey("raw", raw, { name: "AES-GCM" }, false, [usage]);
}

async function encrypt(key: CryptoKey, plain: Bytes, aad: string) {
  const iv = randomBytes(IV_BYTES);
  const data = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: utf8(aad) }, key, plain));
  return { iv: toB64url(iv), data: toB64url(data) };
}
async function decrypt(key: CryptoKey, iv: string, data: string, aad: string): Promise<Bytes> {
  const ivBytes = fromB64url(iv);
  if (ivBytes.length !== IV_BYTES) throw new SealError("format", "iv length");
  try {
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: ivBytes, additionalData: utf8(aad) }, key, fromB64url(data)));
  } catch {
    throw new SealError("key");
  }
}

// ---- keyrings: what a passphrase, a passcode, or a magic link opens ----

/** The two derivations a keyring may name: PBKDF2 for passphrases and passcodes, HKDF for links' random secrets. */
export type KeyringKdf = typeof KDF | "hkdf-sha256";
export type KeyringEnvelope =
  | { v: 1; kdf: typeof KDF; iterations: typeof ITERATIONS; salt: string; iv: string; data: string }
  | { v: 1; kdf: "hkdf-sha256"; salt: string; iv: string; data: string };
export interface KeyringPayload { grant: string; expiresAt: string | null; manifest: { kid: string; key: string } }

const keyringAad = (build: string, kdf: KeyringKdf, salt: string) =>
  kdf === KDF ? `focus-notes/keyring/v1|${build}|${KDF}|${ITERATIONS}|${salt}` : `focus-notes/keyring/v1|${build}|${kdf}|${salt}`;

/** Seals a grant's keyring with its derived key (PBKDF2 bits for passcodes, HKDF bits for links). */
export async function sealKeyring(derivedKey: Bytes, salt: Bytes, build: string, payload: KeyringPayload, kdf: KeyringKdf = KDF): Promise<string> {
  const key = await importKey(derivedKey, "encrypt");
  const s = toB64url(salt);
  const body = await encrypt(key, utf8(JSON.stringify(payload)), keyringAad(build, kdf, s));
  const envelope: KeyringEnvelope = kdf === KDF ? { v: 1, kdf, iterations: ITERATIONS, salt: s, ...body } : { v: 1, kdf, salt: s, ...body };
  return JSON.stringify(envelope);
}

/**
 * Checks a keyring strictly before any slow work: only our exact parameters for the derivation the
 * caller expects are accepted (the vault and passcodes PBKDF2, links HKDF), so it can't be downgraded.
 */
export function parseKeyring(text: string, kdf: KeyringKdf = KDF): KeyringEnvelope {
  if (text.length > LIMITS.keyring) throw new SealError("format", "keyring too large");
  let e: Partial<Record<string, unknown>>;
  try { e = JSON.parse(text); } catch { throw new SealError("format", "not JSON"); }
  const keys = Object.keys(e ?? {}).sort().join(",");
  const exact = kdf === KDF ? keys === "data,iterations,iv,kdf,salt,v" && e.iterations === ITERATIONS : keys === "data,iv,kdf,salt,v";
  if (!exact || e.v !== 1 || e.kdf !== kdf) throw new SealError("format", "keyring parameters");
  if (fromB64url(e.salt as string).length !== SALT_BYTES || fromB64url(e.iv as string).length !== IV_BYTES) throw new SealError("format", "keyring sizes");
  fromB64url(e.data as string);
  return e as unknown as KeyringEnvelope;
}
export const keyringSalt = (e: KeyringEnvelope) => fromB64url(e.salt);

export async function openKeyring(e: KeyringEnvelope, key: CryptoKey, build: string): Promise<KeyringPayload> {
  const plain = await decrypt(key, e.iv, e.data, keyringAad(build, e.kdf, e.salt));
  let p: KeyringPayload;
  try { p = JSON.parse(dec.decode(plain)) as KeyringPayload; } catch { throw new SealError("format", "keyring payload"); }
  if (typeof p?.grant !== "string" || typeof p.manifest?.kid !== "string" || !KID.test(p.manifest.kid) || typeof p.manifest.key !== "string") throw new SealError("format", "keyring payload");
  if (p.expiresAt && Date.parse(p.expiresAt) < Date.now()) throw new SealError("key", "expired");
  return p;
}

// ---- sealed files: manifests and notes ----

export type SealedKind = "manifest" | "note";
interface SealedEnvelope { v: 1; iv: string; data: string }
const sealedAad = (kind: SealedKind, build: string, kid: string) => `focus-notes/${kind}/v1|${build}|${kid}`;

export async function sealFile(kind: SealedKind, rawKey: Bytes, build: string, kid: string, plain: Bytes): Promise<string> {
  const key = await importKey(rawKey, "encrypt");
  const envelope: SealedEnvelope = { v: 1, ...(await encrypt(key, plain, sealedAad(kind, build, kid))) };
  return JSON.stringify(envelope);
}
export async function openFile(kind: SealedKind, rawKey: Bytes, build: string, kid: string, text: string): Promise<Bytes> {
  // base64url makes the file about 4/3 of the plaintext.
  if (text.length > LIMITS[kind] * 1.4) throw new SealError("format", `${kind} too large`);
  let e: Partial<SealedEnvelope>;
  try { e = JSON.parse(text); } catch { throw new SealError("format", "not JSON"); }
  if (Object.keys(e ?? {}).sort().join(",") !== "data,iv,v" || e.v !== 1) throw new SealError("format", "sealed parameters");
  const key = await importKey(rawKey, "decrypt");
  return decrypt(key, e.iv!, e.data!, sealedAad(kind, build, kid));
}

export interface ManifestEntry { kid: string; key: string; path: string; title: string; updated: string }
export interface Manifest { owner: string; notes: ManifestEntry[] }

export const KID = /^[a-z2-7]{16}$/;
export function parseManifest(bytes: Uint8Array): Manifest {
  let m: Manifest;
  try { m = JSON.parse(dec.decode(bytes)) as Manifest; } catch { throw new SealError("format", "manifest"); }
  if (typeof m?.owner !== "string" || !Array.isArray(m.notes)) throw new SealError("format", "manifest");
  for (const n of m.notes) {
    if (![n.kid, n.key, n.path, n.title, n.updated].every((x) => typeof x === "string") || !KID.test(n.kid)) throw new SealError("format", "manifest entry");
  }
  return m;
}
export const decodeText = (bytes: Uint8Array) => dec.decode(bytes);
export const encodeText = utf8;

// ---- the public side ----

/** `nameSalt`: the workspace's public salt for passcode keyrings' names, present when there are any (WP-5.2). */
export interface SiteManifest { format: 1; build: string; notes: string; vault: boolean; nameSalt?: string }
export interface PublicNote { path: string; title: string; updated: string }
export interface PublicIndex { format: 1; notes: PublicNote[] }

export const BUILD = /^[a-z2-7]{16}$/;
/** The only place the public index may be: the site can't point the app anywhere else. */
export const PUBLIC_INDEX = "notes/index.json";
export function parseSiteManifest(text: string): SiteManifest {
  if (text.length > LIMITS.site) throw new SealError("format", "site manifest too large");
  let m: SiteManifest;
  try { m = JSON.parse(text) as SiteManifest; } catch { throw new SealError("format", "site manifest"); }
  if (m?.format !== 1 || typeof m.build !== "string" || !BUILD.test(m.build) || m.notes !== PUBLIC_INDEX || typeof m.vault !== "boolean"
    || (m.nameSalt !== undefined && (typeof m.nameSalt !== "string" || !/^[A-Za-z0-9_-]{22,86}$/.test(m.nameSalt)))) {
    throw new SealError("format", "site manifest");
  }
  return m;
}
export function parsePublicIndex(text: string): PublicIndex {
  if (text.length > LIMITS.index) throw new SealError("format", "public index too large");
  let m: PublicIndex;
  try { m = JSON.parse(text) as PublicIndex; } catch { throw new SealError("format", "public index"); }
  if (m?.format !== 1 || !Array.isArray(m.notes) || !m.notes.every((n) => [n?.path, n?.title, n?.updated].every((x) => typeof x === "string") && isSafePath(n.path))) {
    throw new SealError("format", "public index");
  }
  return m;
}
/** A relative note path with no way out of its folder. */
export const isSafePath = (p: string) =>
  /\.(md|markdown)$/i.test(p) && !p.startsWith("/") && !p.includes("\\") && !p.includes(":") && p.split("/").every((s) => s && s !== "." && s !== "..");
export const vaultPath = (build: string) => `_access/${build}/vault.json`;
export const sealedPath = (build: string, kid: string) => `_sealed/${build}/${kid}.json`;
/** A note's title: its first heading, else its file name. */
export function titleOf(path: string, text = ""): string {
  const h = /^#{1,6}[ \t]+(.+?)[ \t#]*$/m.exec(text);
  return (h?.[1] ?? path.split("/").at(-1)!.replace(/\.(md|markdown)$/i, "")).trim();
}
