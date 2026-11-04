import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createApp, type AppStateFile, type PlatformBridge } from "../src/index.ts";

function setup(save: PlatformBridge["saveAppState"]) {
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "", writeNote: async () => {},
    chooseNote: async () => undefined, newNotePath: async () => "", defaultNotePath: async () => "",
    loadAppState: async () => ({ version: 1 }), saveAppState: save,
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
  };
  const app = createApp(bridge, JSON.parse(readFileSync(new URL("../../views/messages/en.json", import.meta.url), "utf8")));
  app.store.update((s) => ({ ...s, workspace: { ...s.workspace, folder: "C:\\Project" } }));
  return app;
}

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
