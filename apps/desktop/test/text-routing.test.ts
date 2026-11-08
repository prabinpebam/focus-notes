import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileLaunchProfile, projectWindows, WRITING_EXTENSIONS } from "../src/main/projects.ts";
import { DATA_FILES, DATA_FOLDERS } from "@focus-notes/core/inventory";

const fake = vi.hoisted(() => ({ profile: "", file: "", dialogs: [] as unknown[], spawned: [] as { args: string[]; env: Record<string, string> }[] }));
vi.mock("electron", () => ({
  app: { getPath: () => fake.profile, isPackaged: true, getAppPath: () => "" },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (text: string) => Buffer.from(text), decryptString: (bytes: Buffer) => bytes.toString() },
  dialog: { showOpenDialog: async (options: unknown) => { fake.dialogs.push(options); return { canceled: false, filePaths: [fake.file] }; } },
}));
vi.mock("node:child_process", async actual => ({
  ...(await actual<typeof import("node:child_process")>()),
  spawn: (_exe: string, args: string[], options: { env: Record<string, string> }) => {
    fake.spawned.push({ args, env: options.env });
    const child = new EventEmitter(); queueMicrotask(() => child.emit("spawn")); return child;
  },
}));
const roots: string[] = [];
const instances: ReturnType<typeof projectWindows>[] = [];
afterEach(async () => {
  for (const instance of instances.splice(0)) await instance.dispose();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  fake.dialogs.length = 0; fake.spawned.length = 0; vi.unstubAllEnvs();
});
function setup() {
  const root = realpathSync.native(mkdtempSync(join(tmpdir(), "fn-txt-routing-"))); roots.push(root);
  fake.profile = join(root, "profile"); mkdirSync(fake.profile);
  const home = join(root, "project"); mkdirSync(home);
  const projects = projectWindows(() => home, async (path, text) => { writeFileSync(path, text); }); instances.push(projects);
  return { root, home, projects };
}
describe("PRJ-09: Open file and Open with routing", () => {
  it("the platform dialog includes txt and routes a file in this open project here", async () => {
    const { home, projects } = setup();
    fake.file = join(home, "literal.txt"); writeFileSync(fake.file, "# literal\n");
    expect(await projects.openFile()).toEqual({ file: fake.file, here: true });
    expect(fake.dialogs).toEqual([{ properties: ["openFile"], filters: [{ name: "Markdown and text", extensions: WRITING_EXTENSIONS }] }]);
    expect(fake.spawned).toHaveLength(0);
  });
  it("a text file outside the project opens a local-only profile and leaves its bytes intact", async () => {
    const { root, projects } = setup();
    const standalone = join(root, "standalone"); mkdirSync(standalone);
    fake.file = join(standalone, "literal.txt"); const bytes = Buffer.from("# literal\r\n"); writeFileSync(fake.file, bytes);
    expect(await projects.openFile()).toEqual({ file: fake.file, here: false });
    expect(fake.spawned).toHaveLength(1);
    expect(fake.spawned[0]).toMatchObject({ args: ["--project-note", fake.file], env: { FOCUS_NOTES_DOCS: standalone, FOCUS_NOTES_LOCAL_NOTES: "1", FOCUS_NOTES_PROJECT_NOTE: fake.file } });
    expect(readFileSync(fake.file)).toEqual(bytes);
    expect(existsSync(join(standalone, ".git"))).toBe(false);
    expect(existsSync(join(standalone, ".focus-notes"))).toBe(false);
  });
  it("Open with selects the existing project's profile rather than a standalone copy", async () => {
    const { home, projects } = setup();
    fake.file = join(home, "literal.txt"); writeFileSync(fake.file, "literal");
    await projects.list();
    expect(await fileLaunchProfile(fake.profile, fake.file)).toMatchObject({ profile: fake.profile, folder: home, localNotes: false, file: fake.file });
  });
  it("Open with reuses its standalone profile and never changes the source", async () => {
    const { root } = setup();
    const folder = join(root, "outside"); mkdirSync(folder);
    const file = join(folder, "draft.txt"); writeFileSync(file, "literal");
    const first = await fileLaunchProfile(fake.profile, file);
    expect(first).toMatchObject({ folder, file, localNotes: true });
    expect(first.profile).toContain(DATA_FOLDERS.projectProfiles);
    expect(await fileLaunchProfile(fake.profile, file)).toEqual(first);
    expect(readFileSync(file, "utf8")).toBe("literal");
    expect(JSON.parse(readFileSync(join(first.profile, DATA_FILES.state), "utf8")).localNotes).toBe(true);
    expect(existsSync(join(folder, ".git"))).toBe(false);
  });
  it("unsupported or unreadable input creates no standalone profile", async () => {
    const { root } = setup();
    const file = join(root, "binary.txt"); writeFileSync(file, Buffer.from([0, 1]));
    await expect(fileLaunchProfile(fake.profile, file)).rejects.toThrow();
    await expect(fileLaunchProfile(fake.profile, join(root, "gone.txt"))).rejects.toThrow();
    expect(existsSync(join(fake.profile, DATA_FOLDERS.projectProfiles))).toBe(false);
  });
  it("Windows installers declare Markdown and text Open-with associations", () => {
    const manifest = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"));
    expect(manifest.build.fileAssociations[0].ext).toEqual(WRITING_EXTENSIONS);
    const appx = readFileSync(join(import.meta.dirname, "..", "build", "appx-extensions.xml"), "utf8");
    for (const ext of WRITING_EXTENSIONS) expect(appx).toContain(`<uap:FileType>.${ext}</uap:FileType>`);
  });
});
