/**
 * The publisher (WP-6.3, WP-6.4): run by each instance's Deploy app workflow after the app is in the
 * site folder. It publishes `notes/` with an index, seals the owner's private notes as the vault (a
 * share grant with an audience of one, D-41, D-90), writes the site manifest, and runs the leak check
 * (SEC-06) so no private text or file name ever reaches the site. Node only.
 */
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import {
  encodeText, fromB64url, isSafePath, KDF, PUBLIC_INDEX, KEY_BYTES, randomBytes, randomId, sealedPath, sealFile, sealKeyring, SALT_BYTES, titleOf, toB64url, vaultPath,
  derivePasscodeBits, type Manifest, type ManifestEntry, type PublicIndex, type SiteManifest,
} from "./format.ts";
import {
  activeShareGrants, deriveLinkBits, GRANT_ID, grantScope, inScope, isActive, keyringRole, keyringSaltFor, LINK_KDF, normalizeName, LINK_SECRET_BYTES, linkKeyringPath, nameLookup, noteId, passcodeKeyringPath, scopedPaths,
  type AccessFile, type Grant,
} from "./grants.ts";
import { passcodeProblem } from "./access.ts";

export type { AccessFile, Grant } from "./grants.ts";

export interface PublishOptions {
  site: string;
  /** The instance's public notes folder. Missing means no public notes. */
  notes?: string;
  /** The private repository's checkout. Missing, or without access.json, means no vault. */
  private?: string;
  /** The instance owner's GitHub name, shown to the owner once unlocked. */
  owner: string;
  /** When each note last changed (from Git in the workflow); file times otherwise. */
  updated?: (file: string) => Promise<string>;
  /**
   * The page renderer's folder (`apps/web/dist-reader`, or the release bundle's): `render.mjs` and its
   * `assets/`. With it, each public note is also a static page at `/n/<path>/` (WP-5.1, SHR-03).
   */
  reader?: string;
  /** The site's address (configure-pages' base_url), for canonical links. */
  siteUrl?: string;
  /** Fixed build ID, for tests. */
  build?: string;
  log?: (line: string) => void;
}
export interface PublishResult { build: string; publicNotes: number; publicPages: number; privateNotes: number; vault: boolean; shares: number }

/** The page renderer's interface (apps/web/reader/render.ts), loaded from its built module. */
interface PageRenderer {
  renderNotePage(input: { markdown: string; path: string; updated: string; publicPaths: ReadonlySet<string>; siteUrl?: string; assets: { css: readonly string[]; fonts: readonly string[] } }): { file: string; html: string };
}

async function markdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    let entries;
    try { entries = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      // Only real files: a symlink could point a public name at a private note.
      else if (e.isFile() && /\.(md|markdown)$/i.test(e.name)) out.push(relative(dir, p).split(sep).join("/"));
    }
  };
  await walk(dir);
  return out.sort();
}
const exists = (p: string) => stat(p).then(() => true, () => false);
async function put(file: string, data: string) {
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, data);
}

export function validateAccess(a: unknown): AccessFile {
  const f = a as AccessFile;
  if (f?.version !== 1 || !Array.isArray(f.grants)) throw new Error("private/access.json: expected { version: 1, grants: [] } (schemas/access.schema.json)");
  for (const g of f.grants) {
    if (typeof g?.id !== "string" || !GRANT_ID.test(g.id) || typeof g.name !== "string" || typeof g.salt !== "string" || typeof g.createdAt !== "string") {
      throw new Error("private/access.json: a grant is malformed.");
    }
    const bad = (what: string) => { throw new Error(`private/access.json: a grant ${what}.`); };
    try { if (fromB64url(g.salt).length !== SALT_BYTES) bad("needs a 16-byte salt"); } catch { bad("needs a 16-byte salt"); }
    try { if (g.passcodeKey !== undefined && fromB64url(g.passcodeKey).length !== KEY_BYTES) bad("has a malformed passcodeKey"); } catch { bad("has a malformed passcodeKey"); }
    try { if (g.link !== undefined && fromB64url(g.link.secret).length !== LINK_SECRET_BYTES) bad("has a malformed link"); } catch { bad("has a malformed link"); }
    if (g.passcode !== undefined && (typeof g.passcode.value !== "string" || g.passcode.value.trim().length < 12)) bad("has a passcode shorter than 12 characters");
    if (typeof g.scope !== "object" || g.scope === null) bad("has no scope");
    if (!normalizeName(g.name)) bad("has an empty name");
    // Every passcode in force must resist offline guessing, generated or not: `generated` is just a field
    // in access.json, so it can't vouch for the value. The same rule as the app (passcodeProblem: 16 or
    // more characters, or 3 or more different words, then the strength estimate), so a hand-edited file
    // can't get past it; four EFF words always pass (SHR-07, D-134). The message never quotes the value.
    if (g.passcode && !g.owner && !g.revokedAt && passcodeProblem(g.passcode.value)) bad("has a passcode that's too easy to guess (use 16 or more characters, or 3 or more words, or generate one)");
  }
  if (f.nameSalt !== undefined) {
    let ok = false;
    try { const n = fromB64url(f.nameSalt).length; ok = n >= SALT_BYTES && n <= 64; } catch { /* reported below */ }
    if (!ok) throw new Error("private/access.json: nameSalt needs 16 to 64 bytes.");
  }
  if (f.grants.filter((g) => g.owner && !g.revokedAt).length > 1) throw new Error("private/access.json: more than one owner grant");
  if (new Set(f.grants.map((g) => g.id)).size !== f.grants.length) throw new Error("private/access.json: two grants have the same ID.");
  return f;
}

