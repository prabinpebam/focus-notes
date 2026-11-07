import { expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitHubApi } from "@focus-notes/github";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { projectSharingLayout } from "../src/main/share/layout.ts";
import { sharingRuntime } from "../src/main/share/runtime.ts";
import { accessStore } from "../src/main/share/access.ts";
import type { SealedArtifactPublisher } from "../src/main/share/site.ts";

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "sharing-runtime-"));
  const root = join(directory, "project");
  await mkdir(join(root, "notes"), { recursive: true });
  await mkdir(join(root, ".focus-notes"));
  await writeFile(join(root, "notes", "private-draft.md"), "# Private draft\n\nNever publish this source.\n");
  const github = new FakeGitHub();
  github.add({ owner: "ada", name: "book", private: true, files: ["notes/private-draft.md"] });
  const steps: string[] = [], artifacts: string[] = [];
  let active = root;
  const publisher: SealedArtifactPublisher = async (project, artifact) => {
    expect(project).toBe("ada/book");
    const manifest = JSON.parse(await readFile(join(artifact.directory, "focus-notes.json"), "utf8"));
    expect(manifest.build).toBe(artifact.build);
    expect(manifest.vault).toBe(false);
    expect(JSON.parse(await readFile(join(artifact.directory, "notes", "index.json"), "utf8")).notes).toEqual([]);
    expect(await readdir(artifact.directory)).not.toContain("private-draft.md");
    artifacts.push(artifact.directory);
    return { status: "published", commit: "a".repeat(40), pages: { status: "built", repository: "ada/quiet-site", build: artifact.build } };
  };
  const deps = {
    root: () => active, layout: () => projectSharingLayout(active, true),
    api: async () => new GitHubApi(github.token, github.fetch), repository: async () => "ada/book",
    write: async (file: string, text: string) => { await mkdir(join(file, ".."), { recursive: true }); await writeFile(file, text); },
    written: (_file: string) => {}, temporary: directory, publisher, step: (step: string) => { steps.push(step); },
  };
  return { directory, root, github, steps, artifacts, deps, runtime: sharingRuntime(deps), switch: (root: string) => { active = root; } };
}

it("PRJ-10: wires persisted New-project setup without a candidate flag, owner vault or public source", async () => {
  const t = await fixture();
  try {
    expect(await t.runtime.describe()).toMatchObject({ name: "notes-site", phase: "unconfigured" });
    expect(t.github.calls.every(call => call.method === "GET")).toBe(true);
    expect(await t.runtime.pairing()).toBeUndefined();
    await t.runtime.enable("quiet-site");
    expect(await t.runtime.pairing()).toMatchObject({ phase: "ready", site: "https://ada.github.io/quiet-site/" });
    const store = accessStore({
      dir: () => t.root, site: async () => (await t.runtime.pairing())?.site,
      configured: async () => (await t.runtime.pairing())?.phase === "ready",
      write: t.deps.write, written: t.deps.written,
    });
    expect(await store.load()).toMatchObject({ available: true, configured: true, vault: false, grants: [] });
    expect(t.artifacts).toHaveLength(1);
    expect(await readdir(t.directory)).not.toContain(t.artifacts[0]!.split(/[\\/]/).at(-1));
    expect(await readFile(join(t.root, "notes", "private-draft.md"), "utf8")).toBe("# Private draft\n\nNever publish this source.\n");
    expect(t.github.calls.filter(call => /\/(?:keys|actions\/secrets)/.test(call.path))).toEqual([]);
    await t.runtime.enable("quiet-site");
    expect(t.artifacts).toHaveLength(1);
    expect(t.github.calls.filter(call => call.method === "POST" && call.path === "/user/repos")).toHaveLength(1);
    expect(t.steps).toContain("push");
    await expect(t.runtime.disable()).rejects.toThrow("sharing:unavailable");
    expect((await t.runtime.pairing())?.phase).toBe("ready");
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("keeps partial setup for Retry when G3's real artifact publisher is unavailable, never reports readiness", async () => {
  const t = await fixture();
  try {
    const runtime = sharingRuntime({ ...t.deps, publisher: async () => ({ status: "unavailable" }) });
    await expect(runtime.enable("quiet-site")).rejects.toThrow("sharing:unavailable");
    expect((await runtime.pairing())?.phase).toBe("created");
    expect(t.steps).not.toContain("ready");
    expect((await readdir(t.directory)).filter(name => name.startsWith("sealed-site-"))).toEqual([]);
    await t.runtime.enable("quiet-site");
    expect((await t.runtime.pairing())?.phase).toBe("ready");
    expect(t.github.calls.filter(call => call.method === "POST" && call.path === "/user/repos")).toHaveLength(1);
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("does not store readiness or write a second project's pairing after switching during an artifact push", async () => {
  const t = await fixture();
  try {
    let release!: () => void;
    let started!: () => void;
    const pushing = new Promise<void>(resolve => { started = resolve; });
    const runtime = sharingRuntime({ ...t.deps, publisher: async () => {
      started();
      await new Promise<void>(resolve => { release = resolve; });
      return { status: "unavailable" };
    } });
    const enabling = runtime.enable("quiet-site");
    const failure = expect(enabling).rejects.toThrow("sharing:changed");
    await pushing;
    const other = join(t.directory, "other");
    await mkdir(join(other, "notes"), { recursive: true });
    t.switch(other);
    release();
    await failure;
    expect(await readdir(other)).toEqual(["notes"]);
    t.switch(t.root);
    expect((await runtime.pairing())?.phase).toBe("created");
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it("production unavailable setup refuses before creating, publishing or changing pairing", async () => {
  const t = await fixture();
  try {
    const runtime = sharingRuntime({ ...t.deps, publisher: undefined });
    await expect(runtime.enable("notes-site")).rejects.toThrow("sharing:unavailable");
    expect(await runtime.pairing()).toBeUndefined();
    expect(t.github.calls).toEqual([]);
    expect(t.artifacts).toEqual([]);
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});

it.each(["building", "errored"] as const)("never persists readiness for Pages status %s", async status => {
  const t = await fixture();
  try {
    const runtime = sharingRuntime({ ...t.deps, publisher: async (_project, artifact) => ({
      status: "published", commit: "a".repeat(40), pages: { status, repository: "ada/quiet-site", build: artifact.build },
    }) });
    await expect(runtime.enable("quiet-site")).rejects.toThrow("sharing:unacknowledged");
    expect((await runtime.pairing())?.phase).toBe("created");
    expect(t.steps).not.toContain("ready");
  } finally { await rm(t.directory, { recursive: true, force: true }); }
});
