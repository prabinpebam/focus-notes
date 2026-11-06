import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, open, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";
import { crc32 } from "node:zlib";
import { imageDestinations } from "@focus-notes/core";
import { copyNoteMedia } from "../src/main/note-media.ts";
import { validateNoteImages } from "../src/main/note-move.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "fn-media-copy-"));
  folders.push(root);
  const source = join(root, "private"), destination = join(root, "public");
  await mkdir(join(source, "notes"), { recursive: true });
  await mkdir(join(source, "assets", "images"), { recursive: true });
  await mkdir(join(destination, "notes"), { recursive: true });
  const from = join(source, "notes", "a.md"), to = join(destination, "notes", "a.md");
  const asset = join(source, "assets", "images", "p.png");
  await writeFile(asset, png);
  const text = '\uFEFF# A\r\n\r\n<!-- image: wide rounded -->\r\n![Alt](../assets/images/p.png "Caption")\r\n\r\n![same][id]\r\n\r\n[id]: ../assets/images/p.png\r\n';
  await writeFile(from, text);
  return { root, source, destination, from, to, asset, text };
}
describe("IMG-05 authorized media copies", () => {
  it("copies referenced media before destination references and keeps every other Markdown byte and original source", async () => {
    const f = await setup();
    const result = await copyNoteMedia(f.text, f.from, f.to, f.source, f.destination, false);
    expect(result.paths).toHaveLength(1);
    const rel = relative(join(f.destination, "notes"), result.paths[0]!).split(sep).join("/");
    expect(result.text).toBe(f.text.replaceAll("../assets/images/p.png", rel));
    await validateNoteImages(result.text, f.to, f.destination);
    expect(await readFile(f.from, "utf8")).toBe(f.text);
    expect(await readFile(f.asset)).toEqual(png);
    expect(await readFile(result.paths[0]!)).toEqual(png);
    await expect(readFile(f.to)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("refuses a missing asset before writing destination files", async () => {
    const f = await setup();
    await expect(copyNoteMedia(f.text + "\n![gone](missing.png)", f.from, f.to, f.source, f.destination, false)).rejects.toThrow("missingImage");
    expect(await readdir(f.destination)).toEqual(["notes"]);
    expect(await readFile(f.from, "utf8")).toBe(f.text);
  });
  it("never overwrites an asset collision", async () => {
    const f = await setup();
    const id = "00000000-0000-4000-8000-000000000001";
    await mkdir(join(f.destination, "assets", "images"), { recursive: true });
    const collision = join(f.destination, "assets", "images", `${id}.png`);
    await writeFile(collision, "other asset");
    vi.mocked(randomUUID).mockReturnValueOnce(id);
    await expect(copyNoteMedia(f.text, f.from, f.to, f.source, f.destination, false)).rejects.toThrow("taken");
    expect(await readFile(collision, "utf8")).toBe("other asset");
    expect(await readFile(f.asset)).toEqual(png);
  });
  it("strips private ancillary metadata from public copies while leaving the source unchanged", async () => {
    const f = await setup();
    const data = Buffer.from("Comment\0GPS SECRET");
    const body = Buffer.concat([Buffer.from("tEXt"), data]);
    const length = Buffer.alloc(4), crc = Buffer.alloc(4);
    length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(body));
    const original = Buffer.concat([png.subarray(0, 33), length, body, crc, png.subarray(33)]);
    await writeFile(f.asset, original);
    const result = await copyNoteMedia(f.text, f.from, f.to, f.source, f.destination, true);
    expect(await readFile(result.paths[0]!)).toEqual(png);
    expect(await readFile(f.asset)).toEqual(original);
  });
  it("preserves source notes and images when the destination is read-only", async () => {
    const f = await setup();
    vi.mocked(open).mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
    await expect(copyNoteMedia(f.text, f.from, f.to, f.source, f.destination, false)).rejects.toMatchObject({ code: "EACCES" });
    expect(await readFile(f.from, "utf8")).toBe(f.text);
    expect(await readFile(f.asset)).toEqual(png);
    await expect(readFile(f.to)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("does not copy unreferenced assets, and uses the caller's junction root spelling", async () => {
    const f = await setup();
    await writeFile(join(f.source, "assets", "images", "unreferenced.png"), "not authorized");
    const alias = `${f.destination}-alias`;
    folders.push(alias);
    await symlink(f.destination, alias, process.platform === "win32" ? "junction" : "dir");
    const result = await copyNoteMedia(f.text, f.from, join(alias, "notes", "copy.md"), f.source, alias, false);
    expect(result.paths[0]!.startsWith(alias + sep)).toBe(true);
    expect(await readdir(join(alias, "assets", "images"))).toHaveLength(1);
    expect(imageDestinations(result.text)).toHaveLength(2);
  });
  it("copies into a standalone destination sidecar without changing the source", async () => {
    const f = await setup();
    const to = join(f.root, "copy.md");
    const result = await copyNoteMedia(f.text, f.from, to, f.source, undefined, false);
    expect(result.paths[0]!.startsWith(join(f.root, "copy.md.assets", "images") + sep)).toBe(true);
    await validateNoteImages(result.text, to, f.root);
    expect(await readFile(f.from, "utf8")).toBe(f.text);
  });
  it("copies a cropped image's kept original (originalSrc) too, rewriting both and keeping the comment's other words", async () => {
    const f = await setup();
    await writeFile(join(f.source, "assets", "images", "o.png"), png);
    const text = "<!-- image: wide originalSrc=../assets/images/o.png -->\n![A](../assets/images/p.png)\n";
    const result = await copyNoteMedia(text, f.from, f.to, f.source, f.destination, true);
    expect(result.paths).toHaveLength(2);
    const [original, cropped] = result.paths.map(p => relative(join(f.destination, "notes"), p).split(sep).join("/"));
    expect(result.text).toBe(`<!-- image: wide originalSrc=${original} -->\n![A](${cropped})\n`);
    await validateNoteImages(result.text, f.to, f.destination);
    expect(await readFile(join(f.source, "assets", "images", "o.png"))).toEqual(png);
  });
  it("resolves images from the source text and writes them into the link-rewritten destination text", async () => {
    const f = await setup();
    const source = "[n](other.md)\n![A](../assets/images/p.png)\n";
    const planned = "[n](../../private/notes/other.md)\n![A](../assets/images/p.png)\n";
    const result = await copyNoteMedia(planned, f.from, f.to, f.source, f.destination, false, source);
    const rel = relative(join(f.destination, "notes"), result.paths[0]!).split(sep).join("/");
    expect(result.text).toBe(`[n](../../private/notes/other.md)\n![A](${rel})\n`);
  });
  it("removes only its own fresh copies when a later image fails", async () => {
    const f = await setup();
    await writeFile(join(f.source, "assets", "images", "q.png"), png);
    const text = "![A](../assets/images/p.png)\n![B](../assets/images/q.png)\n";
    const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(open).mockImplementationOnce(actual.open as typeof open).mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
    await expect(copyNoteMedia(text, f.from, f.to, f.source, f.destination, true)).rejects.toMatchObject({ code: "EACCES" });
    expect(await readdir(join(f.destination, "assets", "images"))).toEqual([]);
    expect(await readFile(f.asset)).toEqual(png);
    expect(await readFile(join(f.source, "assets", "images", "q.png"))).toEqual(png);
  });
});
