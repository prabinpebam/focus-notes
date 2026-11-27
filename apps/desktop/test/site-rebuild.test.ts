import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect, it } from "vitest";
import { GitHubApi } from "@focus-notes/github";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { gitData } from "./fake-pages.ts";
import { pagesArtifactPublisher } from "../src/main/share/site-publish.ts";
import { sharingRuntime } from "../src/main/share/runtime.ts";
import { siteRebuilder } from "../src/main/share/site-rebuild.ts";
import type { SharingLayout } from "../src/main/share/layout.ts";
import type { SitePairing } from "../src/main/share/setup.ts";

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const temp = async () => { const d = await mkdtemp(join(tmpdir(), "fn-d436-")); dirs.push(d); return d; };
const RENDER = "export function renderNotePage({ path, build }) { const stem = path.replace(/\\.md$/, ''); return { file: `n/${stem}/index.html`, html: `<p>${stem}</p>`, title: stem }; }\n" +
  "export function renderIndexPage({ notes }) { return { file: 'n/index.html', html: notes.map(n => n.title).join(',') }; }\n" +
  "export function renderEmptyHome() { return { file: 'index.html', html: '<h1>Nothing published here yet</h1>' }; }\n";

it("D-436: a trigger during a run builds again after it, and a source change while the build ran is built even with no trigger", async () => {
  let source = "a", deployed: string[] = [];
  const reads: string[] = [];
  let during: (() => void) | undefined;
  const r = siteRebuilder({
    signature: async () => source,
    deploy: async () => { reads.push(source); await delay(5); during?.(); during = undefined; deployed.push(reads.at(-1)!); },
    retryMs: [5],
  });
  // A source change lands after the build read it and nobody asks again (the lost trigger of 27 November).
  during = () => { source = "a+rice"; };
  r.request();
  await r.idle();
  expect(deployed).toEqual(["a", "a+rice"]);
  // Unchanged source: nothing to build; forced (an access change): builds.
  r.request();
  await r.idle();
  expect(deployed).toHaveLength(2);
  r.request(true);
  await r.idle();
  expect(deployed).toHaveLength(3);
  // Many triggers while one runs coalesce into one more run.
  during = () => { source = "b"; r.request(); r.request(); r.request(); };
  r.request(true);
  await r.idle();
  expect(deployed.slice(3)).toEqual(["a+rice", "b"]);
  r.dispose();
});

it("D-436: a failed rebuild stays owed (persisted), retries with backoff until it lands, and stops when the project closes", async () => {
  const persisted: boolean[] = [];
  let fail = 2, deploys = 0;
  const events: string[] = [];
  const r = siteRebuilder({
    signature: async () => "s",
    deploy: async () => { deploys++; if (fail-- > 0) throw new Error("sharing:offline"); },
    persist: owed => { persisted.push(owed); },
    report: e => events.push(e.status),
    retryMs: [5, 10],
  });
  r.request();
  await expect.poll(() => deploys, { timeout: 5000 }).toBe(3);
  await r.idle();
  expect(events).toEqual(["failed", "failed", "built"]);
  expect(persisted).toEqual([true, false]);
  expect(r.owed()).toBe(false);
  // Owed at the last close: the next launch builds once by itself.
  let restarted = 0;
  const again = siteRebuilder({ signature: async () => "s", deploy: async () => { restarted++; }, owedAtStart: true });
  await again.idle();
  expect(restarted).toBe(1);
  // Closing the project cancels a pending retry.
  let closedDeploys = 0;
  const closing = siteRebuilder({ signature: async () => "x", deploy: async () => { closedDeploys++; throw new Error("sharing:offline"); }, retryMs: [20] });
  closing.request();
  await expect.poll(() => closedDeploys).toBe(1);
  closing.dispose();
  await delay(60);
  expect(closedDeploys).toBe(1);
});

