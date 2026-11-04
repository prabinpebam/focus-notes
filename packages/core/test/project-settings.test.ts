import { expect, it, vi } from "vitest";
import { createApp, type AppStateFile, type PlatformBridge } from "../src/index.ts";

function setup(save: PlatformBridge["saveAppState"]) {
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "", writeNote: async () => {},
    chooseNote: async () => undefined, newNotePath: async () => "", defaultNotePath: async () => "",
    loadAppState: async () => ({ version: 1 }), saveAppState: save,
    systemScheme: () => "light", onSystemSchemeChange: () => () => {},
  };
  const app = createApp(bridge, {});
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
