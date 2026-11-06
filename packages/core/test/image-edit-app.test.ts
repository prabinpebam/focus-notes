import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createApp, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const data = "data:image/png;base64,b3JpZ2luYWw=";
const edited = "data:image/png;base64,Y3JvcA==";
async function setup(overrides: Partial<PlatformBridge> = {}) {
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "# Image\n", writeNote: async () => {},
    chooseNote: async () => "/notes/image.md", newNotePath: async () => "/notes/image.md", defaultNotePath: async () => "/notes/image.md",
    loadAppState: async () => ({ version: 1, firstRun: "done", lastNotePath: "/notes/image.md" }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {}, readImage: async () => data,
    createImageCopy: async () => ({ src: "crop.png", width: 100, height: 100 }), ...overrides,
  };
  const app = createApp(bridge, messages);
  await app.start();
  await app.commands.run("image.read", { src: "original.png" });
  await app.commands.run("image.select", { pos: 3, src: "original.png", width: 1200, height: 700, from: 3, to: 4, count: 1, rounded: true, fitHeight: true, mode: "wide", roundMixed: false, limitMixed: false });
  return app;
}

describe("approved image editing", () => {
  it("uses oriented percentages and stages a copy before requesting one undoable reference swap", async () => {
    const copy = vi.fn(async () => ({ src: "crop.png", width: 100, height: 100 }));
    const app = await setup({ createImageCopy: copy });
    const actions = vi.fn();
    app.onEditorAction(actions);
    await app.commands.run("image.edit");
    await app.commands.run("image.edit.crop", { x: 10, y: 20, width: 50, height: 50 });
    await app.commands.run("image.edit.rotate", { id: "right" });
    await app.commands.run("image.edit.save");
    const request = actions.mock.calls.find(call => call[0] === "image.renderEdit")?.[1]?.request;
    expect(actions).toHaveBeenCalledWith("image.renderEdit", expect.objectContaining({ x: 10, y: 20, width: 50, height: 50, rotation: 90, request }));
    await app.commands.run("image.edited", { src: "original.png", data: edited, request });
    expect(copy).toHaveBeenCalledWith("/notes/image.md", "original.png", edited, data);
    expect(actions).toHaveBeenCalledWith("image.applyEdit", expect.objectContaining({ request, image: { src: "crop.png", width: 100, height: 100, originalSrc: "original.png" } }));
    expect(app.store.state.ui.images.saving).toBe(true);
    await app.commands.run("image.edit.applied", { request, accepted: true });
    expect(app.store.state.ui.images.edit).toBe(false);
    expect(app.store.state.ui.images.saving).toBe(false);
  });

  it("keeps the original and draft when a copy write fails", async () => {
    const app = await setup({ createImageCopy: async () => { throw new Error("disk-full"); } });
    const actions = vi.fn();
    app.onEditorAction(actions);
    await app.commands.run("image.edit");
    await app.commands.run("image.edit.crop", { x: 0, y: 0, width: 50, height: 50 });
    await app.commands.run("image.edit.save");
    const request = actions.mock.calls.find(call => call[0] === "image.renderEdit")?.[1]?.request;
    await app.commands.run("image.edited", { src: "original.png", data: edited, request });
    expect(app.store.state.ui.images).toMatchObject({ edit: true, saving: false, error: messages["image.edit.failed"] });
    expect(actions.mock.calls.map(call => call[0])).not.toContain("image.applyEdit");
    expect(app.store.state.ui.images.sources[0]?.value).toBe(data);
  });

  it("does not apply a late crop to a reopened note at the same path", async () => {
    let resolve!: (image: { src: string; width: number; height: number }) => void;
    const app = await setup({ createImageCopy: () => new Promise(done => { resolve = done; }) });
    const actions = vi.fn();
    app.onEditorAction(actions);
    await app.commands.run("image.edit");
    await app.commands.run("image.edit.crop", { x: 0, y: 0, width: 50, height: 50 });
    await app.commands.run("image.edit.save");
    const request = actions.mock.calls.find(call => call[0] === "image.renderEdit")?.[1]?.request;
    const saving = app.commands.run("image.edited", { src: "original.png", data: edited, request });
    app.store.update(s => ({ ...s, note: { ...s.note, key: `${s.note.key}-reopened` } }));
    resolve({ src: "unused.png", width: 100, height: 100 });
    await saving;
    expect(actions.mock.calls.map(call => call[0])).not.toContain("image.applyEdit");
  });
});
