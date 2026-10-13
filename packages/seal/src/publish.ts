/**
 * The publisher (WP-6.3, WP-6.4): run by each instance's Deploy app workflow after the app is in the
 * site folder. It publishes `notes/` with an index, seals the owner's private notes as the vault (a
 * share grant with an audience of one, D-41, D-90), writes the site manifest, and runs the leak check
 * (SEC-06) so no private text or file name ever reaches the site. Node only.
 */
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import {
  encodeText, fromB64url, isSafePath, PUBLIC_INDEX, KEY_BYTES, randomBytes, randomId, sealedPath, sealFile, sealKeyring, SALT_BYTES, titleOf, toB64url, vaultPath,
  type Manifest, type PublicIndex, type SiteManifest,
} from "./format.ts";

export interface Grant {
  id: string;
  name: string;
  owner?: boolean;
  salt: string;
  /** PBKDF2-SHA256 of the passphrase (format.derivePasscodeBits). The passphrase itself is never stored. */
  passcodeKey?: string;
  scope: { all?: boolean; notes?: string[]; folders?: string[] };
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
}
export interface AccessFile { version: 1; nameSalt?: string; grants: Grant[] }

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
  /** Fixed build ID, for tests. */
  build?: string;
  log?: (line: string) => void;
}
export interface PublishResult { build: string; publicNotes: number; privateNotes: number; vault: boolean }

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
    if (typeof g?.id !== "string" || !/^[A-Za-z0-9_-]{8,}$/.test(g.id) || typeof g.name !== "string" || typeof g.salt !== "string" || typeof g.createdAt !== "string") {
      throw new Error("private/access.json: a grant is malformed.");
    }
    const bad = (what: string) => { throw new Error(`private/access.json: a grant ${what}.`); };
    try { if (fromB64url(g.salt).length !== SALT_BYTES) bad("needs a 16-byte salt"); } catch { bad("needs a 16-byte salt"); }
    try { if (g.passcodeKey !== undefined && fromB64url(g.passcodeKey).length !== KEY_BYTES) bad("has a malformed passcodeKey"); } catch { bad("has a malformed passcodeKey"); }
  }
  if (f.grants.filter((g) => g.owner && !g.revokedAt).length > 1) throw new Error("private/access.json: more than one owner grant");
  return f;
}

export async function publish(o: PublishOptions): Promise<PublishResult> {
  const log = o.log ?? (() => {});
  const build = o.build ?? randomId("", 16);
  const updated = o.updated ?? (async (f: string) => (await stat(f)).mtime.toISOString());

  // Public notes: copied as they are, with an index the app reads without GitHub's API.
  const publicFiles = o.notes ? await markdownFiles(o.notes) : [];
  const index: PublicIndex = { format: 1, notes: [] };
  for (const path of publicFiles) {
    if (!isSafePath(path)) { log(`Skipped a public note with an unusable name.`); continue; }
    const text = await readFile(join(o.notes!, path), "utf8");
    await put(join(o.site, "notes", ...path.split("/")), text);
    index.notes.push({ path, title: titleOf(path, text), updated: await updated(join(o.notes!, path)) });
  }
  await put(join(o.site, "notes", "index.json"), JSON.stringify(index));

  // The vault: the owner's grant opens every private note.
  let privateTexts: { path: string; text: string }[] = [];
  let vault = false;
  const accessFile = o.private ? join(o.private, "access.json") : "";
  if (o.private && (await exists(accessFile))) {
    // Errors from the private tree never quote it: the Actions log is public.
    let raw: unknown;
    try { raw = JSON.parse(await readFile(accessFile, "utf8")); } catch { throw new Error("private/access.json couldn't be read as JSON."); }
    const access = validateAccess(raw);
    const root = join(o.private, "notes");
    const files = await markdownFiles(root);
    privateTexts = await Promise.all(files.map(async (path) => {
      try { return { path, text: await readFile(join(root, path), "utf8") }; } catch { throw new Error("A private note couldn't be read."); }
    }));
    const owner = access.grants.find((g) => g.owner && !g.revokedAt && (!g.expiresAt || Date.parse(g.expiresAt) > Date.now()));
    if (owner?.passcodeKey) {
      const manifest: Manifest = { owner: o.owner, notes: [] };
      for (const n of privateTexts) {
        if (!isSafePath(n.path)) continue;
        const kid = randomId(), key = randomBytes(KEY_BYTES);
        await put(join(o.site, ...sealedPath(build, kid).split("/")), await sealFile("note", key, build, kid, encodeText(n.text)));
        manifest.notes.push({ kid, key: toB64url(key), path: n.path, title: titleOf(n.path, n.text), updated: await updated(join(root, n.path)) });
      }
      const mkid = randomId(), mkey = randomBytes(KEY_BYTES);
      await put(join(o.site, ...sealedPath(build, mkid).split("/")), await sealFile("manifest", mkey, build, mkid, encodeText(JSON.stringify(manifest))));
      await put(join(o.site, ...vaultPath(build).split("/")), await sealKeyring(fromB64url(owner.passcodeKey), fromB64url(owner.salt), build, {
        grant: owner.id, expiresAt: owner.expiresAt ?? null, manifest: { kid: mkid, key: toB64url(mkey) },
      }));
      vault = true;
    }
    // Share grants for other audiences are sealed in M5 (WP-5.2) with this same format.
  }

  const site: SiteManifest = { format: 1, build, notes: PUBLIC_INDEX, vault };
  await put(join(o.site, "focus-notes.json"), JSON.stringify(site));

  const leaks = await leakCheck(o.site, privateTexts);
  if (leaks.length) throw new LeakError(leaks);
  const count = (n: number, what: string) => `${n} ${what}${n === 1 ? "" : "s"}`;
  log(`Published ${count(index.notes.length, "public note")}${vault ? ` and sealed ${count(privateTexts.length, "private note")}` : ""}. Leak check passed.`);
  return { build, publicNotes: index.notes.length, privateNotes: vault ? privateTexts.length : 0, vault };
}

export class LeakError extends Error {
  readonly findings: { file: string; kind: "path" | "text" }[];
  constructor(findings: { file: string; kind: "path" | "text" }[]) {
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

/** Every text file in the site is searched for each private note's path and each long line of its text (SEC-06). */
export async function leakCheck(site: string, notes: { path: string; text: string }[]): Promise<{ file: string; kind: "path" | "text" }[]> {
  if (!notes.length) return [];
  const paths = notes.map((n) => n.path).filter((p) => p.length >= LEAK_MIN_PATH);
  const lines = [...new Set(notes.flatMap((n) => n.text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length >= LEAK_MIN_LINE)))];
  const found: { file: string; kind: "path" | "text" }[] = [];
  const walk = async (d: string) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      if (!TEXT_FILE.test(e.name)) continue;
      const body = await readFile(p, "utf8");
      const file = relative(site, p).split(sep).join("/");
      if (paths.some((x) => body.includes(x))) found.push({ file, kind: "path" });
      else if (lines.some((x) => body.includes(x))) found.push({ file, kind: "text" });
    }
  };
  await walk(site);
  return found;
}