export async function publish(o: PublishOptions): Promise<PublishResult> {
  const log = o.log ?? (() => {});
  const build = o.build ?? randomId("", 16);
  const updated = o.updated ?? (async (f: string) => (await stat(f)).mtime.toISOString());

  // Public notes: copied as they are, with an index the app reads without GitHub's API.
  const publicFiles = o.notes ? await markdownFiles(o.notes) : [];
  const index: PublicIndex = { format: 1, notes: [] };
  const texts = new Map<string, string>();
  for (const path of publicFiles) {
    if (!isSafePath(path)) { log(`Skipped a public note with an unusable name.`); continue; }
    const text = await readFile(join(o.notes!, path), "utf8");
    texts.set(path, text);
    await put(join(o.site, "notes", ...path.split("/")), text);
    index.notes.push({ path, title: titleOf(path, text), updated: await updated(join(o.notes!, path)) });
  }
  await put(join(o.site, "notes", "index.json"), JSON.stringify(index));

  // Public pages (WP-5.1): each public note rendered once, read-only, at /n/<path>/, with the pages'
  // stylesheet and fonts beside the app's in assets/ (their names are content hashes).
  let publicPages = 0;
  if (o.reader) {
    const renderer = (await import(pathToFileURL(join(o.reader, "render.mjs")).href)) as PageRenderer;
    const assetFiles = await readdir(join(o.reader, "assets"));
    await cp(join(o.reader, "assets"), join(o.site, "assets"), { recursive: true });
    const assets = { css: assetFiles.filter((f) => f.endsWith(".css")), fonts: assetFiles.filter((f) => /\.woff2?$/.test(f)) };
    const publicPaths = new Set(index.notes.map((n) => n.path));
    for (const n of index.notes) {
      const { file, html } = renderer.renderNotePage({ markdown: texts.get(n.path)!, path: n.path, updated: n.updated, publicPaths, ...(o.siteUrl ? { siteUrl: o.siteUrl } : {}), assets });
      await put(join(o.site, ...file.split("/").map(decodeURIComponent)), html);
      publicPages++;
    }
  }

  // The vault (the owner's grant, every private note) and each active share grant.
  let privateTexts: { path: string; text: string }[] = [];
  let vault = false;
  let shares = 0;
  let sealedNotes = 0;
  let nameSalt: string | undefined;
  const secrets: string[] = [];
  const names: string[] = [];
  const accessFile = o.private ? join(o.private, "access.json") : "";
  if (o.private && (await exists(accessFile))) {
    // Errors from the private tree never quote it: the Actions log is public.
    let raw: unknown;
    try { raw = JSON.parse(await readFile(accessFile, "utf8")); } catch { throw new Error("private/access.json couldn't be read as JSON."); }
    const access = validateAccess(raw);
    // Every grant's secrets, in force or not, are checked for leaks along with the private text.
    for (const g of access.grants) {
      secrets.push(...[g.link?.secret, g.passcode?.value, g.passcodeKey].filter((s): s is string => !!s));
      if (!g.owner) names.push(g.name);
    }
    const root = join(o.private, "notes");
    const files = await markdownFiles(root);
    privateTexts = await Promise.all(files.map(async (path) => {
      try { return { path, text: await readFile(join(root, path), "utf8") }; } catch { throw new Error("A private note couldn't be read."); }
    }));
    const notes = privateTexts.filter((n) => isSafePath(n.path)).map((n) => ({ ...n, id: noteId(n.text) }));
    const now = Date.now();
    const owner = access.grants.find((g) => g.owner && isActive(g, now) && g.passcodeKey);
    const shared = activeShareGrants(access, now);

    // Names must stay apart once normalized, or one audience's keyring would replace another's.
    // Published whenever there's an access.json, so its presence says nothing about passcode audiences.
    const salt = access.nameSalt ?? toB64url(randomBytes(SALT_BYTES));
    nameSalt = salt;
    const lookups = new Map<Grant, string>();
    for (const g of shared) if (g.passcode) lookups.set(g, await nameLookup(salt, g.name));
    if (new Set(lookups.values()).size !== lookups.size) throw new Error("private/access.json: two active audiences have the same name.");

    // Each note is sealed once this build, with its own fresh key, and listed by every manifest that opens it.
    const sealedByPath = new Map<string, ManifestEntry>();
    const sealNote = async (n: (typeof notes)[number]): Promise<ManifestEntry> => {
      const done = sealedByPath.get(n.path);
      if (done) return done;
      const kid = randomId(), key = randomBytes(KEY_BYTES);
      await put(join(o.site, ...sealedPath(build, kid).split("/")), await sealFile("note", key, build, kid, encodeText(n.text)));
      const entry = { kid, key: toB64url(key), path: n.path, title: titleOf(n.path, n.text), updated: await updated(join(root, n.path)) };
      sealedByPath.set(n.path, entry);
      return entry;
    };
    /** Seals one grant's manifest of what it opens, and returns the keyring payload that opens it. */
    const sealManifest = async (g: Grant) => {
      const scope = grantScope(g);
      const opens = notes.filter((n) => inScope(scope, n));
      const shown = scopedPaths(scope, opens.map((n) => n.path));
      const manifest: Manifest = { owner: o.owner, notes: [] };
      for (const n of opens) manifest.notes.push({ ...(await sealNote(n)), path: shown.get(n.path)! });
      const kid = randomId(), key = randomBytes(KEY_BYTES);
      await put(join(o.site, ...sealedPath(build, kid).split("/")), await sealFile("manifest", key, build, kid, encodeText(JSON.stringify(manifest))));
      // A fixed-width expiry (only active grants get here, so it parses), and the payload is padded: every keyring is the same size.
      return { grant: g.id, expiresAt: g.expiresAt ? new Date(g.expiresAt).toISOString() : null, manifest: { kid, key: toB64url(key) } };
    };
    const at = (path: string) => join(o.site, ...path.split("/"));

    if (owner) {
      const payload = await sealManifest(owner);
      await put(at(vaultPath(build)), await sealKeyring(fromB64url(owner.passcodeKey!), fromB64url(owner.salt), build, payload, KDF, keyringRole.vault));
      vault = true;
    }
    for (const g of shared) {
      const payload = await sealManifest(g);
      // Each keyring has its own salt from the grant's, and names its role and grant in its additional data.
      const grantSalt = fromB64url(g.salt);
      if (g.link) {
        const s = await keyringSaltFor(grantSalt, "link");
        await put(at(linkKeyringPath(build, g.id)), await sealKeyring(await deriveLinkBits(fromB64url(g.link.secret), s, g.id), s, build, payload, LINK_KDF, keyringRole.link(g.id)));
      }
      if (g.passcode) {
        const s = await keyringSaltFor(grantSalt, "passcode"), lookup = lookups.get(g)!;
        await put(at(passcodeKeyringPath(build, lookup)), await sealKeyring(await derivePasscodeBits(g.passcode.value, s), s, build, payload, KDF, keyringRole.passcode(lookup)));
      }
      shares++;
    }
    sealedNotes = sealedByPath.size;
  }

  const site: SiteManifest = { format: 1, build, notes: PUBLIC_INDEX, vault, ...(nameSalt ? { nameSalt } : {}) };
  await put(join(o.site, "focus-notes.json"), JSON.stringify(site));

  const leaks = await leakCheck(o.site, privateTexts, secrets, names);
  if (leaks.length) throw new LeakError(leaks);
  const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
  log(`Published ${count(index.notes.length, "public note")}${o.reader ? ` (${count(publicPages, "page")})` : ""}${sealedNotes ? ` and sealed ${count(sealedNotes, "private note")}` : ""}${vault ? " in the vault" : ""}${shares ? ` for ${count(shares, "share audience")}` : ""}. Leak check passed.`);
  return { build, publicNotes: index.notes.length, publicPages, privateNotes: sealedNotes, vault, shares };
}

