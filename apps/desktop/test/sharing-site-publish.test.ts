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
