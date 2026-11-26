import { expect, it } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BlobTooLargeError, GitHubApi, MAX_BLOB_BYTES } from "@focus-notes/github";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { projectSharingLayout } from "../src/main/share/layout.ts";
import { sharingRuntime } from "../src/main/share/runtime.ts";
import { pagesArtifactPublisher } from "../src/main/share/site-publish.ts";
import { gitData } from "./fake-pages.ts";

const PRIVATE_TEXT = "# Private draft\n\nThis sentence is private and long enough to be leak-checked.\n";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "sharing-site-publish-"));
  const root = join(directory, "project");
  await mkdir(join(root, "notes"), { recursive: true });
  await mkdir(join(root, ".focus-notes"));
  await writeFile(join(root, "notes", "private-draft.md"), PRIVATE_TEXT);
  const github = new FakeGitHub();
  github.add({ owner: "ada", name: "book", private: true, files: ["notes/private-draft.md"] });
  const git = gitData(github);
  const steps: string[] = [];
  const deps = {
    root: () => root, layout: () => projectSharingLayout(root, true),
    api: async () => new GitHubApi(github.token, git.fetch), repository: async () => "ada/book",
    write: async (file: string, text: string) => { await mkdir(join(file, ".."), { recursive: true }); await writeFile(file, text); },
    written: (_file: string) => {}, temporary: directory, get: git.get, step: (step: string) => { steps.push(step); },
  };
  return { directory, root, github, git, steps, deps, runtime: sharingRuntime(deps) };
}
const writes = (github: FakeGitHub, repo: string) => github.calls.filter(c => c.method !== "GET" && c.path.startsWith(`/repos/${repo}/`));
const created = (github: FakeGitHub) => github.calls.filter(c => c.method === "POST" && c.path === "/user/repos");
/** The production publisher with short Pages polling, so a failed run is seen within milliseconds. */
const fastRuntime = (t: Awaited<ReturnType<typeof fixture>>, timeoutMs = 2_000) => {
  const runtime: ReturnType<typeof sharingRuntime> = sharingRuntime({ ...t.deps, publisher: pagesArtifactPublisher({
    api: t.deps.api, get: t.git.get, timeoutMs, delayMs: 5, pushed: () => t.steps.push("deploy"),
    target: async () => ({ ...(await runtime.pairing())! }),
  }) });
  return runtime;
};

