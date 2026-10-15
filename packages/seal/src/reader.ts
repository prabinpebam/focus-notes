/**
 * Reading an instance's site in the browser (PKG-08, PKG-10): its public notes, and its vault once the
 * owner's passphrase (or a key this browser remembered) opens it. Read-only by construction.
 */
import {
  decodeText, derivePasscodeBits, derivePasscodeKey, fromB64url, isSafePath, KDF, keyringSalt, LIMITS, openFile, openKeyring, parseKeyring, parseManifest,
  parsePublicIndex, parseSiteManifest, sealedPath, SealError, vaultPath,
  type KeyringEnvelope, type ManifestEntry, type PublicNote, type SiteManifest,
} from "./format.ts";
import { deriveLinkKey, GRANT_ID, keyringRole, LINK_KDF, linkKeyringPath, nameLookup, passcodeKeyringPath } from "./grants.ts";

/** Fetches a file of the site by its path from the site's root. Resolves to undefined if it isn't there. */
export type SiteFetch = (path: string) => Promise<string | undefined>;

const encodePath = (p: string) => p.split("/").map(encodeURIComponent).join("/");

export class SiteReader {
  #manifest: Promise<SiteManifest | undefined> | undefined;
  readonly #get: SiteFetch;
  constructor(get: SiteFetch) {
    this.#get = get;
  }
  private get(path: string) {
    return this.#get(path);
  }

  /** The site's manifest, or undefined where there's none (local development, the desktop app). */
  manifest(): Promise<SiteManifest | undefined> {
    this.#manifest ??= this.get("focus-notes.json").then((t) => (t === undefined ? undefined : parseSiteManifest(t))).catch(() => undefined);
    return this.#manifest;
  }
  async publicNotes(): Promise<PublicNote[]> {
    const m = await this.manifest();
    if (!m) return [];
    const text = await this.get(m.notes);
    return text === undefined ? [] : parsePublicIndex(text).notes;
  }
  async readPublic(path: string): Promise<string> {
    if (!isSafePath(path)) throw new SealError("format", "path");
    const text = await this.get(`notes/${encodePath(path)}`);
    if (text === undefined) throw new Error(`No public note at ${path}`);
    if (text.length > LIMITS.note) throw new SealError("format", "note too large");
    return text;
  }

  /** Opens the vault with the passphrase. Returns the key too, so the caller may remember it. */
  async unlock(passphrase: string): Promise<{ vault: OpenVault; key: CryptoKey; salt: string }> {
    const { m, envelope } = await this.#keyring();
    const key = await derivePasscodeKey(passphrase, keyringSalt(envelope));
    return { vault: await this.#open(m, envelope, key, keyringRole.vault), key, salt: envelope.salt };
  }
  /** Opens the vault with a remembered key. Fails with code "key" if the passphrase has changed since. */
  async unlockWithKey(key: CryptoKey, salt: string): Promise<OpenVault> {
    const { m, envelope } = await this.#keyring();
    if (envelope.salt !== salt) throw new SealError("key", "passphrase changed");
    return this.#open(m, envelope, key, keyringRole.vault);
  }

  async #keyring() {
    const m = await this.manifest();
    if (!m?.vault) throw new SealError("format", "no vault");
    const text = await this.get(vaultPath(m.build));
    if (text === undefined) throw new SealError("format", "no keyring");
    return { m, envelope: parseKeyring(text) };
  }

