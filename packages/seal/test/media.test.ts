/**
 * Images in code-shared notes (WP-9.6, IMG-06, SHR-23): each image a shared note references is sealed
 * like the note, under an opaque random name, and only the share's manifest holds its key and reference.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  encodeText, fromB64url, openFile, parseManifest, randomBytes, randomId, sealedPath, sealFile, sealKeyring, toB64url, KEY_BYTES,
  type Manifest, type MediaEntry,
} from "../src/format.ts";
import { deriveLinkBits, keyringRole, keyringSaltFor, LINK_KDF, LINK_SECRET_BYTES, linkKeyringPath } from "../src/grants.ts";
import { sealNoteMedia, type MediaCache } from "../src/media.ts";
import { SiteReader } from "../src/reader.ts";

const dirs: string[] = [];
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }); });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode("PRIVATE-PIXELS-7f3a")]);

async function project() {
  const base = await mkdtemp(join(tmpdir(), "fn-media-"));
  dirs.push(base);
  const root = join(base, "private"), site = join(base, "site");
  await mkdir(join(root, "notes", "trips"), { recursive: true });
  await mkdir(join(root, "assets", "images"), { recursive: true });
  await mkdir(site);
  await writeFile(join(root, "assets", "images", "q7m4k2.png"), PNG);
  const put = async (path: string, data: string) => {
    const file = join(site, ...path.split("/"));
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, data);
  };
  return { root, site, put, ctx: (build = randomId()) => ({ root, notes: join(root, "notes"), build, put, cache: new Map() as MediaCache }) };
}
async function files(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...await files(join(dir, e.name), `${prefix}${e.name}/`));
    else out.push(`${prefix}${e.name}`);
  }
  return out;
}

describe("sealing a shared note's images (WP-9.6)", () => {
  it("seals referenced image bytes under opaque names; they open byte-exact and nothing plaintext reaches the site", async () => {
    const p = await project();
    const c = p.ctx();
    const media = await sealNoteMedia(c, "trips/day.md", ["../../assets/images/q7m4k2.png", "https://example.com/x.png", "#top", "../../assets/images/q7m4k2.png"]);
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ ref: "../../assets/images/q7m4k2.png", type: "image/png" });
    const out = await files(p.site);
    expect(out).toEqual([sealedPath(c.build, media[0]!.kid)]);
    const body = await readFile(join(p.site, out[0]!));
    expect(body.includes(Buffer.from("PRIVATE-PIXELS"))).toBe(false);
    expect(body.toString("utf8")).not.toMatch(/q7m4k2|assets|images|trips|day/);
    const opened = await openFile("media", fromB64url(media[0]!.key), c.build, media[0]!.kid, body.toString("utf8"));
    expect(Buffer.from(opened).equals(Buffer.from(PNG))).toBe(true);
    // Sealed as media, it isn't a note or a manifest.
    await expect(openFile("note", fromB64url(media[0]!.key), c.build, media[0]!.kid, body.toString("utf8"))).rejects.toThrow();
  });

  it("seals an image once per build, whichever note or spelling refers to it", async () => {
    const p = await project();
    await mkdir(join(p.root, "notes", "a"), { recursive: true });
    const c = p.ctx();
    const one = await sealNoteMedia(c, "trips/day.md", ["../../assets/images/q7m4k2.png"]);
    const two = await sealNoteMedia(c, "a/b.md", ["../../assets/images/./q7m4k2.png"]);
    expect(two[0]).toMatchObject({ kid: one[0]!.kid, key: one[0]!.key, ref: "../../assets/images/./q7m4k2.png" });
    expect(await files(p.site)).toHaveLength(1);
  });

  it.each([
    ["outside the project's images", "../../notes/trips/day.md"],
    ["escaping the project", "../../../outside.png"],
    ["missing", "../../assets/images/gone.png"],
    ["an unsupported type", "../../assets/images/doc.svg"],
  ])("blocks publication for an image %s, without naming it", async (_, ref) => {
    const p = await project();
    await writeFile(join(p.root, "notes", "trips", "day.md"), "# Day\n");
    await writeFile(join(p.root, "assets", "images", "doc.svg"), "<svg/>");
    await writeFile(join(p.root, "..", "outside.png"), PNG);
    const error = await sealNoteMedia(p.ctx(), "trips/day.md", [ref]).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toMatch(/gone|doc|svg|outside|day|trips|assets/);
    expect(await files(p.site)).toEqual([]);
  });

  it("decodes a percent-encoded reference to find the file and keeps the reference as written", async () => {
    const p = await project();
    await writeFile(join(p.root, "assets", "images", "a b.jpg"), PNG);
    const media = await sealNoteMedia(p.ctx(), "trips/day.md", ["../../assets/images/a%20b.jpg"]);
    expect(media[0]).toMatchObject({ ref: "../../assets/images/a%20b.jpg", type: "image/jpeg" });
  });
});

describe("the manifest's media entries", () => {
  const entry = { kid: "abcdefghijklmnop", key: "k", path: "a.md", title: "A", updated: "2026-11-23T00:00:00.000Z" };
  it("accepts well-formed media and refuses anything else", () => {
    const ok: Manifest = { owner: "ada", notes: [{ ...entry, media: [{ ref: "../i.png", kid: "bcdefghijklmnopq", key: "k", type: "image/png" }] }] };
    expect(parseManifest(encodeText(JSON.stringify(ok)))).toEqual(ok);
    for (const media of [{}, [{ ref: 1, kid: "bcdefghijklmnopq", key: "k", type: "image/png" }], [{ ref: "x", kid: "BAD", key: "k", type: "image/png" }],
      [{ ref: "x", kid: "bcdefghijklmnopq", key: "k", type: "image/svg+xml" }]]) {
      expect(() => parseManifest(encodeText(JSON.stringify({ owner: "ada", notes: [{ ...entry, media }] })))).toThrow();
    }
  });
});

describe("reading a shared note's images (WP-9.6)", () => {
  async function sharedSite(expiresAt: string | null) {
    const p = await project();
    const build = randomId(), id = "sgrantgrant1";
    const [media] = await sealNoteMedia(p.ctx(build), "trips/day.md", ["../../assets/images/q7m4k2.png"]) as [MediaEntry];
    const noteKid = randomId(), noteKey = randomBytes(KEY_BYTES);
    await p.put(sealedPath(build, noteKid), await sealFile("note", noteKey, build, noteKid, encodeText("# Day\n\n![Desk](../../assets/images/q7m4k2.png)\n")));
    const manifest: Manifest = { owner: "ada", notes: [{ kid: noteKid, key: toB64url(noteKey), path: "day.md", title: "Day", updated: "2026-11-23T00:00:00.000Z", media: [media] }] };
    const mKid = randomId(), mKey = randomBytes(KEY_BYTES);
    await p.put(sealedPath(build, mKid), await sealFile("manifest", mKey, build, mKid, encodeText(JSON.stringify(manifest))));
    const secret = randomBytes(LINK_SECRET_BYTES), salt = await keyringSaltFor(randomBytes(16), "link");
    await p.put(linkKeyringPath(build, id), await sealKeyring(await deriveLinkBits(secret, salt, id), salt, build,
      { grant: id, expiresAt, manifest: { kid: mKid, key: toB64url(mKey) } }, LINK_KDF, keyringRole.link(id)));
    await p.put("focus-notes.json", JSON.stringify({ format: 1, build, notes: "notes/index.json", vault: false }));
    const reader = new SiteReader(async (path) => readFile(join(p.site, ...path.split("/")), "utf8").catch(() => undefined));
    return { reader, id, secret: toB64url(secret), p, build, media };
  }

  it("opens an image of a shared note byte-exact with its type, and nothing it doesn't reference", async () => {
    const s = await sharedSite(null);
    const share = await s.reader.openLink(s.id, s.secret);
    const image = await share.media!("day.md", "../../assets/images/q7m4k2.png");
    expect(image.type).toBe("image/png");
    expect(Buffer.from(image.bytes).equals(Buffer.from(PNG))).toBe(true);
    await expect(share.media!("day.md", "../../assets/images/other.png")).rejects.toThrow();
    await expect(share.media!("nope.md", "../../assets/images/q7m4k2.png")).rejects.toThrow();
  });

  it("an expired or withdrawn share opens no image", async () => {
    const expired = await sharedSite(new Date(Date.now() - 60_000).toISOString());
    await expect(expired.reader.openLink(expired.id, expired.secret)).rejects.toThrow();
    const withdrawn = await sharedSite(null);
    // Withdrawal: the next publish leaves out the grant's keyring.
    await rm(join(withdrawn.p.site, ...linkKeyringPath(withdrawn.build, withdrawn.id).split("/")));
    await expect(withdrawn.reader.openLink(withdrawn.id, withdrawn.secret)).rejects.toThrow();
  });
});
