import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { leakCheck, LeakError, publish } from "../src/publish.ts";

const TRIP = "journeys/trip-to-the-coast.md";
const tripText = "# Trip to the coast\n\nWe walked along the harbour wall until the light went.\n";
const diaryText = "# Diary\n\nThis private line must never reach the public site.\n";
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true }))); });

async function project(o: { access?: boolean; publicTrip?: string } = {}) {
  const root = await mkdtemp(join(tmpdir(), "fn-published-"));
  dirs.push(root);
  const put = async (path: string, text: string) => { await mkdir(join(root, path, ".."), { recursive: true }); await writeFile(join(root, path), text); };
  await put(`private/notes/${TRIP}`, tripText);
  await put("private/notes/diary.md", diaryText);
  if (o.access !== false) await put("private/access.json", JSON.stringify({ version: 1, grants: [] }));
  await put(`public/${TRIP}`, o.publicTrip ?? tripText);
  return { private: join(root, "private"), notes: join(root, "public"), site: join(root, "site"), owner: "ada" };
}

it("G3.2: a note the person confirmed public publishes as plaintext; without the confirmation it is a leak", async () => {
  const o = await project();
  await expect(publish(o)).rejects.toBeInstanceOf(LeakError);
  await rm(o.site, { recursive: true, force: true });
  await expect(publish({ ...o, published: [TRIP] })).resolves.toMatchObject({ publicNotes: 1 });
  expect(await readFile(join(o.site, "notes", ...TRIP.split("/")), "utf8")).toBe(tripText);
});

it("G3.2: other private notes stay leak-checked, including a line they share with the published note, with or without access.json", async () => {
  for (const access of [true, false]) {
    const quoting = await project({ access, publicTrip: `${tripText}\n${diaryText}` });
    await expect(publish({ ...quoting, published: [TRIP] })).rejects.toThrow(/Leak check failed.*\(text\)/);
    const shared = await project({ access });
    await writeFile(join(shared.private, "notes", "diary.md"), `${diaryText}\nWe walked along the harbour wall until the light went.\n`);
    await expect(publish({ ...shared, published: [TRIP] })).rejects.toThrow(/Leak check failed/);
  }
});

it("G3.2: the exclusion names exactly a public and private note, never a blanket allowance", async () => {
  const o = await project();
  await expect(publish({ ...o, published: [TRIP, "diary.md"] })).rejects.toThrow("isn't among both the public and the private notes");
  await expect(publish({ ...o, published: ["journeys/elsewhere.md"] })).rejects.toThrow("isn't among both");
});

it("SHR-23/G3.2: a published note's text and source-derived identifiers stay forbidden in keyrings, sealed files and the manifest", async () => {
  const notes = [{ path: TRIP, text: tripText }, { path: "diary.md", text: diaryText }];
  const site = async (files: Record<string, string>) => {
    const dir = await mkdtemp(join(tmpdir(), "fn-site-"));
    dirs.push(dir);
    for (const [path, text] of Object.entries(files)) { await mkdir(join(dir, path, ".."), { recursive: true }); await writeFile(join(dir, path), text); }
    return dir;
  };
  const allowed = await site({ [`notes/${TRIP}`]: tripText, "notes/index.json": JSON.stringify({ format: 1, notes: [{ path: TRIP, title: "Trip to the coast" }] }) });
  expect(await leakCheck(allowed, notes, [], [], [TRIP])).toEqual([]);
  expect(await leakCheck(await site({ "focus-notes.json": JSON.stringify({ note: "We walked along the harbour wall until the light went." }) }), notes, [], [], [TRIP]))
    .toEqual([{ file: "focus-notes.json", kind: "text" }]);
  expect(await leakCheck(await site({ "_access/trip-to-the-coast/k.json": "{}" }), notes, [], [], [TRIP]))
    .toEqual([{ file: "_access/trip-to-the-coast/k.json", kind: "path" }]);
});