export class LeakError extends Error {
  readonly findings: { file: string; kind: LeakKind }[];
  constructor(findings: { file: string; kind: LeakKind }[]) {
    // Never print the private text or name itself: the Actions log is public.
    super(`Leak check failed: private content found in ${findings.length} place(s): ${findings.map((f) => `${f.file} (${f.kind})`).join(", ")}`);
    this.findings = findings;
  }
}

const TEXT_FILE = /\.(html?|js|mjs|css|json|md|markdown|txt|xml|svg|map|webmanifest)$/i;
/** Lines of private text this long or longer must never appear in the site (SEC-06). */
export const LEAK_MIN_LINE = 24;
/** Shorter paths ("Todo.md") are too common to mean anything, and would fail on the app's own files. */
export const LEAK_MIN_PATH = 12;

/** Audience names this long or longer must never appear in the site; shorter ones ("Sam") are too common to test. */
export const LEAK_MIN_NAME = 6;
/**
 * Where an audience name counts as a leak: only what the publisher generates for sealing, the keyrings
 * (`_access/`), sealed files (`_sealed/`), and the site manifest. Public notes, their index, and their
 * pages may mention the person by name ("Lunch with Alexander"), so they're never searched for names.
 */
const NAME_SCOPE = (file: string) => file.startsWith("_access/") || file.startsWith("_sealed/") || file === "focus-notes.json";

