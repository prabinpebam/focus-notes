/**
 * Reading an instance's site in the browser (PKG-08, PKG-10): its public notes, and its vault once the
 * owner's passphrase (or a key this browser remembered) opens it. Read-only by construction.
 */
import {
  decodeText, derivePasscodeKey, KDF, LIMITS, fromB64url, isSafePath, keyringSalt, openFile, openKeyring, parseKeyring, parseManifest,
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
    return generic(async () => {
      const m = await this.manifest();
      if (!m || !GRANT_ID.test(id)) throw new SealError("key");
      const text = await this.get(linkKeyringPath(m.build, id));
      if (text === undefined) throw new SealError("key");
      const envelope = parseKeyring(text, LINK_KDF);
      // The keyring names its grant, so it must be the one the link asked for (D-117).
      return this.#open(m, envelope, await deriveLinkKey(fromB64url(secret), keyringSalt(envelope), id), keyringRole.link(id), id);
    });
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
  notes: PublicNote[];
  read(path: string): Promise<string>;
}
