import { expect, it } from "vitest";
import { mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitHubApi } from "@focus-notes/github";
import { FakeGitHub } from "../../../packages/github/test/fake-github.ts";
import { parseSitePairing, sharingSetup, sitePairingStore, type SitePairing } from "../src/main/share/setup.ts";

function fixture() {
  const github = new FakeGitHub();
  const privateRepo = github.add({ owner: "ada", name: "book", private: true, files: ["notes/draft.md"] });
  const api = new GitHubApi(github.token, github.fetch);
  let saved: SitePairing | undefined;
  const events: string[] = [];
  const deps = {
    api: async () => api, project: async () => "ada/book",
    read: async () => saved,
    write: async (pairing: SitePairing) => { events.push(`persist:${pairing.phase}`); saved = structuredClone(pairing); },
    initialize: async () => { events.push("initialize"); },
    preserve: async () => { events.push("preserve"); },
    remove: async () => { events.push("remove"); },
    step: (step: string) => { events.push(`step:${step}`); },
  };
  return { github, privateRepo, api, deps, events, saved: () => saved, service: sharingSetup(deps) };
}
const creates = (github: FakeGitHub) => github.calls.filter(call => call.method === "POST" && call.path === "/user/repos");

it("confirmation describes a neutral editable site without persisting or making any public write; Cancel has nothing to undo", async () => {
  const t = fixture();
  expect(await t.service.describe()).toEqual({
    project: "ada/book", owner: "ada", name: "notes-site", site: "https://ada.github.io/notes-site/", phase: "unconfigured",
  });
  expect(t.saved()).toBeUndefined();
  expect(t.github.calls.every(call => call.method === "GET")).toBe(true);
  expect(creates(t.github)).toHaveLength(0);
  expect(t.events).not.toContain("initialize");
});

it("does not create until confirmed; persists one public pairing before readiness without private-reader credentials", async () => {
  const t = fixture();
  expect(t.github.calls).toEqual([]);
  const first = t.service.enable("quiet-site");
  expect(t.service.enable("quiet-site")).toBe(first);
  await expect(t.service.enable("another")).rejects.toThrow("sharing:busy");
  expect(await first).toMatchObject({ project: "ada/book", name: "quiet-site", phase: "ready", site: "https://ada.github.io/quiet-site/" });
  expect(creates(t.github)).toHaveLength(1);
  expect(creates(t.github)[0]?.body).toMatchObject({ name: "quiet-site", private: false });
  expect(t.events.indexOf("persist:creating")).toBeLessThan(t.events.indexOf("step:create"));
  expect(t.events.indexOf("persist:created")).toBeLessThan(t.events.indexOf("initialize"));
  expect(t.events.at(-2)).toBe("persist:ready");
  expect(t.privateRepo.files).toEqual(new Set(["notes/draft.md"]));
  expect(t.github.calls.filter(call => /\/(?:keys|actions\/secrets)/.test(call.path))).toEqual([]);
  expect(t.github.repo("quiet-site")?.secrets.size).toBe(0);
  await t.service.enable("quiet-site");
  expect(creates(t.github)).toHaveLength(1);
  expect(t.events.filter(event => event === "initialize")).toHaveLength(1);
});

it("reconciles a lost creation response after service restart without creating another site", async () => {
  const t = fixture();
  let lost = false;
  const api = new GitHubApi(t.github.token, async (url, init) => {
    const result = await t.github.fetch(url, init);
    if (!lost && init?.method === "POST" && url.endsWith("/user/repos")) { lost = true; throw new Error("lost"); }
    return result;
  });
  await expect(sharingSetup({ ...t.deps, api: async () => api }).enable("quiet-site")).rejects.toThrow("sharing:offline");
  expect(t.saved()?.phase).toBe("creating");
  expect((await sharingSetup(t.deps).enable("quiet-site")).phase).toBe("ready");
  expect(creates(t.github)).toHaveLength(1);
});

it("retries failed initialization with the same persisted site and keeps the chosen name", async () => {
  const t = fixture();
  const broken = sharingSetup({ ...t.deps, initialize: async () => { throw new Error("disk"); } });
  await expect(broken.enable("quiet-site")).rejects.toThrow("sharing:failed");
  expect(t.saved()).toMatchObject({ name: "quiet-site", phase: "created" });
  await expect(t.service.enable("other-site")).rejects.toThrow("sharing:changed");
  expect((await t.service.enable("quiet-site")).phase).toBe("ready");
  expect(creates(t.github)).toHaveLength(1);
});

it("never adopts an unrelated public repository, even when it is empty", async () => {
  const t = fixture();
  t.github.add({ owner: "ada", name: "quiet-site" });
  await expect(t.service.enable("quiet-site")).rejects.toThrow("sharing:taken");
  expect(creates(t.github)).toHaveLength(0);
  expect(t.events).not.toContain("initialize");
  expect((await t.service.enable("another-site")).phase).toBe("ready");
  expect(creates(t.github)).toHaveLength(1);
  expect(t.github.repo("quiet-site")?.fileContents.size).toBe(0);
});

