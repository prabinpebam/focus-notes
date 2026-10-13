import { describe, expect, it, vi } from "vitest";
import { createApp, chordMatches, formatChord, SAVE_DELAY_MS, type PlatformBridge, type AppStateFile } from "../src/index.ts";

function fakeBridge(files: Record<string, string> = {}, overrides: Partial<PlatformBridge> = {}) {
  let state: AppStateFile = { version: 1 };
  const writes: [string, string][] = [];
  const bridge: PlatformBridge = {
    platform: "windows",
    readNote: async (p) => {
      if (!(p in files)) throw new Error("missing");
      return files[p]!;
    },
    writeNote: async (p, c) => {
      files[p] = c;
      writes.push([p, c]);
    },
    chooseNote: async () => undefined,
    defaultNotePath: async () => {
      files["/notes/Welcome.md"] ??= "# Welcome\n";
      return "/notes/Welcome.md";
    },
    loadAppState: async () => state,
    saveAppState: async (s) => {
      state = s;
    },
    systemScheme: () => "light",
    onSystemSchemeChange: () => () => {},
    ...overrides,
  };
  return { bridge, files, writes, state: () => state };
}
const messages = { "command.note.open": "Open", "command.note.save": "Save", "command.note.setContent": "Set", "command.appearance.toggle": "Theme", "command.trigger.activate": "Menu", "command.app.ready": "Ready" };

describe("app start", () => {
  it("opens the welcome note on first launch", async () => {
    const { bridge } = fakeBridge();
    const app = createApp(bridge, messages);
    await app.start();
    expect(app.store.state.note).toMatchObject({ path: "/notes/Welcome.md", markdown: "# Welcome\n", status: "ready", saveState: "saved" });
  });
  it("reopens the last note", async () => {
    const f = fakeBridge({ "/a.md": "A" });
    await f.bridge.saveAppState({ version: 1, lastNotePath: "/a.md" });
    const app = createApp(f.bridge, messages);
    await app.start();
    expect(app.store.state.note.path).toBe("/a.md");
  });
  it("falls back to the welcome note when the last note is gone", async () => {
    const f = fakeBridge();
    await f.bridge.saveAppState({ version: 1, lastNotePath: "/gone.md" });
    const app = createApp(f.bridge, messages);
    await app.start();
    expect(app.store.state.note.path).toBe("/notes/Welcome.md");
  });
});

describe("saving (EDT-11 write-to-disk part, QLT-03)", () => {
  it("writes once after typing pauses, and marks saved", async () => {
    vi.useFakeTimers();
    const f = fakeBridge();
    const app = createApp(f.bridge, messages);
    await app.start();
    await app.commands.run("note.setContent", { value: "a" });
    await app.commands.run("note.setContent", { value: "ab" });
    expect(app.store.state.note.saveState).toBe("unsaved");
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS + 10);
    expect(f.writes).toEqual([["/notes/Welcome.md", "ab"]]);
    expect(app.store.state.note.saveState).toBe("saved");
    vi.useRealTimers();
  });
  it("flush writes pending text immediately", async () => {
    const f = fakeBridge();
    const app = createApp(f.bridge, messages);
    await app.start();
    await app.commands.run("note.setContent", { value: "now" });
    await app.flush();
    expect(f.files["/notes/Welcome.md"]).toBe("now");
  });
  it("shows a save problem when writing fails, and keeps the text", async () => {
    const f = fakeBridge({}, { writeNote: async () => { throw new Error("disk full"); } });
    const app = createApp(f.bridge, messages);
    await app.start();
    await app.commands.run("note.setContent", { value: "keep me" });
    await app.flush();
    expect(app.store.state.note.saveState).toBe("error");
    expect(app.store.state.note.markdown).toBe("keep me");
    expect(app.viewModels.select("vm.canvas", app.store.state).saveProblem).toBe(true);
  });
});

describe("appearance", () => {
  it("toggles light and dark and remembers it", async () => {
    const f = fakeBridge();
    const app = createApp(f.bridge, messages);
    await app.start();
    expect(app.viewModels.select("vm.app", app.store.state).scheme).toBe("light");
    await app.commands.run("appearance.toggle");
    expect(app.viewModels.select("vm.app", app.store.state).scheme).toBe("dark");
    expect(f.state().appearance).toBe("dark");
  });
});

describe("commands and keys (KEY-01, KEY-02)", () => {
  it("matches Mod to Ctrl on Windows and Cmd on macOS", () => {
    const e = { key: "l", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false };
    expect(chordMatches("Mod+Shift+L", e, "windows")).toBe(true);
    expect(chordMatches("Mod+Shift+L", e, "macos")).toBe(false);
    expect(chordMatches("Mod+Shift+L", { ...e, ctrlKey: false, metaKey: true }, "macos")).toBe(true);
    expect(chordMatches("Mod+L", e, "windows")).toBe(false);
  });
  it("formats chords per platform", () => {
    expect(formatChord("Mod+Shift+L", "macos")).toBe("⇧⌘L");
    expect(formatChord("Mod+Shift+L", "windows")).toBe("Ctrl+Shift+L");
  });
  it("describes commands with their shortcut and state", async () => {
    const app = createApp(fakeBridge().bridge, messages);
    await app.start();
    expect(app.commands.describe("appearance.toggle")).toMatchObject({ id: "appearance.toggle", shortcut: "Mod+Shift+L", enabled: true, checked: false });
  });
  it("finds message arguments, including inside select", () => {
    const app = createApp(fakeBridge().bridge, { x: "Press {platform, select, macos {⌘/} other {Ctrl+/}} {count, plural, one {# note} other {# notes}}" });
    expect(app.messages.argumentsOf("x").sort()).toEqual(["count", "platform"]);
  });
});
