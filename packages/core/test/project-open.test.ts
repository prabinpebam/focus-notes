/** Open (owner, 4 November): a project's folder path shows the folder, and a first load shows placeholders, not "empty". */
import { describe, expect, it } from "vitest";
import en from "../../views/messages/en.json" with { type: "json" };
import { createApp, type PlatformBridge, type ProjectEntry } from "../src/index.ts";

function appWith(projects: Partial<NonNullable<PlatformBridge["projects"]>>) {
  const bridge = {
    platform: "windows",
    readNote: async () => "",
    writeNote: async () => {},
    chooseNote: async () => undefined,
    newNotePath: async () => "/n/Untitled.md",
    defaultNotePath: async () => "/n/Welcome.md",
    loadAppState: async () => ({ version: 1 }),
    saveAppState: async () => {},
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    projects,
  } as unknown as PlatformBridge;
  return createApp(bridge, en);
}
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.projects", app.store.state) as { error: string; recentWaiting: boolean; entriesWaiting: boolean; entries: unknown[] };
const book: ProjectEntry = { folder: "C:\\Book", name: "Book", accent: "teal", logo: "book" } as ProjectEntry;

describe("Open", () => {
  it("shows a project's folder through the bridge", async () => {
    const shown: string[] = [];
    const app = appWith({ list: async () => [book], reveal: async (folder: string) => { shown.push(folder); } });
    await app.commands.run("projects.reveal", { id: "C:\\Book" });
    expect(shown).toEqual(["C:\\Book"]);
    expect(vm(app).error).toBe("");
  });
  it("says so when the folder can't be shown, and keeps the list", async () => {
    const app = appWith({ list: async () => [book], reveal: async () => { throw new Error("gone"); } });
    await app.commands.run("projects.open");
    await app.commands.run("projects.reveal", { id: "C:\\Book" });
    expect(vm(app).error).toBe(en["project.open.revealFailed"]);
    expect(vm(app).entries).toHaveLength(1);
  });
  it("waits with placeholders on a first load, then shows the list", async () => {
    let done!: (e: ProjectEntry[]) => void;
    const app = appWith({ list: () => new Promise<ProjectEntry[]>((r) => { done = r; }) });
    const opening = app.commands.run("projects.open");
    await Promise.resolve();
    expect(vm(app).entriesWaiting).toBe(true);
    done([book]);
    await opening;
    expect(vm(app).entriesWaiting).toBe(false);
    expect(vm(app).entries).toHaveLength(1);
  });
});
