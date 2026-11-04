import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createApp, type AppStateFile, type PlatformBridge } from "../src/index.ts";

function setup(save: PlatformBridge["saveAppState"], upload?: () => Promise<string | undefined>) {
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "", writeNote: async () => {},
    chooseNote: async () => undefined, newNotePath: async () => "", defaultNotePath: async () => "",
    loadAppState: async () => ({ version: 1 }), saveAppState: save,
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
    ...(upload ? { projects: {
      upload, localNote: async () => {}, importLocal: async () => "", edited: async () => {}, pin: async () => {},
      lastNote: async () => undefined, position: async () => undefined, remember: async () => {},
      list: async () => [], open: async () => {}, choose: async () => undefined, parent: async () => "",
      chooseParent: async () => undefined, check: async () => ({ folder: "", problem: "" }), create: async () => "",
    } } : {}),
  };
  const app = createApp(bridge, JSON.parse(readFileSync(new URL("../../views/messages/en.json", import.meta.url), "utf8")));
  app.store.update((s) => ({ ...s, workspace: { ...s.workspace, folder: "C:\\Project" } }));
  return app;
}

it("keeps an uploaded logo source across a refused save and retries without reopening the picker", async () => {
  const source = "data:image/svg+xml;base64,PHN2Zy8+";
  const upload = vi.fn().mockResolvedValue(source);
  const save = vi.fn().mockRejectedValue(new Error("disk full"));
  const app = setup(save, upload);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await app.commands.run("project.upload");
    expect(app.viewModels.select("vm.project", app.store.state)).toMatchObject({
      logo: "book", logoChoice: "upload", uploadSrc: source, uploadCommit: "failed", logoFailed: true,
    });
    expect(app.store.state.ui.toasts).toEqual([]);
    save.mockResolvedValue(undefined);
    await app.commands.run("project.logoRetry");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(save.mock.calls.at(-1)?.[0].projectSettings?.["C:\\Project"]).toMatchObject({ logo: "upload", logoSrc: source });
    expect(app.viewModels.select("vm.project", app.store.state)).toMatchObject({ logo: "upload", uploadSrc: source, uploadCommit: "confirmed" });
    expect(app.store.state.announcement.text).toBe("Logo saved.");
  } finally { logged.mockRestore(); }
});

it("cancels the logo picker without saving or confirming, and Revert discards a failed source without writing", async () => {
  const upload = vi.fn().mockResolvedValue(undefined);
  const save = vi.fn().mockRejectedValue(new Error("disk full"));
  const app = setup(save, upload);
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await app.commands.run("project.upload");
    expect(save).not.toHaveBeenCalled();
    expect(app.store.state.announcement.n).toBe(0);
    expect(app.viewModels.select("vm.project", app.store.state)).toMatchObject({ uploadChoosing: false, uploadCommit: "rest" });
    upload.mockResolvedValue("data:image/svg+xml;base64,PHN2Zy8+");
    await app.commands.run("project.upload");
    await app.commands.run("commit.revert", { target: "vm.project.logo" });
    expect(app.viewModels.select("vm.project", app.store.state)).toMatchObject({ logo: "book", logoChoice: "book", uploadSrc: "", uploadCommit: "rest" });
    expect(save).toHaveBeenCalledTimes(1);
  } finally { logged.mockRestore(); }
});

it("merges independent project changes at execution time so concurrent fields cannot overwrite each other", async () => {
  const writes: AppStateFile[] = [];
  let release!: () => void;
  const app = setup(async (state) => {
    writes.push(state);
    if (writes.length === 1) await new Promise<void>((resolve) => { release = resolve; });
  });
  const name = app.commands.run("project.name", { value: "New name" });
  const colour = app.commands.run("project.accent", { value: "blue" });
  await vi.waitFor(() => expect(writes).toHaveLength(1));
  release();
  await Promise.all([name, colour]);
  expect(writes.at(-1)?.projectSettings?.["C:\\Project"]).toMatchObject({ name: "New name", accent: "blue" });
});

