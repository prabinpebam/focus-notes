import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { firstProjectNote } from "../src/main/first-project-note.ts";

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});
async function root() {
  const dir = await mkdtemp(join(tmpdir(), "fn-first-note-"));
  dirs.push(dir);
  return dir;
}

describe("first project note (PRJ-24)", () => {
  it("creates one ordinary empty note under concurrent admissions", async () => {
    const dir = await root();
    const create = firstProjectNote({ roots: async () => [dir], writable: async () => {} });
    const paths = await Promise.all([create(), create(), create()]);
    expect(paths).toEqual(Array(3).fill(join(dir, "Untitled.md")));
    expect(await readdir(dir)).toEqual(["Untitled.md"]);
    expect(await readFile(paths[0]!, "utf8")).toBe("");
    expect(await create()).toBeUndefined();
  });

  it("preserves any existing file in either trusted root, including non-Markdown", async () => {
    const privateRoot = await root();
    const publicRoot = await root();
    await mkdir(join(publicRoot, "nested"));
    const existing = join(publicRoot, "nested", "kept.txt");
    await writeFile(existing, "unchanged");
    const writable = vi.fn(async () => {});
    const create = firstProjectNote({ roots: async () => [privateRoot, publicRoot], writable });
    expect(await create()).toBeUndefined();
    expect(await readdir(privateRoot)).toEqual([]);
    expect(await readFile(existing, "utf8")).toBe("unchanged");
    expect(writable).not.toHaveBeenCalled();
  });

  it("does not infer emptiness from an unavailable project or failed directory read", async () => {
    const dir = await root();
    expect(await firstProjectNote({ roots: async () => undefined, writable: async () => {} })()).toBeUndefined();
    await expect(firstProjectNote({ roots: async () => [join(dir, "missing")], writable: async () => {} })()).rejects.toThrow();
    expect(await readdir(dir)).toEqual([]);
  });

  it("never follows a metadata-named junction or symbolic link to declare a root empty", async () => {
    const dir = await root();
    const outside = await root();
    await symlink(outside, join(dir, ".git"), process.platform === "win32" ? "junction" : "dir");
    const create = firstProjectNote({ roots: async () => [dir], writable: async () => {} });
    expect(await create()).toBeUndefined();
    expect(await readdir(dir)).toEqual([".git"]);
    expect(await readdir(outside)).toEqual([]);
  });

  it("rechecks roots, access and content after asynchronous preparation", async () => {
    const first = await root();
    const second = await root();
    let current = first;
    const changed = firstProjectNote({
      roots: async () => [current],
      writable: async () => { current = second; },
    });
    await expect(changed()).rejects.toThrow("project changed");
    expect(await readdir(first)).toEqual([]);
    expect(await readdir(second)).toEqual([]);
    const arriving = firstProjectNote({
      roots: async () => [first],
      writable: async () => { await writeFile(join(first, "arrived.md"), "# Keep"); },
    });
    expect(await arriving()).toBeUndefined();
    expect(await readdir(first)).toEqual(["arrived.md"]);
  });

  it("never overwrites a concurrent exclusive creator", async () => {
    const dir = await root();
    const options = { roots: async () => [dir], writable: async () => {} };
    const paths = await Promise.all([firstProjectNote(options)(), firstProjectNote(options)()]);
    expect(paths.filter(Boolean)).toEqual([join(dir, "Untitled.md")]);
    expect(await readdir(dir)).toEqual(["Untitled.md"]);
  });

  it("surfaces refusal and permits an explicit retry without creating twice", async () => {
    const dir = await root();
    const writable = vi.fn().mockRejectedValueOnce(new Error("read-only")).mockResolvedValue(undefined);
    const create = firstProjectNote({ roots: async () => [dir], writable });
    await expect(create()).rejects.toThrow("read-only");
    expect(await readdir(dir)).toEqual([]);
    expect(await create()).toBe(join(dir, "Untitled.md"));
    expect(await create()).toBeUndefined();
  });
});
