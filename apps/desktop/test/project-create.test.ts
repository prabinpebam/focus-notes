import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { join, relative, sep } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectCreateProgress } from "@focus-notes/core";
import { projectGitHubClient, projectWindows as createProjects } from "../src/main/projects.ts";
import { GitHubApi, GitHubError } from "@focus-notes/github";
import { createRunner } from "../src/main/git/run.ts";
import { DATA_FILES } from "@focus-notes/core/inventory";
import { forgetLocalData as removeLocalData } from "../src/main/workspace/remove.ts";

const instances: ReturnType<typeof createProjects>[] = [];
function projectWindows(...args: Parameters<typeof createProjects>) {
  const instance = createProjects(...args);
  instances.push(instance);
  return instance;
}
const forgetLocalData = (profile: string, event: "signOut" | "removeWorkspace" | "deleteProject") => removeLocalData(profile, event, true);

const paths = vi.hoisted(() => ({ profile: "" }));
const spawned = vi.hoisted(() => [] as { args: string[]; env: Record<string, string | undefined> }[]);
const protection = vi.hoisted(() => ({
  encrypt: vi.fn((value: string) => Buffer.from(value)),
  decrypt: vi.fn((value: Buffer) => value.toString("utf8")),
  recent: [] as string[],
  hold: false,
  pending: [] as (() => void)[],
}));
vi.mock("electron", () => ({
  app: { getPath: () => paths.profile, isPackaged: true, getAppPath: () => "" },
  dialog: {},
  safeStorage: { isEncryptionAvailable: () => true, encryptString: protection.encrypt, decryptString: protection.decrypt },
}));
vi.mock("node:child_process", async (actual) => ({
  ...(await actual<typeof import("node:child_process")>()),
  spawn: (_file: string, args: string[], options: { env: Record<string, string | undefined> }) => {
    if (_file === "powershell.exe") throw new Error("Protection must not start a process on the main thread.");
    spawned.push({ args, env: options.env });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("spawn"));
    return child;
  },
}));
vi.mock("../src/main/spelling/off-thread.ts", () => ({
  spawnOffThread: (_file: string, args: string[]) => {
      const protect = args.at(-1)!.includes("::Protect(");
      protection.recent.push(protect ? "protect" : "unprotect");
      const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: () => { child.emit("exit", 1); return true; } });
      let input = "";
      child.stdin.on("data", chunk => { input += chunk.toString(); });
      child.stdin.on("end", () => {
        const finish = () => { child.stdout.end(input); child.emit("exit", 0); };
        if (protect && protection.hold) protection.pending.push(finish);
        else queueMicrotask(finish);
      });
      return child;
  },
}));
const roots: string[] = [];
afterEach(async () => {
  vi.useRealTimers();
  spawned.length = 0;
  protection.hold = false;
  for (const finish of protection.pending.splice(0)) finish();
  protection.recent.length = 0;
  for (const instance of instances.splice(0)) await instance.dispose();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

it.skipIf(process.platform !== "win32")("drains coalesced launch protection and recent writes before remembering a normal close", async () => {
  const { root } = await setup();
  const writes = vi.fn(writeFile);
  const projects = projectWindows(() => root, writes);
  const first = join(root, "first.md"), latest = join(root, "latest.md");
  protection.hold = true;
  await projects.remember(first);
  await vi.waitFor(() => expect(protection.pending.length).toBeGreaterThan(0));
  await projects.remember(latest, { from: 8, to: 8, scroll: 20 });
  let closed = false;
  const closing = projects.closed().then(() => { closed = true; });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(closed).toBe(false);
  expect(writes.mock.calls.some(([path]) => String(path).endsWith(DATA_FILES.lastProject))).toBe(false);
  protection.hold = false;
  for (const finish of protection.pending.splice(0)) finish();
  await closing;
  const restarted = projectWindows(() => root, writeFile);
  expect(await restarted.lastNote()).toBe(latest);
  expect(await restarted.position(latest)).toEqual({ from: 8, to: 8, scroll: 20 });
  expect(JSON.parse(await readFile(join(paths.profile, DATA_FILES.lastProject), "utf8"))).toEqual({ profile: paths.profile });
  const count = writes.mock.calls.length;
  await projects.remember(first);
  await projects.edited(first);
  await projects.pin(root);
  await projects.closed();
  expect(writes).toHaveBeenCalledTimes(count);
});

it.skipIf(process.platform !== "win32")("fences held protection, queued pins and late callbacks across sign-out, then resumes only explicitly", async () => {
  const { root, projects } = await setup();
  const home = join(root, "existing"), note = join(root, "first.md");
  await projects.remember(note);
  await vi.waitFor(async () => expect(await readFile(join(paths.profile, DATA_FILES.projectRecent), "utf8")).toContain("dpapi:"));
  await projects.list();
  protection.hold = true;
  const pin = projects.pin(await realpath(home), note);
  await projects.remember(note, { from: 9, to: 9, scroll: 20 });
  await vi.waitFor(() => expect(protection.pending.length).toBeGreaterThan(0));
  const purging = projects.purge(() => forgetLocalData(paths.profile, "signOut"));
  await projects.remember(join(root, "stale.md"));
  await projects.edited(note);
  const closing = projects.closed();
  protection.hold = false;
  for (const finish of protection.pending.splice(0)) finish();
  await Promise.all([pin, purging, closing]);
  expect(await projects.lastNote()).toBeUndefined();
  for (const file of [DATA_FILES.projectLastNote, DATA_FILES.projectRecent, DATA_FILES.lastProject]) {
    await expect(readFile(join(paths.profile, file), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  }
  await projects.remember(note);
  await new Promise<void>(resolve => setImmediate(resolve));
  await expect(readFile(join(paths.profile, DATA_FILES.projectLastNote), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  await projects.resume();
  await projects.remember(note, { from: 10, to: 10, scroll: 30 });
  await vi.waitFor(async () => expect(await projectWindows(() => root, writeFile).position(note)).toEqual({ from: 10, to: 10, scroll: 30 }));
});

for (const event of ["removeWorkspace", "deleteProject"] as const) {
for (const heldFile of [DATA_FILES.projectLastNote, DATA_FILES.projectRecent, DATA_FILES.lastProject]) {
  it(`drains an already-started ${heldFile} atomic write before ${event} removes local metadata`, async () => {
    const { root } = await setup();
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    let entered = false;
    const projects = projectWindows(() => root, async (path, content) => {
      if (path.endsWith(heldFile)) { entered = true; await held; }
      await writeFile(path, content);
    });
    const note = join(root, "first.md");
    const writing = heldFile === DATA_FILES.lastProject ? projects.closed()
      : heldFile === DATA_FILES.projectRecent ? projects.edited(note)
      : projects.remember(note, { from: 1, to: 1, scroll: 0 });
    await vi.waitFor(() => expect(entered).toBe(true));
    let removed = false;
    const purging = projects.purge(async () => {
      await forgetLocalData(paths.profile, event);
      removed = true;
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(removed).toBe(false);
    release();
    await Promise.all([writing, purging]);
    await projects.closed();
    await expect(readFile(join(paths.profile, heldFile), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
}
}

it.skipIf(process.platform !== "win32")("keeps a deleted project's metadata fenced and its missing folder out of Open", async () => {
  const { root, projects } = await setup();
  const home = await realpath(join(root, "existing"));
  const note = join(home, "first.md");
  await writeFile(note, "# First\n");
  await projects.remember(note);
  await vi.waitFor(async () => expect(await readFile(join(paths.profile, DATA_FILES.projectRecent), "utf8")).toContain("dpapi:"));
  await writeFile(join(paths.profile, DATA_FILES.lastProject), JSON.stringify({ profile: paths.profile }));
  await projects.list();
  protection.hold = true;
  const pin = projects.pin(home, note);
  await vi.waitFor(() => expect(protection.pending.length).toBeGreaterThan(0));
  await rm(home, { recursive: true });
  const purging = projects.purge(() => forgetLocalData(paths.profile, "deleteProject"));
  protection.hold = false;
  for (const finish of protection.pending.splice(0)) finish();
  await Promise.all([pin, purging]);
  expect(await projects.list()).toEqual([]);
  await projects.remember(note);
  await projects.closed();
  for (const file of [DATA_FILES.projectLastNote, DATA_FILES.projectRecent, DATA_FILES.lastProject]) {
    await expect(readFile(join(paths.profile, file), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  }
});

it("removes a cross-profile launch pointer only when it names the purged profile", async () => {
  const { root } = await setup();
  vi.stubEnv("FOCUS_NOTES_PROJECTS_PROFILE", root);
  const file = join(root, DATA_FILES.lastProject);
  const other = join(root, "another-profile");
  await writeFile(file, JSON.stringify({ profile: other }));
  const projects = projectWindows(() => root, writeFile);
  await projects.purge(() => forgetLocalData(paths.profile, "signOut"));
  expect(JSON.parse(await readFile(file, "utf8"))).toEqual({ profile: other });
  await projects.resume();
  await writeFile(file, JSON.stringify({ profile: paths.profile }));
  await projects.purge(() => forgetLocalData(paths.profile, "signOut"));
  await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

it("keeps admissions fenced until deletion finishes, even when signing in again concurrently", async () => {
  const { root, projects } = await setup();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const purging = projects.purge(async () => {
    await held;
    await forgetLocalData(paths.profile, "signOut");
  });
  let resumed = false;
  const resuming = projects.resume().then(() => { resumed = true; });
  await projects.remember(join(root, "stale.md"));
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(resumed).toBe(false);
  release();
  await Promise.all([purging, resuming]);
  const note = join(root, "new.md");
  await projects.remember(note, { from: 2, to: 2, scroll: 0 });
  await vi.waitFor(async () => expect(await projectWindows(() => root, writeFile).lastNote()).toBe(note));
});

async function twoProfiles(writer: Parameters<typeof createProjects>[1] = writeFile) {
  const { root } = await setup();
  const shared = paths.profile;
  vi.stubEnv("FOCUS_NOTES_PROJECTS_PROFILE", shared);
  const source = projectWindows(() => join(root, "existing"), writer);
  const folder = await source.create({ parent: root, name: "Other", accent: "teal", logo: "book" });
  const [name] = await readdir(join(shared, "project-profiles"));
  const profile = join(shared, "project-profiles", name!);
  paths.profile = profile;
  const target = projectWindows(() => folder, writeFile);
  await target.list();
  await source.list();
  return { root, shared, source, target, folder, profile };
}

for (const existing of [false, true]) {
  it.skipIf(process.platform !== "win32")(`rejects delayed foreign pins across purge and resume with ${existing ? "existing" : "absent"} Recent`, async () => {
    const { source, target, folder, profile } = await twoProfiles();
    if (existing) await target.edited(join(folder, "old.md"));
    protection.hold = true;
    const pin = source.pin(folder);
    // Install the rejection handler before releasing protection.
    const rejected = expect(pin).rejects.toThrow("saved metadata was cleared");
    await vi.waitFor(() => expect(protection.pending).toHaveLength(1));
    await target.purge(() => forgetLocalData(profile, "signOut"));
    await target.resume();
    await expect(readFile(join(profile, DATA_FILES.projectRecent), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    protection.hold = false;
    protection.pending.shift()!();
    await rejected;
    await expect(readFile(join(profile, DATA_FILES.projectRecent), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await source.pin(folder);
    expect((await target.list()).find(project => project.folder === folder)?.pinned).toBe(true);
  });
}

it("waits for another profile's actual atomic commit before purging its Recent", async () => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let entered = false;
  const { source, target, folder, profile } = await twoProfiles(async (path, content) => {
    if (path.endsWith(DATA_FILES.projectRecent)) { entered = true; await held; }
    await writeFile(path, content);
  });
  const pin = source.pin(folder);
  await vi.waitFor(() => expect(entered).toBe(true));
  let removed = false;
  const purging = target.purge(async () => { await forgetLocalData(profile, "signOut"); removed = true; });
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(removed).toBe(false);
  release();
  await Promise.all([pin, purging]);
  await expect(readFile(join(profile, DATA_FILES.projectRecent), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

it.skipIf(process.platform !== "win32")("rejects a conflicting foreign Recent update without overwriting newer note rankings", async () => {
  const { source, target, folder } = await twoProfiles();
  protection.hold = true;
  const pin = source.pin(folder);
  const rejected = expect(pin).rejects.toThrow("ranking changed");
  await vi.waitFor(() => expect(protection.pending).toHaveLength(1));
  const scoring = target.edited(join(folder, "new.md"));
  await vi.waitFor(() => expect(protection.pending).toHaveLength(2));
  protection.hold = false;
  protection.pending.pop()!();
  await scoring;
  protection.pending.shift()!();
  await rejected;
  const project = (await target.list()).find(project => project.folder === folder)!;
  expect(project.pinned).toBe(false);
  expect(project.recent?.map(note => note.path)).toEqual([join(folder, "new.md")]);
});

it("retains another profile's close pointer when the root profile is purged", async () => {
  const { source, target, shared } = await twoProfiles();
  await target.closed();
  const before = await readFile(join(shared, DATA_FILES.lastProject), "utf8");
  await source.purge(() => forgetLocalData(shared, "signOut"));
  expect(await readFile(join(shared, DATA_FILES.lastProject), "utf8")).toBe(before);
});

it("rejects a foreign pin without an admission ticket while its project list is being rebuilt", async () => {
  const { source, target, folder, profile } = await twoProfiles();
  const listing = source.list();
  await expect(source.pin(folder)).rejects.toThrow("Project list changed");
  await target.purge(() => forgetLocalData(profile, "signOut"));
  await target.resume();
  await listing;
  await expect(readFile(join(profile, DATA_FILES.projectRecent), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});

it("keeps a restarted purged profile fenced until explicit resumption, then persists new metadata", async () => {
  const { root, projects } = await setup();
  await projects.purge(() => forgetLocalData(paths.profile, "signOut"));
  const restarted = projectWindows(() => join(root, "existing"), writeFile);
  await restarted.list();
  const note = join(root, "new.md");
  await restarted.remember(note);
  await expect(readFile(join(paths.profile, DATA_FILES.projectLastNote), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  await restarted.resume();
  await restarted.remember(note, { from: 4, to: 4, scroll: 0 });
  await restarted.closed();
  const reading = projectWindows(() => root, writeFile);
  expect(await reading.lastNote()).toBe(note);
  expect(await reading.position(note)).toEqual({ from: 4, to: 4, scroll: 0 });
});

it("retries cleanup after a transient deletion failure without reopening admissions", async () => {
  const { root, projects } = await setup();
  const file = join(paths.profile, DATA_FILES.projectLastNote);
  await writeFile(file, "protected data");
  await expect(projects.purge(async () => { throw new Error("temporary deletion failure"); })).rejects.toThrow("temporary deletion failure");
  await projects.remember(join(root, "stale.md"));
  await projects.purge(() => forgetLocalData(paths.profile, "signOut"));
  await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  await projects.resume();
  await projects.remember(join(root, "fresh.md"), { from: 1, to: 1, scroll: 0 });
  await projects.closed();
  expect(await projectWindows(() => root, writeFile).lastNote()).toBe(join(root, "fresh.md"));
});

it("keeps a newer purge fenced when an earlier resume is waiting on the shared lock", async () => {
  const { root, projects } = await setup();
  await projects.purge(() => forgetLocalData(paths.profile, "signOut"));
  const blocker = new DatabaseSync(join(paths.profile, DATA_FILES.projectMetadata));
  blocker.exec("BEGIN IMMEDIATE");
  let purging: Promise<void> | undefined;
  const resuming = projects.resume();
  try {
    await new Promise<void>(resolve => setImmediate(resolve));
    purging = projects.purge(() => forgetLocalData(paths.profile, "signOut"));
  } finally { blocker.exec("ROLLBACK"); blocker.close(); }
  await Promise.all([resuming, purging]);
  const note = join(root, "stale.md");
  await projects.remember(note, { from: 1, to: 1, scroll: 0 });
  await expect(readFile(join(paths.profile, DATA_FILES.projectLastNote), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  await projects.resume();
  await projects.remember(note, { from: 2, to: 2, scroll: 0 });
  await projects.closed();
  expect(await projectWindows(() => root, writeFile).position(note)).toEqual({ from: 2, to: 2, scroll: 0 });
});

it("still purges local metadata when the earlier shutdown pointer write failed", async () => {
  const { root } = await setup();
  const projects = projectWindows(() => root, async () => { throw new Error("storage refused"); });
  await expect(projects.closed()).rejects.toThrow("storage refused");
  const file = join(paths.profile, DATA_FILES.projectLastNote);
  await writeFile(file, "old protected record");
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await projects.purge(() => forgetLocalData(paths.profile, "signOut"));
    expect(error).toHaveBeenCalledWith("Could not settle project shutdown metadata:", "Error");
    await expect(readFile(file, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  } finally { error.mockRestore(); }
});
it("reads the protected launch record once and keeps cursor writes coherent without decrypting again", async () => {
  const { root, projects } = await setup();
  const note = join(root, "first.md");
  const next = join(root, "next.md");
  const position = { from: 4, to: 8, scroll: 90 };
  await writeFile(join(paths.profile, DATA_FILES.projectLastNote), Buffer.from(JSON.stringify({ path: note, position })).toString("base64"));
  expect(await projects.lastNote()).toBe(note);
  expect(await projects.position(note)).toEqual(position);
  expect(await projects.position(next)).toBeUndefined();
  expect(protection.decrypt).toHaveBeenCalledTimes(1);
  const moved = { from: 20, to: 20, scroll: 200 };
  await projects.remember(next, moved);
  expect(await projects.lastNote()).toBe(next);
  expect(await projects.position(next)).toEqual(moved);
  expect(await projects.position(note)).toBeUndefined();
  expect(protection.decrypt).toHaveBeenCalledTimes(1);
  await vi.waitFor(async () => expect(await projectWindows(() => root, writeFile).position(next)).toEqual(moved));
  protection.decrypt.mockClear();
  const restarted = projectWindows(() => root, writeFile);
  expect(await restarted.position(next)).toEqual(moved);
  expect(protection.decrypt).toHaveBeenCalledTimes(process.platform === "win32" ? 0 : 1);
});

it("retries failed reads and reports background writes without losing the latest in-memory position", async () => {
  const { root } = await setup();
  let fail = true;
  const projects = projectWindows(() => root, async (path, content) => {
    if (fail) throw new Error("storage refused");
    await writeFile(path, content);
  });
  const note = join(root, "first.md");
  const position = { from: 3, to: 3, scroll: 10 };
  await writeFile(join(paths.profile, DATA_FILES.projectLastNote), Buffer.from("{corrupt").toString("base64"));
  await expect(projects.lastNote()).rejects.toThrow();
  await writeFile(join(paths.profile, DATA_FILES.projectLastNote), Buffer.from(JSON.stringify({ path: note, position })).toString("base64"));
  expect(await projects.position(note)).toEqual(position);
  const moved = { from: 8, to: 8, scroll: 40 };
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await projects.remember(note, moved);
    expect(await projects.position(note)).toEqual(moved);
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith("Could not persist protected launch record:", "Error"));
    expect(await projectWindows(() => root, writeFile).position(note)).toEqual(position);
    fail = false;
    await projects.remember(note, moved);
    await vi.waitFor(async () => expect(await projectWindows(() => root, writeFile).position(note)).toEqual(moved));
  } finally { error.mockRestore(); }
});

it.skipIf(process.platform !== "win32")("coalesces launch records off the caller and discards stale slow protection before an atomic write", async () => {
  const { root } = await setup();
  const writes = vi.fn(writeFile);
  const projects = projectWindows(() => root, writes);
  protection.hold = true;
  const first = join(root, "first.md"), latest = join(root, "latest.md");
  const position = { from: 1, to: 1, scroll: 0 };
  await projects.remember(first, position);
  await projects.remember(first, { ...position, from: 2 });
  expect(protection.pending).toHaveLength(0);
  await vi.waitFor(() => expect(protection.pending).toHaveLength(1));
  await projects.remember(latest, { ...position, from: 3 });
  await projects.remember(latest, { ...position, from: 4 });
  expect(await projects.position(latest)).toEqual({ ...position, from: 4 });
  expect(writes).not.toHaveBeenCalled();
  protection.hold = false;
  protection.pending.shift()!();
  await vi.waitFor(() => expect(writes).toHaveBeenCalledTimes(1));
  const [file, encrypted] = writes.mock.calls[0]!;
  expect(file).toBe(join(paths.profile, DATA_FILES.projectLastNote));
  expect(String(encrypted).startsWith("dpapi:")).toBe(true);
  expect(JSON.parse(Buffer.from(String(encrypted).slice(6), "base64").toString())).toEqual({ path: latest, position: { ...position, from: 4 } });
});

it.skipIf(process.platform !== "win32")("expires a hung protector without plaintext and continues with the latest pending record", async () => {
  const { root } = await setup();
  const writes = vi.fn(writeFile);
  const projects = projectWindows(() => root, writes);
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  protection.hold = true;
  const position = { from: 1, to: 1, scroll: 0 };
  try {
    await projects.remember(join(root, "hung.md"), position);
    await new Promise<void>(resolve => setImmediate(resolve));
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(protection.pending).toHaveLength(1);
    const latest = join(root, "latest.md");
    await projects.remember(latest, position);
    expect(writes).not.toHaveBeenCalled();
    protection.hold = false;
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();
    await vi.waitFor(() => expect(writes).toHaveBeenCalledTimes(1));
    expect(error).toHaveBeenCalledWith("Could not persist protected launch record:", "Error");
    expect(writes).toHaveBeenCalledTimes(1);
    expect(String(writes.mock.calls[0]![1]).startsWith("dpapi:")).toBe(true);
    await vi.waitFor(async () => expect(await projectWindows(() => root, writeFile).lastNote()).toBe(latest));
  } finally { error.mockRestore(); vi.useRealTimers(); }
});

it.skipIf(process.platform !== "win32")("keeps the protected launch record readable when a crash loses Chromium's encryption key", async () => {
  const { root, projects } = await setup();
  const note = join(root, "first.md");
  const position = { from: 6, to: 9, scroll: 40 };
  await projects.remember(note, position);
  await vi.waitFor(async () => expect((await readFile(join(paths.profile, DATA_FILES.projectLastNote), "utf8")).startsWith("dpapi:")).toBe(true));
  protection.decrypt.mockImplementation(() => { throw new Error("Chromium key unavailable after crash"); });
  try {
    const restarted = projectWindows(() => root, writeFile);
    expect(await restarted.lastNote()).toBe(note);
    expect(await restarted.position(note)).toEqual(position);
    expect(protection.decrypt).not.toHaveBeenCalled();
  } finally { protection.decrypt.mockReset(); }
});

it("reuses its own protected Recent record between opens but still persists every ranking update", async () => {
  const { root, projects } = await setup();
  const first = join(root, "first.md"), second = join(root, "second.md");
  await projects.remember(first);
  await vi.waitFor(async () => expect(await readFile(join(paths.profile, DATA_FILES.projectRecent), "utf8")).toContain("dpapi:"));
  await projects.remember(second);
  await vi.waitFor(async () => {
    const disk = await readFile(join(paths.profile, DATA_FILES.projectRecent), "utf8");
    expect(JSON.parse(Buffer.from(disk.slice(6), "base64").toString("utf8")).notes).toHaveLength(2);
  });
  const disk = await readFile(join(paths.profile, DATA_FILES.projectRecent), "utf8");
  expect(disk.startsWith("dpapi:")).toBe(true);
  const record = JSON.parse(Buffer.from(disk.slice(6), "base64").toString("utf8"));
  expect(record.notes.map((note: { path: string }) => note.path).sort()).toEqual([first, second].sort());
  const restarted = projectWindows(() => root, writeFile);
  await restarted.remember(first);
  await vi.waitFor(() => expect(protection.recent.filter(value => value === "unprotect")).toHaveLength(2));
});

it("replaces an unreadable launch position only when remembering a successfully opened disk note", async () => {
  const { root, projects } = await setup();
  const note = join(root, "first.md");
  await writeFile(note, "# Kept on disk\n");
  await writeFile(join(paths.profile, DATA_FILES.projectLastNote), Buffer.from("{corrupt").toString("base64"));
  await expect(projects.lastNote()).rejects.toThrow();
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await projects.remember(note);
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith("Could not restore the previous launch position:", "SyntaxError"));
    const restarted = projectWindows(() => root, writeFile);
    await vi.waitFor(async () => expect(await restarted.lastNote()).toBe(note));
    expect(await readFile(note, "utf8")).toBe("# Kept on disk\n");
  } finally { error.mockRestore(); }
});

it("keeps the last persisted Recent value when a ranking write fails and retries on the next open", async () => {
  const { root } = await setup();
  let refuseRecent = false;
  const projects = projectWindows(() => root, async (path, content) => {
    if (path.endsWith(DATA_FILES.projectRecent) && refuseRecent) throw new Error("storage refused");
    await writeFile(path, content);
  });
  const first = join(root, "first.md"), failed = join(root, "failed.md"), next = join(root, "next.md");
  await projects.remember(first);
  await vi.waitFor(async () => expect(await readFile(join(paths.profile, DATA_FILES.projectRecent), "utf8")).toContain("dpapi:"));
  refuseRecent = true;
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  await projects.remember(failed);
  await vi.waitFor(() => expect(error).toHaveBeenCalledWith("Could not persist project ranking:", "Error"));
  error.mockRestore();
  refuseRecent = false;
  await projects.remember(next);
  await vi.waitFor(async () => {
    const disk = await readFile(join(paths.profile, DATA_FILES.projectRecent), "utf8");
    expect(JSON.parse(Buffer.from(disk.slice(6), "base64").toString("utf8")).notes.map((note: { path: string }) => note.path).sort()).toEqual([first, next].sort());
  });
  const disk = await readFile(join(paths.profile, DATA_FILES.projectRecent), "utf8");
  const record = JSON.parse(Buffer.from(disk.slice(6), "base64").toString("utf8"));
  expect(record.notes.map((note: { path: string }) => note.path).sort()).toEqual([first, next].sort());
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "fn-create-"));
  roots.push(root);
  paths.profile = join(root, "profile");
  const home = join(root, "existing");
  await mkdir(paths.profile); await mkdir(home);
  return { root, projects: projectWindows(() => home, writeFile) };
}

function githubFake() {
  const api = new GitHubApi("unit-fake", async () => { throw new Error("Unit tests never use the network"); });
  vi.spyOn(api, "user").mockResolvedValue({ login: "writer", id: 123, name: "Writer" });
  vi.spyOn(api, "findRepo").mockResolvedValue(undefined);
  vi.spyOn(api, "createRepo").mockResolvedValue();
  vi.spyOn(api, "repo").mockResolvedValue({ owner: "writer", name: "my-book", private: true, defaultBranch: "main", canPush: true });
  return api;
}

it("production project wiring uses the signed-in account client without a candidate variable; tests without a fake refuse it", async () => {
  const api = githubFake();
  const account = vi.fn(async () => ({ api }));
  expect(await projectGitHubClient(undefined, account)).toBe(api);
  expect(account).toHaveBeenCalledOnce();
  account.mockClear();
  expect(await projectGitHubClient(undefined, account, true)).toBeUndefined();
  expect(account).not.toHaveBeenCalled();
  expect(await projectGitHubClient("http://127.0.0.1:12345", account)).toBeInstanceOf(GitHubApi);
  expect(account).not.toHaveBeenCalled();
});

it("creates exactly one private named GitHub repository, records identity and marker, sets origin and pushes its first commit", async () => {
  const { root } = await setup();
  const api = githubFake();
  const git = vi.fn(async (call: { cwd: string; args: string[] }) => ({ code: call.args[1] === "--get" ? 1 : 0, stdout: "", stderr: "" }));
  const projects = projectWindows(() => join(root, "existing"), writeFile, undefined, git, undefined, async () => api);
  const input = { parent: root, name: "My book", repo: "my-book", github: true, accent: "teal", logo: "book" };
  const events: Omit<ProjectCreateProgress, "request">[] = [];
  const result = await projects.create(input, { signal: new AbortController().signal, progress: event => events.push(event) });
  expect(result).toBe(await realpath(join(root, "My book")));
  expect(api.findRepo).toHaveBeenCalledWith("writer", "my-book");
  expect(api.createRepo).toHaveBeenCalledExactlyOnceWith("my-book", "Private notes for Focus Notes", true, false);
  expect(JSON.parse(await readFile(join(String(result), ".focus-notes", "workspace.json"), "utf8"))).toEqual({ formatVersion: 1 });
  expect(git.mock.calls).toEqual([
    [{ cwd: result, args: ["init", "--quiet"] }],
    [{ cwd: result, args: ["symbolic-ref", "HEAD", "refs/heads/main"] }],
    [{ cwd: result, args: ["config", "user.name", "Writer"] }],
    [{ cwd: result, args: ["config", "user.email", "123+writer@users.noreply.github.com"] }],
    [{ cwd: result, args: ["add", "--", ".focus-notes/workspace.json"] }],
    [{ cwd: result, args: ["commit", "--quiet", "-m", "Start the project"] }],
    [{ cwd: result, args: ["config", "focusnotes.createowner", "writer"] }],
    [{ cwd: result, args: ["config", "focusnotes.createrepo", "my-book"] }],
    [{ cwd: result, args: ["config", "focusnotes.createstate", "unknown"] }],
    [{ cwd: result, args: ["config", "focusnotes.createowner", "writer"] }],
    [{ cwd: result, args: ["config", "focusnotes.createrepo", "my-book"] }],
    [{ cwd: result, args: ["config", "focusnotes.createstate", "accepted"] }],
    [{ cwd: result, args: ["config", "--get", "remote.origin.url"], read: true }],
    [{ cwd: result, args: ["remote", "add", "origin", "https://github.com/writer/my-book.git"] }],
    [{ cwd: result, args: ["push", "--set-upstream", "origin", "main"] }],
    [{ cwd: result, args: ["config", "--unset", "focusnotes.createowner"] }],
    [{ cwd: result, args: ["config", "--unset", "focusnotes.createrepo"] }],
    [{ cwd: result, args: ["config", "--unset", "focusnotes.createstate"] }],
  ]);
  expect(events.filter(event => event.step === "push").map(event => event.done)).toEqual([false, true]);
});

it.each(["taken", "invalid", "signedOut"])("refuses %s before making any folder or repository", async problem => {
  const { root } = await setup();
  const api = githubFake();
  if (problem === "taken") vi.mocked(api.findRepo).mockResolvedValue(await api.repo("writer", "my-book"));
  const git = vi.fn(async (_call: { cwd: string; args: string[] }) => ({ code: 0, stdout: "", stderr: "" }));
  const projects = projectWindows(() => join(root, "existing"), writeFile, undefined, git, undefined, async () => problem === "signedOut" ? undefined : api);
  await expect(projects.create({ parent: root, name: "Refused", repo: problem === "invalid" ? ".." : "my-book", github: true, accent: "teal", logo: "book" })).rejects.toThrow(problem === "signedOut" ? "signedOut" : "repository-");
  expect(await readdir(root)).not.toContain("Refused");
  expect(api.createRepo).not.toHaveBeenCalled();
  expect(git).not.toHaveBeenCalled();
});

it("keeps a project local after GitHub refusal with a resumable receipt, without any automatic creation retry", async () => {
  const { root } = await setup();
  const api = githubFake();
  vi.mocked(api.createRepo).mockRejectedValue(new GitHubError(403, "refused"));
  const git = vi.fn(async (_call: { cwd: string; args: string[] }) => ({ code: 0, stdout: "", stderr: "" }));
  const projects = projectWindows(() => join(root, "existing"), writeFile, undefined, git, undefined, async () => api);
  const result = await projects.create({ parent: root, name: "Kept", repo: "my-book", github: true, accent: "teal", logo: "book" });
  const folder = await realpath(join(root, "Kept"));
  expect(result).toEqual({ folder, problem: "github", repository: "writer/my-book" });
  expect((await projects.list()).some(project => project.folder === folder)).toBe(true);
  expect(git.mock.calls.some(call => call[0]?.args[0] === "remote")).toBe(false);
  expect(api.createRepo).toHaveBeenCalledOnce();
  await projects.continueCreate(folder);
  expect(api.createRepo).toHaveBeenCalledTimes(2);
});

it("continues a failed first push without another repository creation or losing notes", async () => {
  const { root } = await setup();
  const api = githubFake();
  let refuse = true;
  const git = vi.fn(async (call: { cwd: string; args: string[] }) => ({ code: call.args[1] === "--get" || call.args[0] === "push" && refuse ? 1 : 0, stdout: "", stderr: "" }));
  const projects = projectWindows(() => join(root, "existing"), writeFile, undefined, git, undefined, async () => api);
  const result = await projects.create({ parent: root, name: "Kept", repo: "my-book", github: true, accent: "teal", logo: "book" });
  expect(typeof result).toBe("object");
  const folder = await realpath(join(root, "Kept"));
  await writeFile(join(folder, "notes", "kept.md"), "Kept words\n");
  expect(git).toHaveBeenCalledWith({ cwd: folder, args: ["remote", "remove", "origin"] });
  refuse = false;
  expect(await projects.continueCreate(folder)).toBe(folder);
  expect(api.createRepo).toHaveBeenCalledOnce();
  expect(await readFile(join(folder, "notes", "kept.md"), "utf8")).toBe("Kept words\n");
});

it("restores a local-only first-push receipt after restarting without touching a real remote", async () => {
  const { root } = await setup();
  const api = githubFake();
  const config = join(root, "isolated.gitconfig");
  await writeFile(config, "");
  const run = createRunner({ env: { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: "1" } });
  let refuse = true;
  const git: Parameters<typeof createProjects>[3] = call => call.args[0] === "push"
    ? Promise.resolve({ code: refuse ? 1 : 0, stdout: "", stderr: "" })
    : run(call);
  const projects = projectWindows(() => join(root, "existing"), writeFile, undefined, git, undefined, async () => api);
  const result = await projects.create({ parent: root, name: "Kept", repo: "my-book", github: true, accent: "teal", logo: "book" });
  expect(typeof result).toBe("object");
  const folder = await realpath(join(root, "Kept"));
  expect((await run({ cwd: folder, args: ["remote"], read: true })).stdout).toBe("");
  const restarted = projectWindows(() => folder, writeFile, undefined, git, undefined, async () => api);
  expect(await restarted.pendingCreate()).toMatchObject({ folder, name: "Kept", repo: "my-book" });
  refuse = false;
  expect(await restarted.continueCreate(folder)).toBe(folder);
  expect(api.createRepo).toHaveBeenCalledOnce();
  expect(await restarted.pendingCreate()).toBeUndefined();
});

it("never repeats a repository write whose response was lost, including on explicit continuation", async () => {
  const { root } = await setup();
  const api = githubFake();
  vi.mocked(api.createRepo).mockRejectedValue(new GitHubError(0, "offline"));
  const git = async () => ({ code: 0, stdout: "", stderr: "" });
  const projects = projectWindows(() => join(root, "existing"), writeFile, undefined, git, undefined, async () => api);
  const input = { parent: root, name: "Unknown", repo: "my-book", github: true, accent: "teal", logo: "book" };
  const result = await projects.create(input);
  expect(typeof result).toBe("object");
  vi.mocked(api.findRepo).mockResolvedValue(await api.repo("writer", "my-book"));
  await projects.continueCreate(await realpath(join(root, "Unknown")));
  expect(api.createRepo).toHaveBeenCalledOnce();
});

it("reports actual local steps and preserves a completed profile receipt when cancelled at its final boundary", async () => {
  const { root, projects } = await setup();
  const controller = new AbortController();
  const events: Omit<ProjectCreateProgress, "request">[] = [];
  const folder = await projects.create({ parent: root, name: "New book", accent: "teal", logo: "book" }, {
    signal: controller.signal,
    progress: event => { events.push(event); if (event.step === "profile" && event.done) controller.abort(); },
  });
  expect(events.map(event => `${event.step}:${event.done}`)).toEqual(["check:false", "check:true", "folder:false", "folder:true", "profile:false", "profile:true"]);
  expect(events.every(event => event.steps.join(",") === "check,folder,profile")).toBe(true);
  expect(await readdir(folder)).toEqual(["notes"]);
  expect((await projects.list()).find(project => project.folder === folder)).toMatchObject({ name: "New book" });
});

it("starts every new project's history with Git as its own named step, and stops when Git can't start it", async () => {
  const { root } = await setup();
  const calls: string[] = [];
  const git = async (call: { cwd: string; args: string[] }) => { calls.push(`${call.cwd.split(sep).pop()}: ${call.args.join(" ")}`); return { code: 0, stdout: "", stderr: "" }; };
  const projects = projectWindows(() => join(root, "existing"), writeFile, undefined, git);
  const events: Omit<ProjectCreateProgress, "request">[] = [];
  await projects.create({ parent: root, name: "Kept", accent: "teal", logo: "book" }, { signal: new AbortController().signal, progress: event => events.push(event) });
  expect(events[0]?.steps).toEqual(["check", "folder", "history", "profile"]);
  expect(calls).toEqual(["Kept: init --quiet", "Kept: symbolic-ref HEAD refs/heads/main", "Kept: commit --allow-empty --quiet -m Start the project"]);
  const failing = projectWindows(() => join(root, "existing"), writeFile, undefined, async () => ({ code: 1, stdout: "", stderr: "" }));
  await expect(failing.create({ parent: root, name: "No git", accent: "teal", logo: "book" })).rejects.toThrow("history");
  expect((await failing.list()).some(project => project.name === "No git")).toBe(false);
});

it("stops at a safe boundary without deleting a completed folder or overwriting its notes on another Create", async () => {
  const { root, projects } = await setup();
  const controller = new AbortController();
  const input = { parent: root, name: "Kept partial", accent: "teal", logo: "book" };
  await expect(projects.create(input, {
    signal: controller.signal,
    progress: event => { if (event.step === "folder" && event.done) controller.abort(); },
  })).rejects.toThrow();
  const note = join(root, input.name, "notes", "kept.md");
  await writeFile(note, "# Kept bytes\n");
  await expect(projects.create(input)).rejects.toThrow("exists");
  expect(await readFile(note, "utf8")).toBe("# Kept bytes\n");
});

it("hands another project window only the note's canonical absolute path, never a renderer string", async () => {
  const { root, projects } = await setup();
  const folder = await projects.create({ parent: root, name: "Book", accent: "teal", logo: "book" });
  const note = join(folder, "notes", "a.md");
  await writeFile(note, "# A\n");
  const cwd = process.cwd();
  process.chdir(root);
  try {
    // realpath() resolves this switch-shaped string against the working directory to the real note.
    const switched = `--gpu-launcher=calc${sep}..${sep}${relative(root, note)}`;
    expect(await realpath(switched)).toBe(await realpath(note));
    await expect(projects.open(folder, switched)).rejects.toThrow("isn't in this project");
  } finally { process.chdir(cwd); }
  expect(spawned).toEqual([]);
  await projects.open(folder, `${folder}${sep}notes${sep}..${sep}notes${sep}a.md`);
  const canonical = await realpath(note);
  expect(spawned.map(s => s.args)).toEqual([["--project-note", canonical]]);
  expect(spawned[0]!.env.FOCUS_NOTES_PROJECT_NOTE).toBe(canonical);
});