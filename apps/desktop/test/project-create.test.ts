import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectCreateProgress } from "@focus-notes/core";
import { projectWindows } from "../src/main/projects.ts";

const paths = vi.hoisted(() => ({ profile: "" }));
const spawned = vi.hoisted(() => [] as { args: string[]; env: Record<string, string | undefined> }[]);
vi.mock("electron", () => ({
  app: { getPath: () => paths.profile, isPackaged: true, getAppPath: () => "" },
  dialog: {},
  safeStorage: { isEncryptionAvailable: () => true },
}));
vi.mock("node:child_process", async (actual) => ({
  ...(await actual<typeof import("node:child_process")>()),
  spawn: (_file: string, args: string[], options: { env: Record<string, string | undefined> }) => {
    spawned.push({ args, env: options.env });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("spawn"));
    return child;
  },
}));
const roots: string[] = [];
afterEach(async () => {
  spawned.length = 0;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
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