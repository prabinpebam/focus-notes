import { afterEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createImageCopy } from "../src/main/image-edit.ts";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
const data = `data:image/png;base64,${png.toString("base64")}`;
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "fn-crop-test-"));
  roots.push(root);
  const note = join(root, "notes", "Image.md"), source = join(root, "original.png");
  await mkdir(join(root, "notes"));
  await writeFile(note, "# Image\n\n![Original](../original.png)\n");
  await writeFile(source, png);
  return { root, note, source };
}
it("creates a fresh managed copy without overwriting the original or note", async () => {
  const { root, note, source } = await setup();
  const decode = vi.fn(async () => {});
  const first = await createImageCopy(note, root, source, data, data, decode, false);
  const next = await createImageCopy(note, root, source, data, data, decode, false);
  expect(first.image).toMatchObject({ width: 1, height: 1 });
  expect(first.image.src).toMatch(/^\.\.\/assets\/images\/[0-9a-f-]+\.png$/);
  expect(first.paths).not.toEqual(next.paths);
  expect(await readFile(source)).toEqual(png);
  expect(await readFile(first.paths[0]!)).toEqual(png);
  expect(await readFile(note, "utf8")).toContain("../original.png");
  expect(decode).toHaveBeenCalledTimes(2);
});
it("refuses a stale source before decoding or creating managed assets", async () => {
  const { root, note, source } = await setup();
  const decode = vi.fn();
  await writeFile(source, "externally changed");
  await expect(createImageCopy(note, root, source, data, data, decode, false)).rejects.toThrow("image-changed");
  expect(decode).not.toHaveBeenCalled();
  expect(await readdir(root)).toEqual(["notes", "original.png"]);
});
it("retains a completed copy if the source changes during decode, without touching either source version", async () => {
  const { root, note, source } = await setup();
  await expect(createImageCopy(note, root, source, data, data, async () => { await writeFile(source, "new source"); }, false)).rejects.toThrow("image-changed");
  expect(await readFile(source, "utf8")).toBe("new source");
  expect(await readdir(join(root, "assets", "images"))).toHaveLength(1);
});
it("enforces existing bounds before decoding output", async () => {
  const { root, note, source } = await setup();
  const large = Buffer.from(png);
  large.writeUInt32BE(10000, 16); large.writeUInt32BE(10000, 20);
  const decode = vi.fn();
  await expect(createImageCopy(note, root, source, data, `data:image/png;base64,${large.toString("base64")}`, decode, false)).rejects.toThrow("image-pixels");
  expect(decode).not.toHaveBeenCalled();
  expect(await readFile(source)).toEqual(png);
});
