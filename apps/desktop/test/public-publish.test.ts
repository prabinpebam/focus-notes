import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { GitHubApi } from "@focus-notes/github";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { gitData } from "./fake-pages.ts";
import { pagesArtifactPublisher } from "../src/main/share/site-publish.ts";
import { sharingRuntime } from "../src/main/share/runtime.ts";
import type { SharingLayout } from "../src/main/share/layout.ts";
import type { SitePairing } from "../src/main/share/setup.ts";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const temp = async () => { const d = await mkdtemp(join(tmpdir(), "fn-g3-")); dirs.push(d); return d; };
const pairing: SitePairing = { version: 1, project: "ada/book", owner: "ada", name: "quiet-site", intent: "11111111-1111-1111-1111-111111111111", phase: "ready", site: "https://ada.github.io/quiet-site/" };
const SECRET = "This private line must never reach the public site.";
const TRIP = "# Trip to the coast\n\nWe walked along the harbour wall until the light went.\n";

async function project(o: { reader?: boolean; notes?: Record<string, string>; legacy?: boolean } = {}) {
  const root = await temp();
  const notesDir = join(root, "notes");
  await mkdir(join(root, ".focus-notes"), { recursive: true });
  await writeFile(join(root, ".focus-notes", "site-pairing.json"), JSON.stringify(pairing));
  for (const [path, text] of Object.entries({ "diary.md": `# Diary\n\n${SECRET}\n`, ...o.notes })) {
    await mkdir(join(notesDir, path, ".."), { recursive: true });
    await writeFile(join(notesDir, path), text);
  }
  let reader: string | undefined;
  if (o.reader !== false) {
    reader = await temp();
    await mkdir(join(reader, "assets"));
    await writeFile(join(reader, "render.mjs"), "export function renderNotePage({ path }) { const stem = path.replace(/\\.md$/, ''); return { file: `n/${stem}/index.html`, html: `<p>${stem}</p>`, title: stem }; }\n");
  }
  const github = new FakeGitHub();
  github.add({ owner: "ada", name: "quiet-site", files: [".github/workflows/pages.yml"] });
  github.add({ owner: "ada", name: "book", private: true, files: ["notes/diary.md"] });
  const git = gitData(github);
  const api = new GitHubApi(github.token, git.fetch);
  const layout: SharingLayout = { legacy: false, privateDir: root, privateNotes: notesDir, roots: [] };
  const steps: string[] = [];
  const runtime = sharingRuntime({
    root: () => root, layout: () => layout, api: async () => api, repository: async () => "ada/book",
    write: (file, text) => writeFile(file, text), written: () => {}, temporary: await temp(),
    publisher: pagesArtifactPublisher({ api: async () => api, target: async () => pairing, get: git.get, timeoutMs: 30, delayMs: 1 }),
    reader: () => reader, publishStep: step => steps.push(step),
  });
  const site = () => git.site("ada/quiet-site");
  const record = async () => JSON.parse(await readFile(join(root, ".focus-notes", "published.json"), "utf8")) as { notes: string[] };
  return { root, notesDir, github, git, runtime, steps, site, record };
}

it("G3.1 Publish: exactly the selected note goes public with its page, Published only once Pages serves the build; private bytes kept", async () => {
  const t = await project({ notes: { "journeys/trip.md": TRIP } });
  const result = await t.runtime.publishNotes({ notes: ["journeys/trip.md"] });
  expect(result).toMatchObject({ published: ["journeys/trip.md"], changed: ["journeys/trip.md"] });
  expect(result.commit).toMatch(/^[a-f0-9]{40}$/);
  const site = t.site();
  expect(site.get("notes/journeys/trip.md")).toBe(TRIP);
  expect(site.has("n/journeys/trip/index.html")).toBe(true);
  expect([...site.keys()].some(p => p.includes("diary"))).toBe(false);
  expect([...site.values()].some(text => text.includes(SECRET))).toBe(false);
  expect(t.steps).toEqual(["saving", "publishing"]);
  expect(await t.record()).toEqual({ version: 1, notes: ["journeys/trip.md"] });
  expect(await readFile(join(t.notesDir, "journeys", "trip.md"), "utf8")).toBe(TRIP);
  // A later sharing push keeps the published note on the site.
  await t.runtime.publish();
  expect(t.site().get("notes/journeys/trip.md")).toBe(TRIP);
});

