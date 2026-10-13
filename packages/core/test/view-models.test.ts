/** View models declare the content they show, and only what changed is selected again (PRF-11). */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp, ViewModelRegistry, type PlatformBridge } from "../src/index.ts";

const messages = JSON.parse(readFileSync(join(import.meta.dirname, "../../views/messages/en.json"), "utf8")) as Record<string, string>;
const bridge: PlatformBridge = {
  platform: "windows", readNote: async () => "", writeNote: async () => {}, chooseNote: async () => undefined, newNotePath: async () => "/n/Untitled.md",
  defaultNotePath: async () => "/n/a.md", loadAppState: async () => ({ version: 1 }), saveAppState: async () => {},
  systemScheme: () => "light", onSystemSchemeChange: () => () => {},
};

interface S { note: { path: string; text: string }; ui: { open: boolean }; n: number }
const base: S = { note: { path: "/a.md", text: "a" }, ui: { open: false }, n: 0 };

describe("content declarations (PRF-11)", () => {
  it("every view model the app registers declares what it reads", () => {
    const app = createApp(bridge, messages);
    const missing = app.viewModels.list().filter((d) => d.reads === undefined).map((d) => d.id);
    expect(missing).toEqual([]);
  });
  it("the canvas shows one note, by path", async () => {
    const app = createApp(bridge, messages);
    await app.start();
    expect(app.viewModels.showing([{ kind: "note", path: "/n/a.md" }], app.store.state)).toEqual(["vm.canvas"]);
    expect(app.viewModels.showing([{ kind: "note", path: "/n/other.md" }], app.store.state)).toEqual([]);
  });
  it("a change to state a view model doesn't read keeps its value, so nothing that shows it re-renders", () => {
    const r = new ViewModelRegistry<S>();
    let runs = 0;
    r.register({ id: "vm.note", reads: ["note.path"], schema: { type: "object", properties: {} }, select: (s) => { runs++; return { path: s.note.path }; } });
    const first = r.select("vm.note", base);
    const typed = { ...base, note: { ...base.note, text: "ab" }, n: 1 };
    expect(r.select("vm.note", typed)).toBe(first);
    expect(runs).toBe(1);
    expect(r.changed(base, typed)).toEqual([]);
    const moved = { ...typed, note: { ...typed.note, path: "/b.md" } };
    expect(r.select("vm.note", moved)).toEqual({ path: "/b.md" });
    expect(r.changed(typed, moved)).toEqual(["vm.note"]);
  });
  it("a view model that reads everything keeps its value while the value is equal", () => {
    const r = new ViewModelRegistry<S>();
    r.register({ id: "vm.all", reads: "*", schema: { type: "object", properties: {} }, select: (s) => ({ items: [{ open: s.ui.open }] }) });
    const first = r.select("vm.all", base);
    expect(r.select("vm.all", { ...base, n: 2 })).toBe(first);
    expect(r.select("vm.all", { ...base, ui: { open: true } })).not.toBe(first);
  });
  it("matches changes against what each view model shows", () => {
    const r = new ViewModelRegistry<S>();
    r.register({ id: "vm.note", reads: ["note"], shows: (s) => [{ kind: "note", path: s.note.path }], schema: { type: "object", properties: {} }, select: () => ({}) });
    r.register({ id: "vm.files", reads: ["n"], shows: () => [{ kind: "tree" }], schema: { type: "object", properties: {} }, select: () => ({}) });
    r.register({ id: "vm.other", reads: ["ui"], schema: { type: "object", properties: {} }, select: () => ({}) });
    expect(r.showing([{ kind: "note", path: "/a.md" }], base)).toEqual(["vm.note"]);
    expect(r.showing([{ kind: "tree" }, { kind: "note", path: "/x.md" }], base)).toEqual(["vm.files"]);
    expect(r.showing([{ kind: "note", path: "/x.md" }], base)).toEqual([]);
  });
});
