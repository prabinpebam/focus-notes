/**
 * Share grants (WP-5.2, SHR-11, D-41, D-90): which grants are in force, what each one opens, how its
 * paths read to its audience, how a passcode keyring is found by name, and how a link's key is derived.
 * Web Crypto only: the publisher seals with it and the browser's share reader opens with it.
 * See documentations/architecture/repository-and-publishing.html#sealing-and-share-links.
 */
import { SealError, type Bytes } from "./format.ts";

export interface Grant {
  id: string;
  /** The audience. The vault's grant is named "You". */
  name: string;
  owner?: boolean;
  salt: string;
  /** PBKDF2-SHA256 of the vault passphrase (format.derivePasscodeBits). The passphrase is never stored. */
  passcodeKey?: string;
  /** A magic link's 32 random bytes, base64url. Never published. */
  link?: { secret: string };
  /** A share audience's passcode, kept so the invite can be copied again. Never published. */
  passcode?: { value: string; generated?: boolean };
  scope: GrantScope;
  createdAt: string;
  expiresAt?: string | null;
  revokedAt?: string | null;
}
/** Note IDs or paths, folder prefixes (which include notes added later), or every private note. */
export interface GrantScope { all?: boolean; notes?: string[]; folders?: string[] }
export interface AccessFile { version: 1; nameSalt?: string; grants: Grant[] }

/** Neither withdrawn nor expired. */
export const isActive = (g: Grant, now = Date.now()) => !g.revokedAt && (!g.expiresAt || Date.parse(g.expiresAt) > now);

/** The share grants that get keyrings this build: active, not the owner's, and with a link or a passcode. */
export const activeShareGrants = (access: AccessFile, now = Date.now()) =>
  access.grants.filter((g) => !g.owner && isActive(g, now) && (g.link || g.passcode));

/** A note's `id` from its front matter, the only key the app writes there. */
export function noteId(text: string): string | undefined {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  const id = fm && /^id:[ \t]*(["']?)([^\r\n"']+)\1[ \t]*$/m.exec(fm[1]!);
  return id?.[2]?.trim() || undefined;
}

const folderPrefix = (f: string) => f.replace(/^\/+/, "").replace(/\/*$/, "/");

/** Whether a grant's scope opens this note: by its ID or path, under a shared folder, or everything. */
export function inScope(scope: GrantScope, note: { path: string; id?: string | undefined }): boolean {
  if (scope.all) return true;
  if (scope.notes?.some((n) => n === note.path || (note.id !== undefined && n === note.id))) return true;
  return scope.folders?.some((f) => note.path.startsWith(folderPrefix(f))) ?? false;
}

/**
 * Each note's path as its audience sees it, relative to the shared scope: a shared folder keeps its
 * own name and what's inside it, a shared note is just its file name, and the folders above stay
 * unseen. Two notes that would read the same get " (2)", " (3)" before the extension. The vault's
 * scope keeps whole paths. `paths` are the notes the grant opens.
 */
export function scopedPaths(scope: GrantScope, paths: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  if (scope.all) { for (const p of paths) out.set(p, p); return out; }
  const folders = (scope.folders ?? []).map(folderPrefix).sort((a, b) => a.length - b.length);
  const taken = new Set<string>();
  for (const p of [...paths].sort()) {
    const folder = folders.find((f) => p.startsWith(f));
    const first = folder ? p.slice(folder.slice(0, -1).lastIndexOf("/") + 1) : p.slice(p.lastIndexOf("/") + 1);
    const dot = first.lastIndexOf(".");
    let shown = first;
    for (let n = 2; taken.has(shown.toLowerCase()); n++) shown = `${first.slice(0, dot)} (${n})${first.slice(dot)}`;
    taken.add(shown.toLowerCase());
    out.set(p, shown);
  }
  return out;
}

// ---- finding a passcode keyring by name ----

/** An audience name as it's looked up: Unicode NFKC, trimmed, case-folded (upper then lower, as ECMAScript defines both). */
export const normalizeName = (name: string) => name.normalize("NFKC").trim().toUpperCase().toLowerCase().normalize("NFKC");

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Where a name's passcode keyring is: the first 16 bytes of SHA-256 over
 * `focus-notes/name/v1|<nameSalt>|<normalized name>`, as 32 hex characters. The salt is the workspace's
 * public `nameSalt`, so the file names say nothing about who has access without guessing names first.
 */
export async function nameLookup(nameSalt: string, name: string): Promise<string> {
  const data = new TextEncoder().encode(`focus-notes/name/v1|${nameSalt}|${normalizeName(name)}`);
  return hex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", data)).slice(0, 16));
}

// ---- link keys ----

export const LINK_KDF = "hkdf-sha256";
export const LINK_INFO = "focus-notes/grant/v1";
export const LINK_SECRET_BYTES = 32;
/** A grant ID as it may appear in a keyring's file name: nothing that leaves the folder. */
export const GRANT_ID = /^[A-Za-z0-9_-]{8,64}$/;

async function hkdfBase(secret: Bytes) {
  if (secret.length !== LINK_SECRET_BYTES) throw new SealError("key");
  return globalThis.crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveBits", "deriveKey"]);
}
const hkdfParams = (salt: Bytes) => ({ name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode(LINK_INFO) });

/** HKDF-SHA256 over the link's 32 random bytes with the grant's salt: no slow derivation, the input is already random. */
export async function deriveLinkBits(secret: Bytes, salt: Bytes): Promise<Bytes> {
  return new Uint8Array(await globalThis.crypto.subtle.deriveBits(hkdfParams(salt), await hkdfBase(secret), 256));
}
/** The same derivation straight to a non-extractable key, as the browser does it. */
export async function deriveLinkKey(secret: Bytes, salt: Bytes): Promise<CryptoKey> {
  return globalThis.crypto.subtle.deriveKey(hkdfParams(salt), await hkdfBase(secret), { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
}

export const linkKeyringPath = (build: string, id: string) => `_access/${build}/l/${id}.json`;
export const passcodeKeyringPath = (build: string, lookup: string) => `_access/${build}/p/${lookup}.json`;
