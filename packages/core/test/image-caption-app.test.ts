import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, type PlatformBridge } from "../src/index.ts";
import type { AiBridge, AiSettingsView } from "../src/bridge.ts";

const data = "data:image/png;base64,aW1hZ2U=";
const connection = { id: "vision", provider: "ollama", name: "Vision", endpoint: "http://127.0.0.1:11434", model: "model", deployment: "", apiVersion: "", account: "", hasKey: false, consented: false, imageCapable: true };
const settings: AiSettingsView = { writer: "writer", connections: [connection] };
async function setup(overrides: Partial<AiBridge> = {}) {
  let event: (event: unknown) => void = () => {};
  const start = vi.fn(async (_id: string, _input: { connection: string; instruction: string; image: string }) => {});
  const cancel = vi.fn(async (_id: string) => {});
  const writer = vi.fn(async () => settings);
  const ai: AiBridge = {
    settings: async () => settings, save: async () => settings, saveDetail: async () => ({ ...settings, id: "vision" }), saveKey: async () => settings,
    remove: async () => settings, writer, test: async () => settings, discover: async () => [], models: async () => [],
    rewriteStart: async () => {}, rewriteCancel: async () => {}, onRewriteEvent: () => () => {},
    captionSettings: async () => settings, captionStart: start, captionCancel: cancel, onCaptionEvent: listener => { event = listener; return () => {}; }, ...overrides,
  };
  const readImage = vi.fn(async () => data);
  const bridge: PlatformBridge = {
    platform: "windows", readNote: async () => "# Note\n", writeNote: async () => {},
    chooseNote: async () => "note.md", newNotePath: async () => "note.md", defaultNotePath: async () => "note.md",
    loadAppState: async () => ({ version: 1, firstRun: "done", lastNotePath: "note.md" }), saveAppState: async () => {},
    systemScheme: () => "light", onSystemSchemeChange: () => () => {}, ai, readImage,
  };
  const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8"));
  const app = createApp(bridge, messages);
  await app.start();
  const action = vi.fn();
  app.onEditorAction(action);
  await app.commands.run("image.select", { pos: 2, src: "a.png", alt: "Description", title: "Old caption", text: false, count: 1 });
  await app.commands.run("image.ai");
  const vm = () => app.viewModels.select("vm.imageCaption", app.store.state);
  const generate = async () => {
    await app.commands.run("image.ai.integration", { value: "vision" });
    await app.commands.run("image.ai.generate");
    const args = action.mock.calls.findLast(c => c[0] === "image.prepareCaption")![1];
    await app.commands.run("image.ai.prepared", { request: args.request, data, error: "" });
    return args.request as string;
  };
  return { app, vm, action, event: (e: unknown) => event(e), start, cancel, writer, generate, readImage };
}
it("caption is an explicit minimal-payload request, editable result, and separate from Writer", async () => {
  const t = await setup();
  expect(t.start).not.toHaveBeenCalled();
  const id = await t.generate();
  expect(t.start).toHaveBeenCalledWith(id, { connection: "vision", instruction: "Write a short caption for this image.", image: data });
  t.event({ id, type: "delta", text: "Generated." });
  t.event({ id, type: "done" });
  expect(t.vm()).toMatchObject({ writing: false, result: "Generated.", hasResult: true });
  await t.app.commands.run("image.ai.result", { value: "Edited." });
  await t.app.commands.run("image.ai.use");
  expect(t.action).toHaveBeenLastCalledWith("image.applyCaption", { request: expect.any(String), title: "Edited." });
  expect(t.writer).not.toHaveBeenCalled();
  expect(t.app.store.state.note.markdown).toBe("# Note\n");
  const applied = t.action.mock.calls.at(-1)![1];
  await t.app.commands.run("image.ai.applied", { request: applied.request, accepted: true });
  await t.app.commands.run("image.ai");
  expect(t.vm()).toMatchObject({ open: true, applying: false });
  await t.app.commands.run("image.ai.integration", { value: "vision" });
  expect(t.vm()).toMatchObject({ generateDisabled: false });
});
it("Stop and note changes cancel only the caption request and ignore late results", async () => {
  const t = await setup();
  const first = await t.generate();
  await t.app.commands.run("image.ai.stop");
  expect(t.cancel).toHaveBeenCalledWith(first);
  t.event({ id: first, type: "delta", text: "Late" });
  expect(t.vm()).toMatchObject({ writing: false, result: "" });
  const next = await t.generate();
  t.app.store.update(s => ({ ...s, note: { ...s.note, key: "different" } }));
  expect(t.cancel).toHaveBeenCalledWith(next);
  expect(t.vm()).toMatchObject({ open: false });
});
it("changed pixels never apply a stale result and keep it for copying", async () => {
  const t = await setup();
  const id = await t.generate();
  t.event({ id, type: "delta", text: "Keep this result." });
  t.event({ id, type: "done" });
  t.readImage.mockResolvedValueOnce("different-pixels");
  await t.app.commands.run("image.ai.use");
  expect(t.action.mock.calls.some(c => c[0] === "image.applyCaption")).toBe(false);
  expect(t.vm()).toMatchObject({ result: "Keep this result.", error: expect.stringContaining("image changed") });
});
it("unconfirmed capabilities prevent generation and allow manual captions", async () => {
  const t = await setup({ captionSettings: async () => ({ writer: "writer", connections: [{ ...connection, imageCapable: false }] }) });
  await t.app.commands.run("image.ai.generate");
  expect(t.start).not.toHaveBeenCalled();
  expect(t.vm()).toMatchObject({ noVision: true, open: true });
  await t.app.commands.run("image.ai.manual");
  expect(t.action).toHaveBeenLastCalledWith("image.caption", { pos: 2, src: "a.png" });
});