it("does not leak a rejected name into another field's save and recovers the project write lane", async () => {
  const writes: AppStateFile[] = [];
  const save = vi.fn().mockRejectedValueOnce(new Error("disk full")).mockImplementation(async (state: AppStateFile) => { writes.push(state); });
  const app = setup(save);
  await expect(app.commands.run("project.name", { value: "Rejected name" })).rejects.toThrow("disk full");
  await app.commands.run("project.accent", { value: "blue" });
  expect(writes.at(-1)?.projectSettings?.["C:\\Project"]).toMatchObject({ name: "Project", accent: "blue" });
});

it("shows a failed project choice locally without changing confirmed project identity, and Revert does not write", async () => {
  const save = vi.fn().mockRejectedValue(new Error("disk full"));
  const app = setup(save);
  await expect(app.commands.run("commit.run", { target: "vm.project.accent", command: "project.accent", value: "blue" })).rejects.toThrow("disk full");
  expect(app.viewModels.select("vm.project", app.store.state)).toMatchObject({
    accent: "teal", accentChoice: "blue", accentCommit: "failed", accentFailed: true,
  });

  await app.commands.run("commit.revert", { target: "vm.project.accent" });
  expect(app.viewModels.select("vm.project", app.store.state)).toMatchObject({
    accent: "teal", accentChoice: "teal", accentCommit: "rest", accentFailed: false,
  });
  expect(save).toHaveBeenCalledTimes(1);
});

it.each([["font", "serif"], ["theme", "sepia"]])("retains a failed %s choice on its trigger and clears its preview without changing the saved value", async (field, value) => {
  const app = setup(async () => { throw new Error("disk full"); });
  await app.commands.run(`project.${field}Open`, { value: "yes" });
  await app.commands.run(`project.${field}Hover`, { value });
  await expect(app.commands.run("commit.run", { target: `vm.project.${field}`, command: `project.${field}`, value })).rejects.toThrow("disk full");
  expect(app.viewModels.select("vm.project", app.store.state)).toMatchObject({
    [field]: "app", [`${field}Choice`]: value, [`${field}Commit`]: "failed", [`${field}Failed`]: true,
    [`${field}Open`]: "no", [`${field}Hover`]: "", [`scope${field === "font" ? "Font" : "Theme"}`]: "app",
  });
});

it("keeps the saved watermark off after refusal and changes the writing surface only after Retry persists", async () => {
  const save = vi.fn().mockRejectedValue(new Error("disk full"));
  const app = setup(save);
  const args = { target: "vm.project.watermark", command: "project.watermark", value: "on" };
  await expect(app.commands.run("commit.run", args)).rejects.toThrow("disk full");
  expect(app.viewModels.select("vm.project", app.store.state)).toMatchObject({ watermark: "off", watermarkOn: false });
  expect(app.store.state.commits).toContainEqual(expect.objectContaining({ target: args.target, phase: "failed", value: "on" }));
  save.mockResolvedValue(undefined);
  await app.commands.run("commit.run", args);
  expect(app.viewModels.select("vm.project", app.store.state)).toMatchObject({ watermark: "on", watermarkOn: true });
});

it("announces a confirmed commit once, not pending, failed or clearing, and never speaks the retained draft", async () => {
  vi.useFakeTimers();
  try {
    const save = vi.fn().mockResolvedValue(undefined);
    const app = setup(save);
    const args = { target: "vm.project.name", command: "project.name", value: "A private draft", label: "Project name" };
    const first = app.commands.run("commit.run", args);
    expect(app.store.state.announcement.n).toBe(0);
    await vi.advanceTimersByTimeAsync(199);
    expect(app.store.state.announcement.n).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await first;
    expect(app.store.state.announcement).toEqual({ text: "Project name saved.", n: 1 });
    save.mockRejectedValue(new Error("disk full"));
    const failed = expect(app.commands.run("commit.run", { ...args, value: "Another retained draft" })).rejects.toThrow("disk full");
    await vi.advanceTimersByTimeAsync(200);
    await failed;
    expect(app.store.state.announcement).toEqual({ text: "Project name saved.", n: 1 });
    save.mockResolvedValue(undefined);
    const retry = app.commands.run("commit.run", { ...args, value: "Another retained draft" });
    await vi.advanceTimersByTimeAsync(200);
    await retry;
    expect(app.store.state.announcement).toEqual({ text: "Project name saved.", n: 2 });
    await vi.advanceTimersByTimeAsync(200);
    expect(app.store.state.announcement.n).toBe(2);
  } finally { vi.useRealTimers(); }
});