  /**
   * Opens what a magic link shares (SHR-10). Every failure, from a missing or withdrawn grant to a
   * wrong secret or a damaged file, is the same generic error, so it never says whether a note exists.
   */
  async openLink(id: string, secret: string): Promise<OpenVault> {
    return (await this.openLinkSession(id, secret)).share;
  }
  /** Opens what a name and passcode share (SHR-10), with the same generic error. Returns the key too, so the caller may remember it. */
  async openPasscode(name: string, passcode: string): Promise<{ share: OpenVault; key: CryptoKey; salt: string }> {
    return generic(async () => {
      const m = await this.manifest();
      if (!m?.nameSalt) throw new SealError("key");
      const lookup = await nameLookup(m.nameSalt, name);
      const text = await this.get(passcodeKeyringPath(m.build, lookup));
      if (text === undefined) throw new SealError("key");
      const envelope = parseKeyring(text, KDF);
      const key = await derivePasscodeKey(passcode, keyringSalt(envelope));
      return { share: await this.#open(m, envelope, key, keyringRole.passcode(lookup)), key, salt: envelope.salt };
    });
  }

  /**
   * The share reader's ways in (WP-5.4, D-125): each opens the share and returns a session, the derived
   * key with what finds its keyring (the grant's ID, or the name's lookup) and the grant's expiry, so the
   * reader can reopen it after a reload or in another tab without the link secret or the passcode.
   */
  async openLinkSession(id: string, secret: string): Promise<OpenShare> {
    return generic(async () => {
      if (!GRANT_ID.test(id)) throw new SealError("key");
      const m = await this.manifest();
      const envelope = await this.#shareKeyring(m, "link", id);
      // Straight to a non-extractable key: usable to decrypt, never readable (security review M1).
      const key = await deriveLinkKey(fromB64url(secret), keyringSalt(envelope), id);
      return this.#openShare(m!, envelope, "link", id, key);
    });
  }
  async openPasscodeSession(name: string, passcode: string): Promise<OpenShare> {
    return generic(async () => {
      const m = await this.manifest();
      if (!m?.nameSalt) throw new SealError("key");
      const lookup = await nameLookup(m.nameSalt, name);
      const text = await this.get(passcodeKeyringPath(m.build, lookup));
      if (text === undefined) {
        // The same slow derivation as a wrong passcode, so the time taken doesn't show whether the name has a share.
        await derivePasscodeBits(passcode, DUMMY_SALT);
        throw new SealError("key");
      }
      const envelope = parseKeyring(text, KDF);
      return this.#openShare(m, envelope, "passcode", lookup, await derivePasscodeKey(passcode, keyringSalt(envelope)));
    });
  }
  /** Reopens a share from a stored session. Anything malformed or expired fails before any request; every failure is generic. */
  async resume(stored: unknown): Promise<OpenShare> {
    return generic(async () => {
      const s = parseShareSession(stored);
      const m = await this.manifest();
      return this.#openShare(m!, await this.#shareKeyring(m, s.via, s.ref), s.via, s.ref, s.key);
    });
  }

  async #shareKeyring(m: SiteManifest | undefined, via: ShareSession["via"], ref: string): Promise<KeyringEnvelope> {
    if (!m) throw new SealError("key");
    const text = await this.get(via === "link" ? linkKeyringPath(m.build, ref) : passcodeKeyringPath(m.build, ref));
    if (text === undefined) throw new SealError("key");
    return parseKeyring(text, via === "link" ? LINK_KDF : KDF);
  }
  async #openShare(m: SiteManifest, envelope: KeyringEnvelope, via: ShareSession["via"], ref: string, key: CryptoKey): Promise<OpenShare> {
    // A link's keyring names its grant, so it must be the one the link asked for (D-117).
    const share = await this.#open(m, envelope, key, via === "link" ? keyringRole.link(ref) : keyringRole.passcode(ref), via === "link" ? ref : undefined);
    return { share, session: { v: 1, via, ref, key, expiresAt: share.expiresAt ?? null } };
  }

  async #open(m: SiteManifest, envelope: KeyringEnvelope, key: CryptoKey, role: string, grant?: string): Promise<OpenVault> {
    const isVault = role === keyringRole.vault;
    const ring = await openKeyring(envelope, key, m.build, role);
    if (grant !== undefined && ring.grant !== grant) throw new SealError("key");
    const sealed = await this.get(sealedPath(m.build, ring.manifest.kid));
    if (sealed === undefined) throw new SealError("format", "no manifest");
    const manifest = parseManifest(await openFile("manifest", fromB64url(ring.manifest.key), m.build, ring.manifest.kid, sealed));
    const notes = manifest.notes.filter((n) => isSafePath(n.path));
    const byPath = new Map(notes.map((n) => [n.path, n]));
    const missing = (path: string) => (isVault ? new Error(`No private note at ${path}`) : new SealError("key"));
    return {
      owner: manifest.owner,
      expiresAt: ring.expiresAt,
      notes: notes.map(({ path, title, updated }) => ({ path, title, updated })),
      read: async (path) => {
        const entry: ManifestEntry | undefined = byPath.get(path);
        if (!entry) throw missing(path);
        const text = await this.get(sealedPath(m.build, entry.kid));
        if (text === undefined) throw isVault ? new SealError("format", "missing note") : new SealError("key");
        return decodeText(await openFile("note", fromB64url(entry.key), m.build, entry.kid, text));
      },
    };
  }
}

/** Runs a share's opening, turning every failure into the one generic error (SHR-06). */
async function generic<T>(open: () => Promise<T>): Promise<T> {
  try { return await open(); } catch { throw new SealError("key"); }
}

export interface OpenVault {
  /** The instance owner's GitHub name, shown in the account pill. */
  owner: string;
  /** When the grant ends, as its keyring says (null: never). */
  expiresAt?: string | null;
  notes: PublicNote[];
  read(path: string): Promise<string>;
}

/**
 * What a share reader keeps to reopen a share (SHR-10, D-125): how it was opened, what finds its keyring
 * (the grant's ID for a link, the name's lookup for a passcode), the derived key as a non-extractable
 * AES-GCM CryptoKey (stored only by structured clone, in IndexedDB), and the grant's expiry.
 * Never the link secret, the name, or the passcode, and never the key's bytes.
 */
export interface ShareSession { v: 1; via: "link" | "passcode"; ref: string; key: CryptoKey; expiresAt: string | null }
export interface OpenShare { share: OpenVault; session: ShareSession }

const LOOKUP = /^[0-9a-f]{32}$/;
/** A fixed salt for the derivation an unknown name still costs (timing). */
const DUMMY_SALT = new Uint8Array(16);
const isDecryptKey = (k: unknown): k is CryptoKey =>
  typeof CryptoKey === "function" && k instanceof CryptoKey && !k.extractable && k.algorithm.name === "AES-GCM" && k.usages.length === 1 && k.usages[0] === "decrypt";
/** A stored session, checked strictly: exactly these keys, a non-extractable decrypt-only AES-GCM key, a well-formed reference, and not expired. */
export function parseShareSession(v: unknown): ShareSession {
  const s = v as Partial<ShareSession> | null;
  const fail = () => { throw new SealError("key"); };
  if (typeof s !== "object" || s === null || Object.keys(s).sort().join(",") !== "expiresAt,key,ref,v,via" || s.v !== 1) return fail();
  if (!(s.via === "link" ? GRANT_ID : s.via === "passcode" ? LOOKUP : undefined)?.test(String(s.ref))) return fail();
  if (!isDecryptKey(s.key)) return fail();
  if (s.expiresAt !== null && (typeof s.expiresAt !== "string" || !(Date.parse(s.expiresAt) > Date.now()))) return fail();
  return s as ShareSession;
}
