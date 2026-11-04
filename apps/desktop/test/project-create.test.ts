import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { ProjectCreateProgress } from "@focus-notes/core";
import { projectWindows } from "../src/main/projects.ts";

const paths = vi.hoisted(() => ({ profile: "" }));
vi.mock("electron", () => ({
  app: { getPath: () => paths.profile },
  dialog: {},
  safeStorage: { isEncryptionAvailable: () => true },
}));
const roots: string[] = [];
afterEach(async () => {
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