it("D-436 (27 November): Publish's Make public commit landing after the site rebuild still ends up on the deployed site", async () => {
  const root = await temp();
  const publicNotes = join(root, "notes"), privateNotes = join(root, "private", "notes");
  await mkdir(publicNotes, { recursive: true });
  await mkdir(privateNotes, { recursive: true });
  await mkdir(join(root, "private", ".focus-notes"), { recursive: true });
  await writeFile(join(publicNotes, "exploratory-conversation.md"), "# Exploratory conversation\n\nPublic for a moment.\n");
  await writeFile(join(publicNotes, "hello.md"), "# Hello\n\nAlready public.\n");
  await writeFile(join(privateNotes, "rice-pudding.md"), "# Rice pudding\n\nSoak the rice.\n");
  const pairing: SitePairing = { version: 1, project: "ada/book-private", owner: "ada", name: "book", intent: "11111111-1111-1111-1111-111111111111", phase: "ready", site: "https://ada.github.io/book/" };
  await writeFile(join(root, "private", ".focus-notes", "site-pairing.json"), JSON.stringify(pairing));
  const reader = await temp();
  await mkdir(join(reader, "assets"));
  await writeFile(join(reader, "render.mjs"), RENDER);
  const github = new FakeGitHub();
  github.add({ owner: "ada", name: "book", files: [".github/workflows/pages.yml"] });
  github.add({ owner: "ada", name: "book-private", private: true, files: [] });
  const git = gitData(github);
  const api = new GitHubApi(github.token, git.fetch);
  const layout: SharingLayout = { legacy: true, privateDir: join(root, "private"), privateNotes, publicDir: root, roots: [] };
  // The publisher's upload: the first one is held between the build's read of notes/ and its push, as on 27 November.
  let hold: (() => Promise<void>) | undefined;
  const inner = pagesArtifactPublisher({ api: async () => api, target: async () => pairing, get: git.get, timeoutMs: 2000, delayMs: 1 });
  const runtime = sharingRuntime({
    root: () => root, layout: () => layout, api: async () => api,
    repository: async dir => dir === root ? "ada/book" : "ada/book-private",
    write: (file, text) => writeFile(file, text), written: () => {}, temporary: await temp(), reader: () => reader, get: git.get,
    publisher: async (project, artifact) => { const h = hold; hold = undefined; await h?.(); return inner(project, artifact); },
  });
  const signature = async () => (await readdir(publicNotes)).sort().join(",");
  const rebuilds = siteRebuilder({ signature, deploy: async () => { await runtime.takeDown(); }, retryMs: [5] });
  // Make private: exploratory-conversation leaves notes/, and its rebuild starts reading notes/.
  await rename(join(publicNotes, "exploratory-conversation.md"), join(privateNotes, "exploratory-conversation.md"));
  hold = async () => {
    // Make public: rice-pudding is committed while that rebuild is still uploading (before its push lands).
    await rename(join(privateNotes, "rice-pudding.md"), join(publicNotes, "rice-pudding.md"));
    rebuilds.request();
  };
  rebuilds.request();
  await rebuilds.idle();
  const site = git.site("ada/book");
  expect(site.has("n/rice-pudding/index.html")).toBe(true);
  expect(site.has("n/hello/index.html")).toBe(true);
  expect(site.has("n/exploratory-conversation/index.html")).toBe(false);
  rebuilds.dispose();
});

it("D-436: Publish A, then B, then a share update: A and B both stay on the deployed site", async () => {
  const root = await temp();
  const notesDir = join(root, "notes");
  await mkdir(join(root, ".focus-notes"), { recursive: true });
  await mkdir(notesDir, { recursive: true });
  const pairing: SitePairing = { version: 1, project: "ada/book", owner: "ada", name: "quiet-site", intent: "11111111-1111-1111-1111-111111111111", phase: "ready", site: "https://ada.github.io/quiet-site/" };
  await writeFile(join(root, ".focus-notes", "site-pairing.json"), JSON.stringify(pairing));
  await writeFile(join(notesDir, "a.md"), "# A\n\nFirst.\n");
  await writeFile(join(notesDir, "b.md"), "# B\n\nSecond.\n");
  const reader = await temp();
  await mkdir(join(reader, "assets"));
  await writeFile(join(reader, "render.mjs"), RENDER);
  const github = new FakeGitHub();
  github.add({ owner: "ada", name: "quiet-site", files: [".github/workflows/pages.yml"] });
  github.add({ owner: "ada", name: "book", private: true, files: [] });
  const git = gitData(github);
  const api = new GitHubApi(github.token, git.fetch);
  const layout: SharingLayout = { legacy: false, privateDir: root, privateNotes: notesDir, roots: [] };
  const runtime = sharingRuntime({
    root: () => root, layout: () => layout, api: async () => api, repository: async () => "ada/book",
    // A slow disk: the published list's write takes a while.
    write: async (file, text) => { await delay(30); await writeFile(file, text); }, written: () => {}, temporary: await temp(),
    publisher: pagesArtifactPublisher({ api: async () => api, target: async () => pairing, get: git.get, timeoutMs: 2000, delayMs: 1 }),
    reader: () => reader, get: git.get,
    publishStep: step => { if (step === "publishing") onPush?.(); },
  });
  let onPush: (() => void) | undefined;
  await runtime.publishNotes({ notes: ["a.md"] });
  // A share update (D-433) queued behind B's Publish in the same lane, while B's upload runs.
  let share: Promise<void> | undefined;
  onPush = () => { onPush = undefined; share = runtime.publish(); };
  await runtime.publishNotes({ notes: ["b.md"] });
  await share;
  const site = git.site("ada/quiet-site");
  expect(site.has("n/a/index.html")).toBe(true);
  expect(site.has("n/b/index.html")).toBe(true);
});
