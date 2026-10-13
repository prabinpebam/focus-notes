/**
 * Reading an instance's site in the browser (PKG-08, PKG-10): its public notes, and its vault once the
 * owner's passphrase (or a key this browser remembered) opens it. Read-only by construction.
 */
import {
  decodeText, derivePasscodeKey, LIMITS, fromB64url, isSafePath, keyringSalt, openFile, openKeyring, parseKeyring, parseManifest,
  parsePublicIndex, parseSiteManifest, sealedPath, SealError, vaultPath,
  type ManifestEntry, type PublicNote, type SiteManifest,
} from "./format.ts";

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
    return { vault: await this.#open(m, envelope, key), key, salt: envelope.salt };
  }
  /** Opens the vault with a remembered key. Fails with code "key" if the passphrase has changed since. */
  async unlockWithKey(key: CryptoKey, salt: string): Promise<OpenVault> {
    const { m, envelope } = await this.#keyring();
    if (envelope.salt !== salt) throw new SealError("key", "passphrase changed");
    return this.#open(m, envelope, key);
  }

  async #keyring() {
    const m = await this.manifest();
    if (!m?.vault) throw new SealError("format", "no vault");
    const text = await this.get(vaultPath(m.build));
    if (text === undefined) throw new SealError("format", "no keyring");
    return { m, envelope: parseKeyring(text) };
  }
  async #open(m: SiteManifest, envelope: ReturnType<typeof parseKeyring>, key: CryptoKey): Promise<OpenVault> {
    const ring = await openKeyring(envelope, key, m.build);
    const sealed = await this.get(sealedPath(m.build, ring.manifest.kid));
    if (sealed === undefined) throw new SealError("format", "no manifest");
    const manifest = parseManifest(await openFile("manifest", fromB64url(ring.manifest.key), m.build, ring.manifest.kid, sealed));
    const notes = manifest.notes.filter((n) => isSafePath(n.path));
    const byPath = new Map(notes.map((n) => [n.path, n]));
    return {
      owner: manifest.owner,
      notes: notes.map(({ path, title, updated }) => ({ path, title, updated })),
      read: async (path) => {
        const entry: ManifestEntry | undefined = byPath.get(path);
        if (!entry) throw new Error(`No private note at ${path}`);
        const text = await this.get(sealedPath(m.build, entry.kid));
        if (text === undefined) throw new SealError("format", "missing note");
        return decodeText(await openFile("note", fromB64url(entry.key), m.build, entry.kid, text));
      },
    };
  }
}

export interface OpenVault {
  /** The instance owner's GitHub name, shown in the account pill. */
  owner: string;
  notes: PublicNote[];
  read(path: string): Promise<string>;
}
