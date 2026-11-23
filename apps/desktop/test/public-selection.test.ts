import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { stagePublicSelection } from "../src/main/share/public-selection.ts";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function notes(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), "fn-sel-")), staging = await mkdtemp(join(tmpdir(), "fn-stage-"));
  dirs.push(root, staging);
  for (const [path, text] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return { root, staging };
}
const staged = async (dir: string) => (await readdir(dir, { recursive: true, withFileTypes: true })).filter(e => e.isFile()).length;

it("G3.1/G3.3: stages exactly the confirmed notes, byte for byte, and nothing else", async () => {
  const text = "# Trip\r\n\r\nLinks [out](https://example.com) and ![remote](https://example.com/a.png).\r\n";
  const { root, staging } = await notes({ "trips/trip.md": text, "trips/other.md": "# Other", "diary.md": "# Diary" });
  await expect(stagePublicSelection({ notesRoot: root, selection: { notes: ["trips/trip.md"] }, staging })).resolves.toEqual(["trips/trip.md"]);
  expect(await readFile(join(staging, "trips", "trip.md"), "utf8")).toBe(text);
  expect(await staged(staging)).toBe(1);
  expect(await readFile(join(root, "trips", "trip.md"), "utf8")).toBe(text);
});

it("G3.3: a note added to a confirmed folder stops for reconfirmation instead of widening, staging nothing", async () => {
  const { root, staging } = await notes({ "trips/a.md": "# A", "trips/b.md": "# B" });
  const selection = { notes: ["trips/a.md"], folders: ["trips"] };
  await expect(stagePublicSelection({ notesRoot: root, selection, staging })).rejects.toThrow("sharing:scope");
  expect(await staged(staging)).toBe(0);
  await expect(stagePublicSelection({ notesRoot: root, selection: { ...selection, notes: ["trips/a.md", "trips/b.md"] }, staging })).resolves.toHaveLength(2);
});

it("G3.3: missing notes and unsafe paths stop; local media stops rather than dropping images or exposing originals", async () => {
  const { root, staging } = await notes({ "a.md": "# A\n\n![photo](media/photo.jpg)\n", "b.md": "# B\n\n<img src=\"media/x.png\">", "c.md": "# C" });
  for (const notes of [["gone.md"], ["../c.md"], [".hidden/c.md"], ["c.txt"], []]) {
    await expect(stagePublicSelection({ notesRoot: root, selection: { notes }, staging })).rejects.toThrow("sharing:scope");
  }
  for (const note of ["a.md", "b.md"]) {
    await expect(stagePublicSelection({ notesRoot: root, selection: { notes: ["c.md", note] }, staging })).rejects.toThrow("sharing:media");
  }
  expect(await staged(staging)).toBe(0);
});
