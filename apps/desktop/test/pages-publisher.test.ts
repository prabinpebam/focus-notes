import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { GitHubApi } from "@focus-notes/github";
import { pagesPublisher, type PagesPublishState } from "../src/main/share/pages-publisher.ts";
import { sharingRuntime } from "../src/main/share/runtime.ts";
import type { SharingLayout } from "../src/main/share/layout.ts";
import type { SitePairing } from "../src/main/share/setup.ts";

type RunState = "queued" | "in_progress" | "success" | "failure";

/** The Git Data and Actions runs protocol of one public repository, in memory: nothing leaves the process. */
class FakePagesRepo {
  readonly calls: { method: string; path: string }[] = [];
  readonly blobs = new Map<string, Buffer>();
  readonly trees = new Map<string, Map<string, string>>();
  readonly commits = new Map<string, { tree: string; parent?: string }>();
  head: string;
  /** Each pushed commit's workflow states, one per poll; the last repeats. */
  runs: RunState[] = ["queued", "in_progress", "success"];
  readonly polls = new Map<string, number>();
  offline = false;
  #n = 0;
  readonly repo: { owner: string; name: string; private: boolean; push: boolean };
  constructor(repo = { owner: "ada", name: "quiet-site", private: false, push: true }) {
    this.repo = repo;
    const tree = this.#id();
    this.trees.set(tree, new Map([[".github/workflows/pages.yml", this.#blob(Buffer.from("workflow"))]]));
    this.head = this.#id();
    this.commits.set(this.head, { tree });
  }
  #id() { return createHash("sha1").update(String(++this.#n)).digest("hex"); }
  #blob(bytes: Buffer) {
    const sha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    this.blobs.set(sha, bytes);
    return sha;
  }
  files(commit = this.head): Map<string, string> {
    const tree = this.trees.get(this.commits.get(commit)!.tree)!;
    return new Map([...tree].map(([path, sha]) => [path, this.blobs.get(sha)!.toString("utf8")]));
  }
  get writes() { return this.calls.filter(c => c.method !== "GET"); }
  fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    const { pathname, searchParams } = new URL(url);
    this.calls.push({ method, path: pathname + (searchParams.size ? `?${searchParams}` : "") });
    if (this.offline) throw new TypeError("fetch failed");
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const base = `/repos/${this.repo.owner}/${this.repo.name}`;
    if (!pathname.startsWith(base)) return json(404, { message: "Not Found" });
    const rest = pathname.slice(base.length);
    if (rest === "" && method === "GET") return json(200, { name: this.repo.name, owner: { login: this.repo.owner }, default_branch: "main", private: this.repo.private, permissions: { push: this.repo.push, admin: this.repo.push } });
    if (rest === "/git/ref/heads/main") return json(200, { object: { sha: this.head } });
    let m = /^\/git\/commits\/([a-f0-9]{40})$/.exec(rest);
    if (m && method === "GET") return json(200, { tree: { sha: this.commits.get(m[1]!)!.tree } });
    m = /^\/git\/trees\/([a-f0-9]{40})$/.exec(rest);
    if (m && method === "GET") return json(200, { truncated: false, tree: [...this.trees.get(m[1]!)!].map(([path, sha]) => ({ path, sha, type: "blob" })) });
    if (rest === "/git/blobs" && method === "POST") return json(201, { sha: this.#blob(Buffer.from(body.content, "base64")) });
    if (rest === "/git/trees" && method === "POST") {
      const tree = new Map(body.base_tree ? this.trees.get(body.base_tree) : []);
      for (const e of body.tree as { path: string; sha: string | null }[]) if (e.sha === null) tree.delete(e.path); else tree.set(e.path, e.sha);
      const id = this.#id();
      this.trees.set(id, tree);
      return json(201, { sha: id });
    }
    if (rest === "/git/commits" && method === "POST") {
      const id = this.#id();
      this.commits.set(id, { tree: body.tree, parent: body.parents[0] });
      return json(201, { sha: id });
    }
    if (rest === "/git/refs/heads/main" && method === "PATCH") {
      if (body.force !== false || this.commits.get(body.sha)?.parent !== this.head) return json(422, { message: "Update is not a fast forward" });
      this.head = body.sha;
      return json(200, { object: { sha: body.sha } });
    }
    if (rest === "/actions/runs" && method === "GET") {
      const sha = searchParams.get("head_sha")!;
      const poll = this.polls.get(sha) ?? 0;
      this.polls.set(sha, poll + 1);
      if (!this.commits.get(sha)?.parent) return json(200, { workflow_runs: [] });
      const state = this.runs[Math.min(poll, this.runs.length - 1)]!;
      return json(200, { workflow_runs: [
        { id: 1, path: ".github/workflows/other.yml", status: "completed", conclusion: "success" },
        { id: 2, path: ".github/workflows/pages.yml", status: state === "success" || state === "failure" ? "completed" : state, conclusion: state === "success" || state === "failure" ? state : null },
      ] });
    }
    return json(404, { message: `Unhandled ${method} ${rest}` });
  };
}

const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.splice(0).map(d => rm(d, { recursive: true, force: true }))); });
const temp = async () => { const d = await mkdtemp(join(tmpdir(), "fn-pages-")); dirs.push(d); return d; };
async function artifact(files: Record<string, string>, build = "b".repeat(16)) {
  const directory = await temp();
  for (const [path, text] of Object.entries({ "focus-notes.json": JSON.stringify({ format: 1, build }), ...files })) {
    await mkdir(join(directory, path, ".."), { recursive: true });
    await writeFile(join(directory, path), text);
  }
  return { directory, build };
}
const target = async () => ({ owner: "ada", name: "quiet-site" });

it("G3.1: pushes one fast-forward commit of the artifact, then Published only after that commit's Pages run succeeds", async () => {
  const fake = new FakePagesRepo();
  const states: [PagesPublishState, string | undefined][] = [];
  const publish = pagesPublisher({ api: async () => new GitHubApi("t", fake.fetch), target, delayMs: 1, state: (s, c) => states.push([s, c]) });
  const out = await artifact({ "notes/index.json": "{}", "_sealed/x/y.json": "{\"data\":\"c2VhbGVk\"}" });
  const result = await publish("ada/book", out);
  expect(result).toEqual({ status: "published", commit: fake.head, pages: { status: "built", repository: "ada/quiet-site", build: out.build } });
  expect([...fake.files().keys()].sort()).toEqual([".github/workflows/pages.yml", "site/_sealed/x/y.json", "site/focus-notes.json", "site/notes/index.json"]);
  expect(fake.writes.filter(c => c.path.endsWith("/git/commits"))).toHaveLength(1);
  expect(states).toEqual([["saving", undefined], ["queued", fake.head], ["building", fake.head], ["built", fake.head]]);
  expect(fake.polls.get(fake.head)).toBe(3);
});

it("G3.4: a republish without a note removes it from the current site; the previous commit (history) is untouched", async () => {
  const fake = new FakePagesRepo();
  const publish = pagesPublisher({ api: async () => new GitHubApi("t", fake.fetch), target, delayMs: 1 });
  await publish("ada/book", await artifact({ "notes/a.md": "A", "notes/b.md": "B" }, "a".repeat(16)));
  const first = fake.head;
  await publish("ada/book", await artifact({ "notes/a.md": "A" }, "c".repeat(16)));
  expect(fake.files().has("site/notes/b.md")).toBe(false);
  expect(fake.files().get("site/notes/a.md")).toBe("A");
  expect(fake.files(first).get("site/notes/b.md")).toBe("B");
  // Unchanged blobs are not uploaded again.
  expect(fake.writes.filter(c => c.path.endsWith("/git/blobs"))).toHaveLength(3 + 1);
});

it("G3.4: a failed Pages run is never Published, and Retry publishes a new exact commit", async () => {
  const fake = new FakePagesRepo();
  fake.runs = ["queued", "failure"];
  const publish = pagesPublisher({ api: async () => new GitHubApi("t", fake.fetch), target, delayMs: 1 });
  const failed = await publish("ada/book", await artifact({}, "d".repeat(16)));
  expect(failed).toMatchObject({ status: "published", pages: { status: "errored" } });
  fake.runs = ["success"];
  const retried = await publish("ada/book", await artifact({}, "e".repeat(16)));
  expect(retried).toMatchObject({ pages: { status: "built" }, commit: fake.head });
  expect(retried.status === "published" && failed.status === "published" && retried.commit !== failed.commit).toBe(true);
});

it("G3.5: a Pages run still building at the timeout reports building, never built", async () => {
  const fake = new FakePagesRepo();
  fake.runs = ["in_progress"];
  const publish = pagesPublisher({ api: async () => new GitHubApi("t", fake.fetch), target, delayMs: 1, timeoutMs: 20 });
  await expect(publish("ada/book", await artifact({}))).resolves.toMatchObject({ pages: { status: "building" } });
});

it("refuses before any write: offline, signed out, a private or read-only target, a changed pairing, or a mismatched artifact", async () => {
  const cases: [string, (f: FakePagesRepo) => Parameters<typeof pagesPublisher>[0], string?][] = [
    ["sharing:offline", f => { f.offline = true; return { api: async () => new GitHubApi("t", f.fetch), target }; }],
    ["sharing:signedout", () => ({ api: async () => undefined, target })],
    ["sharing:changed", f => ({ api: async () => new GitHubApi("t", f.fetch), target: async () => undefined })],
    ["sharing:failed", f => ({ api: async () => new GitHubApi("t", f.fetch), target }), "other-build-00000"],
  ];
  for (const [code, setup, build] of cases) {
    const fake = new FakePagesRepo();
    const out = await artifact({});
    await expect(pagesPublisher(setup(fake))("ada/book", build ? { ...out, build } : out)).rejects.toThrow(code);
    expect(fake.writes).toEqual([]);
  }
  for (const repo of [{ owner: "ada", name: "quiet-site", private: true, push: true }, { owner: "ada", name: "quiet-site", private: false, push: false }]) {
    const fake = new FakePagesRepo(repo);
    await expect(pagesPublisher({ api: async () => new GitHubApi("t", fake.fetch), target })("ada/book", await artifact({}))).rejects.toThrow("sharing:refused");
    expect(fake.writes).toEqual([]);
  }
});

async function project(legacy: boolean, options: { reader?: boolean; notes?: Record<string, string> } = {}) {
  const root = await temp();
  const privateDir = legacy ? join(root, "private") : root;
  await mkdir(join(privateDir, "notes"), { recursive: true });
  await mkdir(join(privateDir, ".focus-notes"), { recursive: true });
  await writeFile(join(privateDir, "access.json"), JSON.stringify({ version: 1, grants: [] }));
  const secret = "This private line must never reach the public site.";
  await writeFile(join(privateDir, "notes", "diary.md"), `# Diary\n\n${secret}\n`);
  for (const [path, text] of Object.entries(options.notes ?? {})) {
    await mkdir(join(privateDir, "notes", path, ".."), { recursive: true });
    await writeFile(join(privateDir, "notes", path), text);
  }
  let reader: string | undefined;
  if (options.reader) {
    reader = await temp();
    await mkdir(join(reader, "assets"));
    await writeFile(join(reader, "render.mjs"), "export function renderNotePage({ path }) { const stem = path.replace(/\\.md$/, ''); return { file: `n/${stem}/index.html`, html: `<p>${stem}</p>`, title: stem }; }\n");
  }
  const pairing: SitePairing = { version: 1, project: "ada/book", owner: "ada", name: "quiet-site", intent: "11111111-1111-1111-1111-111111111111", phase: "ready", site: "https://ada.github.io/quiet-site/" };
  await writeFile(join(privateDir, ".focus-notes", "site-pairing.json"), JSON.stringify(pairing));
  const layout: SharingLayout = legacy
    ? { legacy: true, privateDir, privateNotes: join(privateDir, "notes"), publicDir: root, roots: [] }
    : { legacy: false, privateDir, privateNotes: join(privateDir, "notes"), roots: [] };
  const fake = new FakePagesRepo();
  const steps: string[] = [];
  const live = pagesPublisher({ api: async () => new GitHubApi("t", fake.fetch), target: async p => p === "ada/book" ? target() : undefined, delayMs: 1 });
  const runtime = sharingRuntime({
    root: () => root, layout: () => layout, api: async () => new GitHubApi("t", fake.fetch),
    repository: async () => "ada/book", write: (file, text) => writeFile(file, text), written: () => {}, temporary: await temp(),
    publisher: live, live, reader: () => reader, publishStep: step => steps.push(step),
  });
  return { root, privateDir, secret, fake, runtime, steps };
}

it("G3.1 through the runtime: sealing, the leak check and the exact Pages run, with private bytes kept and absent from the push", async () => {
  const { privateDir, secret, fake, runtime } = await project(false);
  const before = await readFile(join(privateDir, "notes", "diary.md"));
  await runtime.publish();
  const pushed = fake.files();
  const manifest = JSON.parse(pushed.get("site/focus-notes.json")!) as { build: string };
  expect(manifest.build).toMatch(/^[A-Za-z0-9_-]+$/);
  expect([...pushed.values()].some(text => text.includes(secret) || text.includes("diary.md"))).toBe(false);
  expect(await readFile(join(privateDir, "notes", "diary.md"))).toEqual(before);
});

it("G3.2: a leak found while sealing makes no public push or deployment", async () => {
  const { root, secret, fake, runtime } = await project(true);
  await mkdir(join(root, "notes"), { recursive: true });
  await writeFile(join(root, "notes", "public.md"), `# Public\n\n${secret}\n`);
  await expect(runtime.publish()).rejects.toThrow(/Leak check failed/);
  expect(fake.calls).toEqual([]);
});

const trip = "# Trip\n\nShort public text.\n";
const publishedOf = async (privateDir: string) => JSON.parse(await readFile(join(privateDir, ".focus-notes", "published.json"), "utf8")) as { notes: string[] };

it("G3.1 Publish: exactly the selected note becomes public with its page, recorded after the exact deploy; private bytes kept", async () => {
  const { privateDir, secret, fake, runtime, steps } = await project(false, { reader: true, notes: { "t/trip.md": trip } });
  const result = await runtime.publishNotes({ notes: ["t/trip.md"] });
  expect(result).toMatchObject({ commit: fake.head, published: ["t/trip.md"], changed: ["t/trip.md"] });
  const site = fake.files();
  expect(site.get("site/notes/t/trip.md")).toBe(trip);
  expect(site.has("site/n/t/trip/index.html")).toBe(true);
  expect([...site.keys()].some(p => p.includes("diary"))).toBe(false);
  expect([...site.values()].some(text => text.includes(secret))).toBe(false);
  expect(steps).toEqual(["saving"]);
  expect(await publishedOf(privateDir)).toEqual({ version: 1, notes: ["t/trip.md"] });
  expect(await readFile(join(privateDir, "notes", "t", "trip.md"), "utf8")).toBe(trip);
  expect(runtime.publishing()).toBeUndefined();
});

it("G3.4 Unpublish: the current site loses the note after its deploy; the private note and old commit stay", async () => {
  const { privateDir, fake, runtime, steps } = await project(false, { reader: true, notes: { "trip.md": trip } });
  await runtime.publishNotes({ notes: ["trip.md"] });
  const before = fake.head;
  await expect(runtime.unpublishNotes(["trip.md"])).resolves.toMatchObject({ published: [], changed: ["trip.md"] });
  expect(fake.files().has("site/notes/trip.md")).toBe(false);
  expect(fake.files().has("site/n/trip/index.html")).toBe(false);
  expect(fake.files(before).has("site/notes/trip.md")).toBe(true);
  expect(await publishedOf(privateDir)).toEqual({ version: 1, notes: [] });
  expect(await readFile(join(privateDir, "notes", "trip.md"), "utf8")).toBe(trip);
  expect(steps).toEqual(["saving", "removing"]);
});

it("G3.4: a failed deploy keeps the recorded site unchanged and Retry publishes", async () => {
  const { privateDir, fake, runtime } = await project(false, { reader: true, notes: { "trip.md": trip } });
  fake.runs = ["failure"];
  await expect(runtime.publishNotes({ notes: ["trip.md"] })).rejects.toThrow("sharing:unacknowledged");
  await expect(readFile(join(privateDir, ".focus-notes", "published.json"))).rejects.toThrow();
  fake.runs = ["success"];
  await expect(runtime.publishNotes({ notes: ["trip.md"] })).resolves.toMatchObject({ published: ["trip.md"] });
});

it("G3.1: without the page renderer, Publish refuses before sealing or any push, never Published", async () => {
  const { fake, runtime } = await project(false, { notes: { "trip.md": trip } });
  await expect(runtime.publishNotes({ notes: ["trip.md"] })).rejects.toThrow("sharing:unavailable");
  expect(fake.calls).toEqual([]);
});

it("G3.2: a published note quoting another private note is still rejected by the leak check with no push", async () => {
  const quoted = "This private line must never reach the public site.";
  const { fake, runtime } = await project(false, { reader: true, notes: { "trip.md": `# Trip\n\n${quoted}\n` } });
  await expect(runtime.publishNotes({ notes: ["trip.md"] })).rejects.toThrow(/Leak check failed/);
  expect(fake.calls).toEqual([]);
});
