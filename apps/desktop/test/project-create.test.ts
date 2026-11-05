import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectCreateProgress } from "@focus-notes/core";
import { projectWindows } from "../src/main/projects.ts";
import { DATA_FILES } from "@focus-notes/core/inventory";

const paths = vi.hoisted(() => ({ profile: "" }));
const spawned = vi.hoisted(() => [] as { args: string[]; env: Record<string, string | undefined> }[]);
const protection = vi.hoisted(() => ({
  encrypt: vi.fn((value: string) => Buffer.from(value)),
  decrypt: vi.fn((value: Buffer) => value.toString("utf8")),
  recent: [] as string[],
}));
vi.mock("electron", () => ({
  app: { getPath: () => paths.profile, isPackaged: true, getAppPath: () => "" },
  dialog: {},
  safeStorage: { isEncryptionAvailable: () => true, encryptString: protection.encrypt, decryptString: protection.decrypt },
}));
vi.mock("node:child_process", async (actual) => ({
  ...(await actual<typeof import("node:child_process")>()),
  spawn: (_file: string, args: string[], options: { env: Record<string, string | undefined> }) => {
    if (_file === "powershell.exe") {
      protection.recent.push(args.at(-1)!.includes("::Protect(") ? "protect" : "unprotect");
      const child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough() });
      let input = "";
      child.stdin.on("data", chunk => { input += chunk.toString(); });
      child.stdin.on("end", () => queueMicrotask(() => { child.stdout.end(input); child.emit("close", 0); }));
      return child;
    }
    spawned.push({ args, env: options.env });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("spawn"));
    return child;
  },
}));
const roots: string[] = [];
afterEach(async () => {
  spawned.length = 0;
  protection.recent.length = 0;
  vi.clearAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
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
  const restarted = projectWindows(() => root, writeFile);
  expect(await restarted.position(next)).toEqual(moved);
  expect(protection.decrypt).toHaveBeenCalledTimes(2);
});

it("does not cache a failed launch-record read or an unacknowledged cursor write", async () => {
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
  await expect(projects.remember(note, moved)).rejects.toThrow("storage refused");
  expect(await projects.position(note)).toEqual(position);
  fail = false;
  await projects.remember(note, moved);
  expect(await projects.position(note)).toEqual(moved);
});

it("reuses its own protected Recent record between opens but still persists every ranking update", async () => {
  const { root, projects } = await setup();
  const first = join(root, "first.md"), second = join(root, "second.md");
  await projects.remember(first);
  await projects.remember(second);
  expect(protection.recent).toEqual(["protect", "protect"]);
  const disk = await readFile(join(paths.profile, DATA_FILES.projectRecent), "utf8");
  expect(disk.startsWith("dpapi:")).toBe(true);
  const record = JSON.parse(Buffer.from(disk.slice(6), "base64").toString("utf8"));
  expect(record.notes.map((note: { path: string }) => note.path).sort()).toEqual([first, second].sort());
  const restarted = projectWindows(() => root, writeFile);
  await restarted.remember(first);
  expect(protection.recent).toEqual(["protect", "protect", "unprotect", "protect"]);
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
  refuseRecent = true;
  await expect(projects.remember(failed)).rejects.toThrow("storage refused");
  refuseRecent = false;
  await projects.remember(next);
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