import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, it } from "vitest";
import { preservePublicSource } from "../src/main/share/preserve.ts";

it("preserves every public working note and binary image privately without changing or overwriting either source", async () => {
  const folder = await mkdtemp(join(tmpdir(), "focus-sharing-preserve-"));
  try {
    const publicRoot = join(folder, "site"), privateRoot = join(folder, "project");
    await mkdir(join(publicRoot, "notes", "folder"), { recursive: true });
    await mkdir(join(publicRoot, "assets", "images"), { recursive: true });
    await mkdir(join(privateRoot, "notes"), { recursive: true });
    const note = "# Public draft\r\n![picture](../../assets/images/picture.png)\r\n";
    const image = Buffer.from([0, 255, 17, 200]);
    await writeFile(join(publicRoot, "notes", "folder", "draft.md"), note);
    await writeFile(join(publicRoot, "assets", "images", "picture.png"), image);
    await writeFile(join(privateRoot, "notes", "draft.md"), "# Existing private draft");
    const copy = await preservePublicSource(publicRoot, privateRoot);
    expect(await readFile(join(copy, "notes", "folder", "draft.md"), "utf8")).toBe(note);
    expect(await readFile(join(copy, "assets", "images", "picture.png"))).toEqual(image);
    expect(await readFile(join(privateRoot, "notes", "draft.md"), "utf8")).toBe("# Existing private draft");
    expect(await readFile(join(publicRoot, "notes", "folder", "draft.md"), "utf8")).toBe(note);
    expect(await preservePublicSource(publicRoot, privateRoot)).not.toBe(copy);
    expect(await readdir(join(privateRoot, "notes", "Recovered public"))).toHaveLength(2);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

it("refuses overlapping roots and junctions before giving removal permission", async () => {
  const folder = await mkdtemp(join(tmpdir(), "focus-sharing-preserve-"));
  try {
    const publicRoot = join(folder, "site"), privateRoot = join(folder, "project");
    await mkdir(join(publicRoot, "notes"), { recursive: true });
    await mkdir(join(privateRoot, "notes"), { recursive: true });
    await expect(preservePublicSource(publicRoot, publicRoot)).rejects.toThrow("sharing:preservation");
    await symlink(privateRoot, join(publicRoot, "notes", "outside"), "junction");
    await expect(preservePublicSource(publicRoot, privateRoot)).rejects.toThrow("sharing:preservation");
    expect(await readdir(join(privateRoot, "notes"))).toEqual([]);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
