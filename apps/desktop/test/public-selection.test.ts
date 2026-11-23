import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { stagePublicSelection } from "../src/main/share/public-selection.ts";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
async function notes(files: Record<string, string | Buffer>) {
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
  await expect(stagePublicSelection({ notesRoot: root, selection: { notes: ["trips/trip.md"] }, staging })).resolves.toEqual({ notes: ["trips/trip.md"], media: [] });
  expect(await readFile(join(staging, "trips", "trip.md"), "utf8")).toBe(text);
  expect(await staged(staging)).toBe(1);
  expect(await readFile(join(root, "trips", "trip.md"), "utf8")).toBe(text);
});

it("G3.3: a note added to a confirmed folder stops for reconfirmation instead of widening, staging nothing", async () => {
  const { root, staging } = await notes({ "trips/a.md": "# A", "trips/b.md": "# B" });
  const selection = { notes: ["trips/a.md"], folders: ["trips"] };
  await expect(stagePublicSelection({ notesRoot: root, selection, staging })).rejects.toThrow("sharing:scope");
  expect(await staged(staging)).toBe(0);
  await expect(stagePublicSelection({ notesRoot: root, selection: { ...selection, notes: ["trips/a.md", "trips/b.md"] }, staging }).then(r => r.notes)).resolves.toHaveLength(2);
});

it("G3.3: missing notes and unsafe paths stop; a missing local image stops rather than being dropped", async () => {
  const { root, staging } = await notes({ "a.md": "# A\n\n![photo](media/photo.jpg)\n", "b.md": "# B\n\n<img src=\"media/x.png\">", "c.md": "# C" });
  for (const notes of [["gone.md"], ["../c.md"], [".hidden/c.md"], ["c.txt"], []]) {
    await expect(stagePublicSelection({ notesRoot: root, selection: { notes }, staging })).rejects.toThrow("sharing:scope");
  }
  for (const note of ["a.md", "b.md"]) {
    await expect(stagePublicSelection({ notesRoot: root, selection: { notes: ["c.md", note] }, staging })).rejects.toThrow("sharing:media");
  }
  expect(await staged(staging)).toBe(0);
});

const jpegWithGps = () => {
  const seg = (marker: number, payload: Buffer) => { const h = Buffer.from([0xff, marker, 0, 0]); h.writeUInt16BE(payload.length + 2, 2); return Buffer.concat([h, payload]); };
  return Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe1, Buffer.from("Exif\0\0MM\0*\0\0\0\x08Canon GPS 51.5N", "latin1")), seg(0xfe, Buffer.from("home address", "latin1")),
    seg(0xdb, Buffer.alloc(65, 1)), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0x34, 0xff, 0xd9])]);
};

it("WP-9.9: local JPEG and PNG images are staged beside the note with their metadata removed; the originals are untouched", async () => {
  const photo = jpegWithGps();
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0, 0, 0, 0]), Buffer.from("IHDR", "latin1"), Buffer.alloc(4), Buffer.from([0, 0, 0, 5]), Buffer.from("tEXtAda\0x", "latin1"), Buffer.alloc(4),
    Buffer.from([0, 0, 0, 0]), Buffer.from("IEND", "latin1"), Buffer.alloc(4)]);
  const text = "# Trip\n\n![Harbour](../assets/images/harbour.jpg \"Harbour\")\n\n<img src=\"maps/route%20one.png\" alt=\"Route\">\n";
  const { root, staging } = await notes({ "trips/trip.md": text, "assets/images/harbour.jpg": photo, "trips/maps/route one.png": png });
  await expect(stagePublicSelection({ notesRoot: root, selection: { notes: ["trips/trip.md"] }, staging }))
    .resolves.toEqual({ notes: ["trips/trip.md"], media: ["notes/assets/images/harbour.jpg", "notes/trips/maps/route one.png"] });
  const published = await readFile(join(staging, ".media", "notes", "assets", "images", "harbour.jpg"));
  for (const leak of ["Canon", "GPS", "51.5N", "home address", "Exif"]) expect(published.toString("latin1")).not.toContain(leak);
  expect(published.subarray(-4)).toEqual(Buffer.from([0x12, 0x34, 0xff, 0xd9]));
  expect((await readFile(join(staging, ".media", "notes", "trips", "maps", "route one.png"))).toString("latin1")).not.toContain("Ada");
  expect(await readFile(join(root, "assets", "images", "harbour.jpg"))).toEqual(photo);
  expect(await readFile(join(staging, "trips", "trip.md"), "utf8")).toBe(text);
});

it("WP-9.9: unsupported, embedded, outside or missing images stop with nothing staged", async () => {
  for (const ref of ["anim.gif", "data:image/jpeg;base64,/9j/4AAQ", "../../outside.jpg", "/abs.jpg", "missing.jpg", "C:/x.jpg"]) {
    const { root, staging } = await notes({ "a.md": `# A\n\n![x](${ref})\n`, "anim.gif": "GIF89a" });
    await expect(stagePublicSelection({ notesRoot: root, selection: { notes: ["a.md"] }, staging })).rejects.toThrow("sharing:media");
    expect(await staged(staging)).toBe(0);
  }
});
it("WP-9.9/D-365: a project's managed images publish at their project path so the note's links resolve; nothing else outside the notes", async () => {
  const photo = jpegWithGps();
  const { root, staging } = await notes({ "notes/trips/trip.md": "# Trip\n\n![Harbour](../../assets/images/harbour.jpg)\n", "assets/images/harbour.jpg": photo,
    "private/secret.jpg": photo, "notes/leak.md": "# Leak\n\n![x](../private/secret.jpg)\n", ".git/x.jpg": photo, "notes/git.md": "# Git\n\n![x](../.git/x.jpg)\n" });
  const notesRoot = join(root, "notes");
  await expect(stagePublicSelection({ projectRoot: root, notesRoot, selection: { notes: ["trips/trip.md"] }, staging }))
    .resolves.toEqual({ notes: ["trips/trip.md"], media: ["assets/images/harbour.jpg"] });
  expect((await readFile(join(staging, ".media", "assets", "images", "harbour.jpg"))).toString("latin1")).not.toContain("Canon");
  for (const note of ["leak.md", "git.md"]) {
    const other = await mkdtemp(join(tmpdir(), "fn-stage-")); dirs.push(other);
    await expect(stagePublicSelection({ projectRoot: root, notesRoot, selection: { notes: [note] }, staging: other })).rejects.toThrow("sharing:media");
  }
});