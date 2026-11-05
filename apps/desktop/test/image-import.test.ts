import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { IMAGE_BYTE_LIMIT, imageInputsFromPaths, importImages, rasterInfo } from "../src/main/image-import.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const input = (data = png) => ({ data: `data:image/png;base64,${data.toString("base64")}` });
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "fn-image-test-"));
  roots.push(root);
  const note = join(root, "notes", "Plan.md");
  await mkdir(join(root, "notes"));
  await writeFile(note, "# Plan\n");
  return { root, note };
}
describe("image ingestion validates before managed writes", () => {
  it("uses opaque names and preserves original bytes in project assets", async () => {
    const { root, note } = await setup();
    const decode = vi.fn(async (path: string) => { expect(await readFile(path)).toEqual(png); });
    const result = await importImages(note, root, [input(), input()], decode);
    expect(decode).toHaveBeenCalledTimes(2);
    expect(result.images).toEqual(result.paths.map((path) => ({ src: `../assets/images/${path.split(/[\\/]/).at(-1)}`, width: 1, height: 1 })));
    expect(new Set(result.paths).size).toBe(2);
    for (const path of result.paths) {
      expect(path).toMatch(/[0-9a-f-]{36}\.png$/);
      expect(await readFile(path)).toEqual(png);
    }
    expect(await readFile(note, "utf8")).toBe("# Plan\n");
  });
  it("keeps standalone images beside the note", async () => {
    const { note } = await setup();
    const result = await importImages(note, undefined, [input()], async () => {});
    expect(result.images[0]?.src).toMatch(/^Plan\.md\.assets\/images\/[0-9a-f-]+\.png$/);
  });
  it("refuses a batch containing an oversize image and writes no asset directory", async () => {
    const { root, note } = await setup();
    const decode = vi.fn();
    await expect(importImages(note, root, [input(), input(Buffer.alloc(IMAGE_BYTE_LIMIT + 1))], decode)).rejects.toThrow("image-too-large");
    expect(decode).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual(["notes"]);
  });
  it("refuses huge pixel counts, animation and corrupt headers", () => {
    const huge = Buffer.from(png); huge.writeUInt32BE(10000, 16); huge.writeUInt32BE(10000, 20);
    expect(() => rasterInfo(huge)).toThrow("image-pixels");
    const chunk = Buffer.alloc(20); chunk.writeUInt32BE(8); chunk.write("acTL", 4);
    expect(() => rasterInfo(Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]))).toThrow("animated-image");
    expect(() => rasterInfo(Buffer.from("not an image"))).toThrow("invalid-image");
  });
  it("does not create assets if any decoder rejects a corrupt file", async () => {
    const { root, note } = await setup();
    let n = 0;
    await expect(importImages(note, root, [input(), input()], async () => { if (++n === 2) throw new Error("invalid-image"); })).rejects.toThrow("invalid-image");
    expect(await readdir(root)).toEqual(["notes"]);
  });
  it("refuses an asset-directory junction outside the project", async () => {
    const { root, note } = await setup();
    const outside = await mkdtemp(join(tmpdir(), "fn-image-outside-")); roots.push(outside);
    await symlink(outside, join(root, "assets"), "junction");
    await expect(importImages(note, root, [input()], async () => {})).rejects.toThrow("invalid-image");
    expect(await readdir(outside)).toEqual([]);
  });
  it("keeps the project path identity for Git when the project root is a junction", async () => {
    const { root } = await setup();
    const holder = await mkdtemp(join(tmpdir(), "fn-image-alias-")); roots.push(holder);
    const alias = join(holder, "project"); await symlink(root, alias, "junction");
    const result = await importImages(join(alias, "notes", "Plan.md"), alias, [input()], async () => {});
    expect(result.paths[0]).toMatch(new RegExp(`^${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    expect(await readFile(result.paths[0]!)).toEqual(png);
  });
  it("picker paths are byte-checked and use the same validated bytes", async () => {
    const { root } = await setup();
    const path = join(root, "source.png"); await writeFile(path, png);
    expect(await imageInputsFromPaths([path])).toEqual([input()]);
    await expect(imageInputsFromPaths(Array(21).fill(path))).rejects.toThrow("image-count");
  });
});
