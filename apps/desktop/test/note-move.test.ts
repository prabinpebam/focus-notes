import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, open, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageNoteMove, validateNoteImages } from "../src/main/note-move.ts";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, open: vi.fn(actual.open) };
});

const folders: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true })));
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "fn-note-move-"));
  folders.push(root);
  await mkdir(join(root, "Box"));
  await mkdir(join(root, "a.md.assets", "images"), { recursive: true });
  const image = join(root, "a.md.assets", "images", "p.png");
  await writeFile(image, "image bytes");
  const from = join(root, "a.md"), to = join(root, "Box", "a.md");
  const before = '![caption](a.md.assets/images/p.png "Title"){width=240}\r\n';
  const text = before.replace("(a.md.assets/", "(../a.md.assets/");
  await writeFile(from, before);
  return { root, from, to, before, text, image };
}
describe("IMG-05 ordered note moves", () => {
  it("validates retained originals as well as crops without crossing the visibility boundary", async () => {
    const f = await setup();
    const original = join(f.root, "a.md.assets", "images", "old photo.png");
    await writeFile(original, "original bytes");
    const note = (src: string) => `<!-- image: original=${encodeURIComponent(src)} -->\n![crop](a.md.assets/images/p.png)\n`;
    await validateNoteImages(note("a.md.assets/images/old%20photo.png"), f.from, f.root);
    await expect(validateNoteImages(note("a.md.assets/images/missing.png"), f.from, f.root)).rejects.toThrow("missingImage");
    await expect(validateNoteImages(note("../private/assets/original.png"), f.from, f.root)).rejects.toThrow("invalid");
    const outside = await mkdtemp(join(tmpdir(), "fn-original-outside-"));
    folders.push(outside);
    await writeFile(join(outside, "private.png"), "private");
    await symlink(outside, join(f.root, "escape"), process.platform === "win32" ? "junction" : "dir");
    await expect(validateNoteImages(note("escape/private.png"), f.from, f.root)).rejects.toThrow("invalid");
    expect(await readFile(f.from, "utf8")).toBe(f.before);
    expect(await readFile(original, "utf8")).toBe("original bytes");
  });
  it("publishes the fully rewritten destination while retaining the source until commit, and can undo", async () => {
    const f = await setup();
    await validateNoteImages(f.before, f.from, f.root);
    const staged = await stageNoteMove(f.from, f.to, f.text, f.before);
    // This is the interrupted state: both notes can still resolve the unchanged sidecar.
    expect(await readFile(f.from, "utf8")).toBe(f.before);
    expect(await readFile(f.to, "utf8")).toBe(f.text);
    await validateNoteImages(f.text, f.to, f.root);
    await staged.finish();
    await expect(readFile(f.from)).rejects.toMatchObject({ code: "ENOENT" });
    await staged.undo();
    expect(await readFile(f.from, "utf8")).toBe(f.before);
    await expect(readFile(f.to)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(f.image, "utf8")).toBe("image bytes");
  });
  it("never overwrites a collision or a source changed after planning", async () => {
    const f = await setup();
    await writeFile(f.to, "other note");
    await expect(stageNoteMove(f.from, f.to, f.text, f.before)).rejects.toThrow("taken");
    expect(await readFile(f.to, "utf8")).toBe("other note");
    expect(await readFile(f.from, "utf8")).toBe(f.before);
    await writeFile(f.from, "external edit");
    await expect(stageNoteMove(f.from, join(f.root, "new.md"), f.text, f.before)).rejects.toThrow("changed");
    expect(await readFile(f.from, "utf8")).toBe("external edit");
  });
  it("refuses a missing image, including a reference image, before any move", async () => {
    const f = await setup();
    await expect(validateNoteImages("![p][id]\n\n[id]: missing.png\n", f.from, f.root)).rejects.toThrow("missingImage");
    expect(await readFile(f.from, "utf8")).toBe(f.before);
    await expect(readFile(f.to)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("preserves both copies if the original changes before finish and never overwrites it in rollback", async () => {
    const f = await setup();
    const staged = await stageNoteMove(f.from, f.to, f.text, f.before);
    await writeFile(f.from, "external edit");
    await expect(staged.finish()).rejects.toThrow("changed");
    await expect(staged.undo()).rejects.toThrow("changed");
    expect(await readFile(f.from, "utf8")).toBe("external edit");
    expect(await readFile(f.to, "utf8")).toBe(f.text);
  });
  it("leaves the source and assets untouched on a read-only destination", async () => {
    const f = await setup();
    vi.mocked(open).mockRejectedValueOnce(Object.assign(new Error("denied"), { code: "EACCES" }));
    await expect(stageNoteMove(f.from, f.to, f.text, f.before)).rejects.toMatchObject({ code: "EACCES" });
    expect(await readFile(f.from, "utf8")).toBe(f.before);
    expect(await readFile(f.image, "utf8")).toBe("image bytes");
  });
  it("uses the caller's junction spelling and rejects media escaping through a junction", async () => {
    const f = await setup();
    const alias = `${f.root}-junction`;
    folders.push(alias);
    await symlink(f.root, alias, process.platform === "win32" ? "junction" : "dir");
    const from = join(alias, "a.md"), to = join(alias, "Box", "a.md");
    expect(await realpath(from)).not.toBe(from);
    await validateNoteImages(f.before, from, alias);
    const staged = await stageNoteMove(from, to, f.text, f.before);
    await staged.finish();
    expect(await readFile(to, "utf8")).toBe(f.text);
    await validateNoteImages(f.text, to, alias);
    await staged.undo();
    const outside = await mkdtemp(join(tmpdir(), "fn-outside-"));
    folders.push(outside);
    await writeFile(join(outside, "private.png"), "private");
    await symlink(outside, join(f.root, "escape"), process.platform === "win32" ? "junction" : "dir");
    await expect(validateNoteImages("![p](escape/private.png)", from, alias)).rejects.toThrow("invalid");
  });
});