it.each([
  [401, "Bad credentials", "signedout"],
  [403, "Forbidden", "refused"],
  [429, "Rate limit", "ratelimited"],
  [500, "Server error", "failed"],
] as const)("retains setup intent on creation %s and retries only the same name", async (status, message, code) => {
  const t = fixture();
  t.github.fail("POST /user/repos", status, message);
  await expect(t.service.enable("quiet-site")).rejects.toThrow(`sharing:${code}`);
  expect(t.saved()).toMatchObject({ name: "quiet-site", phase: "creating" });
  expect((await t.service.enable("quiet-site")).phase).toBe("ready");
});

it("offline, signed-out, wrong-account, public-project and invalid-name attempts never write", async () => {
  const t = fixture();
  t.github.offline = true;
  await expect(t.service.enable("quiet-site")).rejects.toThrow("sharing:offline");
  t.github.offline = false;
  await expect(sharingSetup({ ...t.deps, api: async () => undefined }).enable("quiet-site")).rejects.toThrow("sharing:signedout");
  t.github.login = "someone";
  await expect(t.service.enable("quiet-site")).rejects.toThrow("sharing:owner");
  t.github.login = "ada";
  t.privateRepo.private = false;
  await expect(t.service.enable("quiet-site")).rejects.toThrow("sharing:unlinked");
  await expect(t.service.enable("../book")).rejects.toThrow("sharing:name");
  expect(t.saved()).toBeUndefined();
  expect(creates(t.github)).toHaveLength(0);
});

it("failed preservation stops removal; re-enable reuses the empty site without republishing", async () => {
  const t = fixture();
  await t.service.enable("quiet-site");
  t.events.length = 0;
  await expect(sharingSetup({ ...t.deps, preserve: async () => { throw new Error("disk"); } }).disable()).rejects.toThrow("sharing:failed");
  expect(t.saved()?.phase).toBe("ready");
  expect(t.events).not.toContain("remove");
  await t.service.disable();
  expect(t.saved()?.phase).toBe("off");
  expect(t.events.indexOf("preserve")).toBeLessThan(t.events.indexOf("persist:removing"));
  expect(t.events.indexOf("persist:removing")).toBeLessThan(t.events.indexOf("remove"));
  expect(t.events.indexOf("remove")).toBeLessThan(t.events.indexOf("persist:off"));
  t.events.length = 0;
  await t.service.enable("quiet-site");
  expect(t.events).not.toContain("initialize");
  expect(creates(t.github)).toHaveLength(1);
  expect(t.github.calls.filter(call => call.method === "DELETE")).toEqual([]);
});

it("failed removal remains pending across restart and cannot be bypassed by re-enable", async () => {
  const t = fixture();
  await t.service.enable("quiet-site");
  await expect(sharingSetup({ ...t.deps, remove: async () => { throw new Error("offline"); } }).disable()).rejects.toThrow("sharing:failed");
  expect(t.saved()?.phase).toBe("removing");
  await expect(t.service.enable("quiet-site")).rejects.toThrow("sharing:removing");
  await t.service.disable();
  expect(t.saved()?.phase).toBe("off");
});

it("rejects malformed pairing records instead of silently starting fresh", () => {
  expect(() => parseSitePairing({ version: 1, phase: "ready" })).toThrow("sharing:record");
});

it("persists partial setup on disk and resumes with a fresh store without a duplicate repository", async () => {
  const folder = await mkdtemp(join(tmpdir(), "focus-sharing-pairing-"));
  try {
    const t = fixture(), file = join(folder, "sharing.json");
    const atomicWrite = async (file: string, text: string) => { await writeFile(`${file}.tmp`, text); await rename(`${file}.tmp`, file); };
    const disk = sitePairingStore(file, atomicWrite);
    expect(await disk.read()).toBeUndefined();
    await expect(sharingSetup({ ...t.deps, ...disk, initialize: async () => { throw new Error("stopped"); } }).enable("quiet-site")).rejects.toThrow("sharing:failed");
    expect(await sitePairingStore(file, atomicWrite).read()).toMatchObject({ name: "quiet-site", phase: "created" });
    expect((await sharingSetup({ ...t.deps, ...sitePairingStore(file, atomicWrite) }).enable("quiet-site")).phase).toBe("ready");
    expect(creates(t.github)).toHaveLength(1);
    expect(await readFile(file, "utf8")).not.toContain("notes/");
    await writeFile(file, "{broken");
    await expect(disk.read()).rejects.toThrow("sharing:record");
    expect(creates(t.github)).toHaveLength(1);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
