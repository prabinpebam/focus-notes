/**
 * Sealing the images a shared note references (WP-9.6, IMG-06, SHR-23). Node only, used by the
 * publisher. Each image is encrypted once per build with its own random key, written as
 * `_sealed/<build>/<random kid>.json`, and listed with its key only inside the note's sealed manifest
 * entry, so a share that can't open the manifest (withdrawn, expired) can't open its images either.
 * Errors never name the image: the publisher's log can be public.
 */
import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { KEY_BYTES, LIMITS, MEDIA_TYPES, randomBytes, randomId, sealedPath, sealFile, toB64url, type MediaEntry } from "./format.ts";

/** The image destinations a note's Markdown references, as written (the desktop finds them with its Markdown parser). */
export type MediaDestinations = (markdown: string) => readonly string[];
/** One build's sealed images by their real file, so each is sealed once whichever note refers to it. */
export type MediaCache = Map<string, Promise<Omit<MediaEntry, "ref">>>;
export interface MediaContext {
  /** The private project's root; its images live in `assets/images/`. */
  root: string;
  /** Where note paths start (`<root>/notes`). */
  notes: string;
  build: string;
  /** Writes one file of the site, by its path from the site's root. */
  put(path: string, data: string): Promise<void>;
  cache: MediaCache;
}

/** A destination that names a file in the project, not another site, a data URL or a place in the note. */
const isLocal = (ref: string) => Boolean(ref) && !/^[a-z][a-z0-9+.-]*:/i.test(ref) && !ref.startsWith("//") && !ref.startsWith("#");
const inside = (root: string, path: string) => {
  const r = relative(root, path);
  return Boolean(r) && r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r);
};

export async function sealNoteMedia(ctx: MediaContext, notePath: string, destinations: readonly string[]): Promise<MediaEntry[]> {
  const out = new Map<string, MediaEntry>();
  const images = join(ctx.root, "assets", "images");
  for (const ref of destinations) {
    if (!isLocal(ref) || out.has(ref)) continue;
    let decoded: string;
    try { decoded = decodeURIComponent(ref.replace(/[?#].*$/, "")); } catch { throw new Error("A shared note refers to an image it can't use."); }
    const file = resolve(dirname(join(ctx.notes, ...notePath.split("/"))), decoded);
    const type = MEDIA_TYPES[extname(file).slice(1).toLowerCase()];
    if (!type) throw new Error("A shared note refers to an image of a type that can't be shared.");
    let real: string, realImages: string;
    try { [real, realImages] = await Promise.all([realpath(file), realpath(images)]); } catch { throw new Error("A shared note's image couldn't be read."); }
    if (!inside(realImages, real)) throw new Error("A shared note refers to an image that isn't one of this project's images.");
    let sealed = ctx.cache.get(real);
    if (!sealed) {
      sealed = (async () => {
        let bytes: Uint8Array<ArrayBuffer>;
        try { bytes = new Uint8Array(await readFile(real)); } catch { throw new Error("A shared note's image couldn't be read."); }
        if (bytes.length > LIMITS.media) throw new Error("A shared note's image is too large to share.");
        const kid = randomId(), key = randomBytes(KEY_BYTES);
        await ctx.put(sealedPath(ctx.build, kid), await sealFile("media", key, ctx.build, kid, bytes));
        return { kid, key: toB64url(key), type };
      })();
      ctx.cache.set(real, sealed);
    }
    out.set(ref, { ref, ...(await sealed) });
  }
  return [...out.values()];
}