it("G3.4 Unpublish: the current site loses the note after its deploy; the private note stays", async () => {
  const t = await project({ notes: { "trip.md": TRIP } });
  await t.runtime.publishNotes({ notes: ["trip.md"] });
  await expect(t.runtime.unpublishNotes(["trip.md"])).resolves.toMatchObject({ published: [], changed: ["trip.md"] });
  expect(t.site().has("notes/trip.md")).toBe(false);
  expect(t.site().has("n/trip/index.html")).toBe(false);
  expect(await t.record()).toEqual({ version: 1, notes: [] });
  expect(await readFile(join(t.notesDir, "trip.md"), "utf8")).toBe(TRIP);
  expect(t.steps).toEqual(["saving", "publishing", "removing", "publishing"]);
});

it("G3.4: a build Pages never serves, or an offline push, is never Published or recorded, and Retry publishes", async () => {
  const t = await project({ notes: { "trip.md": TRIP } });
  t.git.setStale(true);
  await expect(t.runtime.publishNotes({ notes: ["trip.md"] })).rejects.toThrow("sharing:unacknowledged");
  await expect(t.record()).rejects.toThrow();
  t.git.setStale(false);
  t.github.offline = true;
  await expect(t.runtime.publishNotes({ notes: ["trip.md"] })).rejects.toThrow("sharing:offline");
  await expect(t.record()).rejects.toThrow();
  t.github.offline = false;
  await expect(t.runtime.publishNotes({ notes: ["trip.md"] })).resolves.toMatchObject({ published: ["trip.md"] });
});

it("G3.1/G3.2: no page renderer, or a published note quoting a private one, stops before any push", async () => {
  const noReader = await project({ reader: false, notes: { "trip.md": TRIP } });
  await expect(noReader.runtime.publishNotes({ notes: ["trip.md"] })).rejects.toThrow("sharing:unavailable");
  expect(noReader.git.pushes).toEqual([]);
  const quoting = await project({ notes: { "trip.md": `${TRIP}\n${SECRET}\n` } });
  await expect(quoting.runtime.publishNotes({ notes: ["trip.md"] })).rejects.toThrow(/Leak check failed/);
  expect(quoting.git.pushes).toEqual([]);
  expect(quoting.github.calls.filter(c => c.method !== "GET")).toEqual([]);
});

it("G3/PRJ-10 Turn off: once the emptied site is served, the published list is cleared so nothing reappears on re-enable", async () => {
  const t = await project({ notes: { "trip.md": TRIP } });
  await t.runtime.publishNotes({ notes: ["trip.md"] });
  t.git.setStale(true);
  await expect(t.runtime.disable()).rejects.toThrow();
  // The site may still serve the note, so the record still says so.
  expect(await t.record()).toEqual({ version: 1, notes: ["trip.md"] });
  t.git.setStale(false);
  await t.runtime.disable();
  expect(t.site().has("notes/trip.md")).toBe(false);
  expect(await t.record()).toEqual({ version: 1, notes: [] });
  expect(await readFile(join(t.notesDir, "trip.md"), "utf8")).toBe(TRIP);
});

it("WP-9.9 Publish: a note's local photo reaches the site beside it with no GPS or camera metadata; the original is untouched", async () => {
  const seg = (marker: number, payload: Buffer) => { const h = Buffer.from([0xff, marker, 0, 0]); h.writeUInt16BE(payload.length + 2, 2); return Buffer.concat([h, payload]); };
  const photo = Buffer.concat([Buffer.from([0xff, 0xd8]), seg(0xe1, Buffer.from("Exif\0\0MM\0*\0\0\0\x08Canon GPS 38.7N 9.1W", "latin1")),
    seg(0xdb, Buffer.alloc(65, 1)), seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])), Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd9])]);
  const t = await project({ notes: { "journeys/trip.md": `${TRIP}\n![Harbour](../../assets/images/harbour.jpg)\n` } });
  // A project's managed images live at its root (D-365), outside notes/.
  await mkdir(join(t.root, "assets", "images"), { recursive: true });
  await writeFile(join(t.root, "assets", "images", "harbour.jpg"), photo);
  await t.runtime.publishNotes({ notes: ["journeys/trip.md"] });
  const published = t.git.siteBytes("ada/quiet-site").get("assets/images/harbour.jpg");
  expect(published).toBeDefined();
  for (const leak of ["Canon", "GPS", "38.7N", "Exif"]) expect(published!.toString("latin1")).not.toContain(leak);
  expect(published!.subarray(-6)).toEqual(Buffer.from([0x12, 0xff, 0x00, 0x34, 0xff, 0xd9]));
  expect(await readFile(join(t.root, "assets", "images", "harbour.jpg"))).toEqual(photo);
});