/** A secret as it might be written: as stored, in Unicode NFC and NFD, base64url as standard base64, URI-encoded, and JSON-escaped. */
export function secretForms(secret: string): string[] {
  const s = secret.trim();
  if (!s) return [];
  const forms = [s, s.normalize("NFC"), s.normalize("NFD")];
  // Unpadded standard base64 is a prefix of the padded form, so it finds both.
  if (/^[A-Za-z0-9_-]+$/.test(s)) forms.push(s.replace(/-/g, "+").replace(/_/g, "/"));
  return [...new Set(forms.flatMap(encodedForms))];
}
/** A string as it is, URI-encoded (`%20`), and as it reads inside a JSON string (`\"`, `\\`). */
const encodedForms = (s: string) => [s, encodeURIComponent(s), JSON.stringify(s).slice(1, -1)];

/** Fields that hold ciphertext or random bytes, where a name can turn up by chance: never searched for names. */
const CIPHERTEXT_FIELDS = new Set(["data", "iv", "salt", "nameSalt"]);
/**
 * What a file in NAME_SCOPE says in its own words: a JSON file's keys and string values, apart from
 * ciphertext fields; anything else, or JSON that doesn't parse, is searched whole.
 */
function plainText(file: string, body: string): string {
  if (!file.endsWith(".json")) return body;
  let value: unknown;
  try { value = JSON.parse(body); } catch { return body; }
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { out.push(k); if (!CIPHERTEXT_FIELDS.has(k)) walk(x); }
  };
  walk(value);
  return out.join("\n");
}
const mentions = (text: string, words: readonly string[]) => words.some((w) => text.includes(w));

/**
 * Every text file in the site is searched for each private note's path, each long line of its text,
 * every grant secret in each of its forms, and (in NAME_SCOPE only, outside ciphertext) every audience
 * name of LEAK_MIN_NAME characters or more, as written, in NFC, and normalized as the lookup does it (SEC-06).
 */
export async function leakCheck(
  site: string, notes: { path: string; text: string }[], secrets: readonly string[] = [], names: readonly string[] = [],
): Promise<{ file: string; kind: LeakKind }[]> {
  if (!notes.length && !secrets.length && !names.length) return [];
  const paths = notes.map((n) => n.path).filter((p) => p.length >= LEAK_MIN_PATH);
  const lines = [...new Set(notes.flatMap((n) => n.text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= LEAK_MIN_LINE)))];
  // Secrets of any length: a passcode is at least 12 characters, links and keys 43.
  const keys = [...new Set(secrets.flatMap(secretForms))];
  const audiences = [...new Set(names.map((n) => n.trim()).filter((n) => n.length >= LEAK_MIN_NAME)
    .flatMap((n) => [n, n.normalize("NFC"), normalizeName(n)]).filter((n) => n.length >= LEAK_MIN_NAME).flatMap(encodedForms))];
  const found: { file: string; kind: LeakKind }[] = [];
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      if (!TEXT_FILE.test(e.name)) continue;
      const body = await readFile(p, "utf8");
      const file = relative(site, p).split(sep).join("/");
      if (keys.some((x) => body.includes(x))) found.push({ file, kind: "secret" });
      else if (NAME_SCOPE(file) && mentions(plainText(file, body), audiences)) found.push({ file, kind: "name" });
      else if (paths.some((x) => body.includes(x))) found.push({ file, kind: "path" });
      else if (lines.some((x) => body.includes(x))) found.push({ file, kind: "text" });
    }
  };
  await walk(site);
  return found;
}
export type LeakKind = "path" | "text" | "secret" | "name";