it("PRJ-10 G2.1/G2.3: production setup (no candidate flag or publisher) creates one paired public site and deploys its sealed build", async () => {
  const t = await fixture();
  try {
    expect(await t.runtime.describe()).toMatchObject({ project: "ada/book", name: "notes-site", site: "https://ada.github.io/notes-site/", phase: "unconfigured" });
    expect(t.github.calls.every(c => c.method === "GET")).toBe(true);
    const ready = await t.runtime.enable("notes-site");
    expect(ready).toMatchObject({ phase: "ready", site: "https://ada.github.io/notes-site/" });
    expect(created(t.github)).toHaveLength(1);
    expect(t.github.repo("notes-site")).toMatchObject({ private: false });
    const site = t.git.site("ada/notes-site");
    expect(JSON.parse(site.get("focus-notes.json")!)).toMatchObject({ format: 1, vault: false });
    expect([...site.values()].join("\n")).not.toContain("This sentence is private");
    // The private project is only ever read; no reader credential is added anywhere.
    expect(writes(t.github, "ada/book")).toEqual([]);
    expect(t.github.calls.filter(c => /\/(?:keys|actions\/secrets)/.test(c.path))).toEqual([]);
    expect(t.github.calls.filter(c => c.method === "PATCH").every(c => (c.body as { force?: boolean }).force === false)).toBe(true);
    expect(await readFile(join(t.root, "notes", "private-draft.md"), "utf8")).toBe(PRIVATE_TEXT);
    expect(t.steps).toEqual(expect.arrayContaining(["check", "create", "prepare", "push", "pages", "ready"]));
    expect((await readdir(t.directory)).filter(name => name.startsWith("sealed-site-"))).toEqual([]);
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("G2.2: offline or refused push keeps the chosen site and private bytes; Retry reconciles without a second repository", async () => {
  const t = await fixture();
  try {
    t.github.fail("POST /repos/ada/quiet-site/git/trees", 403, "Resource not accessible");
    await expect(t.runtime.enable("quiet-site")).rejects.toThrow("sharing:refused");
    expect(await t.runtime.pairing()).toMatchObject({ name: "quiet-site", phase: "created" });
    t.github.offline = true;
    await expect(t.runtime.enable("quiet-site")).rejects.toThrow("sharing:offline");
    t.github.offline = false;
    expect(await t.runtime.describe()).toMatchObject({ name: "quiet-site", phase: "created" });
    await expect(t.runtime.enable("quiet-site")).resolves.toMatchObject({ phase: "ready" });
    expect(created(t.github)).toHaveLength(1);
    expect(t.git.pushes).toEqual(["ada/quiet-site"]);
    expect(await readFile(join(t.root, "notes", "private-draft.md"), "utf8")).toBe(PRIVATE_TEXT);
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("G2.3: a push Pages doesn't serve yet never stores readiness; Retry deploys a fresh build", async () => {
  const t = await fixture();
  try {
    t.git.setStale(true);
    const runtime = sharingRuntime({ ...t.deps, publisher: pagesArtifactPublisher({
      api: t.deps.api, get: t.git.get, timeoutMs: 20, delayMs: 5,
      target: async () => ({ ...(await runtime.pairing())! }),
    }) });
    await expect(runtime.enable("notes-site")).rejects.toThrow("sharing:unacknowledged");
    expect((await runtime.pairing())?.phase).toBe("created");
    t.git.setStale(false);
    await expect(runtime.enable("notes-site")).resolves.toMatchObject({ phase: "ready" });
    expect(created(t.github)).toHaveLength(1);
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("24 Nov: a failed first Pages run is re-run once and setup finishes; it reports the deploy wait after the push", async () => {
  const t = await fixture();
  try {
    t.git.failPagesRuns(1);
    const runtime = fastRuntime(t);
    await expect(runtime.enable("notes-site")).resolves.toMatchObject({ phase: "ready" });
    expect(t.github.calls.filter(c => /rerun-failed-jobs$/.test(c.path))).toHaveLength(1);
    expect(t.steps.indexOf("deploy")).toBeGreaterThan(t.steps.indexOf("push"));
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("24 Nov: a Pages run that fails again ends the wait at once with sharing:pages; Retry deploys a fresh build to the same site", async () => {
  const t = await fixture();
  try {
    t.git.failPagesRuns(2);
    const runtime = fastRuntime(t, 60_000);
    const started = Date.now();
    await expect(runtime.enable("notes-site")).rejects.toThrow("sharing:pages");
    expect(Date.now() - started).toBeLessThan(10_000);
    expect((await runtime.pairing())?.phase).toBe("created");
    await expect(runtime.enable("notes-site")).resolves.toMatchObject({ phase: "ready" });
    expect(created(t.github)).toHaveLength(1);
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("D-432: a push from elsewhere landing mid-upload is kept and the upload is rebuilt on top; one that never stops is sharing:moved", async () => {
  const t = await fixture();
  try {
    const runtime: ReturnType<typeof sharingRuntime> = sharingRuntime({ ...t.deps, publisher: pagesArtifactPublisher({
      api: t.deps.api, get: t.git.get, timeoutMs: 2_000, delayMs: 5, retryDelaysMs: [1, 1, 1],
      target: async () => ({ ...(await runtime.pairing())! }),
    }) });
    await expect(runtime.enable("notes-site")).resolves.toMatchObject({ phase: "ready" });
    const blobPosts = (from: number) => t.github.calls.slice(from).filter(c => c.method === "POST" && c.path === "/repos/ada/notes-site/git/blobs").map(c => (c.body as { content: string }).content);
    // The owner's backup pushes the private pointer twice while the site uploads: both pushes stay, the site is served.
    t.git.pushElsewhere("ada/notes-site", 2);
    const before = t.github.calls.length;
    await expect(runtime.takeDown()).resolves.toMatchObject({ commit: expect.any(String) });
    expect(t.git.headFiles("ada/notes-site")).toEqual(expect.arrayContaining(["elsewhere-1.txt", "elsewhere-2.txt"]));
    expect(t.github.calls.filter(c => c.method === "PATCH" && c.path === "/repos/ada/notes-site/git/refs/heads/main").every(c => (c.body as { force?: boolean }).force === false)).toBe(true);
    // Each blob goes up once, however many attempts the commit took.
    const sent = blobPosts(before);
    expect(new Set(sent).size).toBe(sent.length);
    t.git.pushElsewhere("ada/notes-site", 4);
    await expect(runtime.takeDown()).rejects.toThrow("sharing:moved");
    expect(t.git.headFiles("ada/notes-site")).toEqual(expect.arrayContaining(["elsewhere-3.txt", "elsewhere-6.txt"]));
    // Once the branch is still, Retry lands.
    await expect(runtime.takeDown()).resolves.toMatchObject({ commit: expect.any(String) });
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("24 Nov: an existing notes-site made by Focus Notes, or an empty one, is adopted; someone else's stays taken", async () => {
  for (const existing of [{ description: "Focus Notes site d14492eb-2f57-4ffd-a24a-bcd76f8dcb86", files: ["README.md"] }, { files: ["README.md"] }]) {
    const t = await fixture();
    try {
      t.github.add({ owner: "ada", name: "notes-site", files: existing.files });
      if (existing.description) t.github.repo("notes-site")!.description = existing.description;
      await expect(fastRuntime(t).enable("notes-site")).resolves.toMatchObject({ phase: "ready" });
      expect(created(t.github)).toHaveLength(0);
    } finally { await rm(t.directory, { recursive: true, force: true }); }
  }
  const t = await fixture();
  try {
    t.github.add({ owner: "ada", name: "notes-site", files: ["README.md", "index.html"] });
    await expect(fastRuntime(t).enable("notes-site")).rejects.toThrow("sharing:taken");
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("UC-SHARE-12: Turn off keeps private notes, deploys an empty site, and re-enable never republishes", async () => {
  const t = await fixture();
  try {
    await t.runtime.enable("notes-site");
    const off = await t.runtime.disable();
    expect(off.phase).toBe("off");
    const site = t.git.site("ada/notes-site");
    expect([...site.keys()].sort()).toEqual(["focus-notes.json", "notes/index.json"]);
    expect(JSON.parse(site.get("notes/index.json")!).notes).toEqual([]);
    expect(t.steps).toEqual(expect.arrayContaining(["preserve", "remove"]));
    expect(await readFile(join(t.root, "notes", "private-draft.md"), "utf8")).toBe(PRIVATE_TEXT);
    await expect(t.runtime.publish()).rejects.toThrow("access:site.unavailable");
    const pushes = t.git.pushes.length;
    await expect(t.runtime.enable("notes-site")).resolves.toMatchObject({ phase: "ready" });
    expect(t.git.pushes).toHaveLength(pushes);
    expect(created(t.github)).toHaveLength(1);
    expect(writes(t.github, "ada/book")).toEqual([]);
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("G2.3: failed preservation stops removal and leaves sharing on", async () => {
  const t = await fixture();
  try {
    await t.runtime.enable("notes-site");
    const pushes = t.git.pushes.length;
    await rm(join(t.root, "notes"), { recursive: true });
    await expect(t.runtime.disable()).rejects.toThrow("sharing:preservation");
    expect(t.git.pushes).toHaveLength(pushes);
    expect((await t.runtime.pairing())?.phase).toBe("ready");
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("a share publish queued behind Turn off can't redeploy the removed site", async () => {
  const t = await fixture();
  try {
    await t.runtime.enable("notes-site");
    const [off, late] = await Promise.allSettled([t.runtime.disable(), t.runtime.publish()]);
    expect(off).toMatchObject({ status: "fulfilled", value: { phase: "off" } });
    expect(late).toMatchObject({ status: "rejected", reason: new Error("access:site.unavailable") });
    expect([...t.git.site("ada/notes-site").keys()].sort()).toEqual(["focus-notes.json", "notes/index.json"]);
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("WP-9.9: publishes binary files byte for byte", async () => {
  const t = await fixture();
  try {
    const dir = join(t.directory, "artifact");
    await mkdir(dir);
    await writeFile(join(dir, "focus-notes.json"), JSON.stringify({ build: "b" }));
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xfe, 0x80, 0x0a]);
    await writeFile(join(dir, "image.jpg"), bytes);
    t.github.add({ owner: "ada", name: "notes-site", files: ["README.md"] });
    const publish = pagesArtifactPublisher({ api: t.deps.api, get: t.git.get, delayMs: 1, target: async () => ({ project: "ada/book", owner: "ada", name: "notes-site", site: "https://ada.github.io/notes-site/" }) });
    await expect(publish("ada/book", { directory: dir, build: "b" })).resolves.toMatchObject({ pages: { status: "built" } });
    expect(t.git.siteBytes("ada/notes-site").get("image.jpg")).toEqual(bytes);
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("Turn off withdraws earlier shares after the phase checks and before the empty site deploys", async () => {
  const t = await fixture();
  try {
    const order: string[] = [];
    const runtime = sharingRuntime({ ...t.deps, withdrawShares: async () => { order.push(`withdraw:${t.git.pushes.length}`); } });
    await expect(runtime.disable()).rejects.toThrow("sharing:unconfigured");
    expect(order).toEqual([]);
    await runtime.enable("notes-site");
    const pushes = t.git.pushes.length;
    await expect(runtime.disable()).resolves.toMatchObject({ phase: "off" });
    expect(order).toEqual([`withdraw:${pushes}`]);
    expect(t.git.pushes).toHaveLength(pushes + 1);
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("a failed share withdrawal stops Turn off and keeps sharing on", async () => {
  const t = await fixture();
  try {
    const runtime = sharingRuntime({ ...t.deps, withdrawShares: async () => { throw new Error("access:failed"); } });
    await runtime.enable("notes-site");
    const pushes = t.git.pushes.length;
    await expect(runtime.disable()).rejects.toThrow("sharing:failed");
    expect(t.git.pushes).toHaveLength(pushes);
    expect((await runtime.pairing())?.phase).toBe("ready");
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("refuses a file too large for GitHub, or a target that is the private project, before any write", async () => {
  const t = await fixture();
  try {
    const dir = join(t.directory, "artifact");
    await mkdir(dir);
    await writeFile(join(dir, "focus-notes.json"), "{}");
    await writeFile(join(dir, "image.bin"), Buffer.from([0xff, 0xfe, 0x00]));
    class TooLarge extends GitHubApi { override async createBlob(): Promise<string> { throw new BlobTooLargeError(MAX_BLOB_BYTES + 1); } }
    const tooLarge = new TooLarge(t.github.token, t.git.fetch);
    const publish = pagesArtifactPublisher({ api: async () => tooLarge, get: t.git.get, target: async () => ({ project: "ada/book", owner: "ada", name: "notes-site", site: "https://ada.github.io/notes-site/" }) });
    t.github.add({ owner: "ada", name: "notes-site", files: ["README.md"] });
    await expect(publish("ada/book", { directory: dir, build: "b" })).rejects.toThrow("sharing:artifact");
    const self = pagesArtifactPublisher({ api: t.deps.api, get: t.git.get, target: async () => ({ project: "ada/book", owner: "ada", name: "book", site: "https://ada.github.io/book/" }) });
    await expect(self("ada/book", { directory: dir, build: "b" })).rejects.toThrow("sharing:refused");
    expect(t.github.calls.filter(c => c.method !== "GET")).toEqual([]);
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});
