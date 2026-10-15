/**
 * The app-built window in the app (DSK-03, DSK-08, D-14): window commands, the state the shell
 * reports, the system menu, and the Snap Layouts picker's layouts. macOS and the browser keep the
 * native window: no window commands, no frame.
 */
import { describe, expect, it } from "vitest";
import { createApp, type PlatformBridge, type WindowBridge, type WindowReport } from "../src/index.ts";
import en from "../../views/messages/en.json" with { type: "json" };

const base = (platform: PlatformBridge["platform"]): PlatformBridge => ({
  platform,
  readNote: async () => "# A\n",
  writeNote: async () => {},
  chooseNote: async () => undefined,
  newNotePath: async () => "/n/new.md",
  defaultNotePath: async () => "/n/a.md",
  loadAppState: async () => ({ version: 1 }),
  saveAppState: async () => {},
  systemScheme: () => "light",
  onSystemSchemeChange: () => () => {},
});

function setup(report: Partial<WindowReport> = {}) {
  const calls: string[] = [];
  let listener: ((r: WindowReport) => void) | undefined;
  let menu: (() => void) | undefined;
  const first: WindowReport = { frame: "custom", maximized: false, snapped: false, fullScreen: false, active: true, layouts: ["halves", "thirds", "quarters", "maximize"], ...report };
  const win: WindowBridge = {
    state: async () => first,
    onState: (l) => ((listener = l), () => {}),
    onMenu: (l) => ((menu = l), () => {}),
    minimize: () => calls.push("minimize"),
    maximize: () => calls.push("maximize"),
    restore: () => calls.push("restore"),
    toggleVertical: () => calls.push("vertical"),
    close: () => calls.push("close"),
    snap: (z) => calls.push(`snap ${z}`),
    drag: (phase, kind, x, y, shift) => calls.push(`drag ${phase} ${kind} ${x},${y}${shift ? " shift" : ""}`),
    keyboard: (mode) => calls.push(`keyboard ${mode}`),
    key: (k, fine) => calls.push(`key ${k}${fine ? " fine" : ""}`),
  };
  const app = createApp({ ...base("windows"), window: win }, en);
  return { app, calls, emit: (r: Partial<WindowReport>) => listener?.({ ...first, ...r }), menuKey: () => menu?.() };
}
const vm = (app: ReturnType<typeof createApp>) => app.viewModels.select("vm.window", app.store.state) as Record<string, any>;

describe("DSK-03, DSK-08: window commands on Windows and Linux", () => {
  it("frames the window once the shell reports it, rounded at rest and square when maximized or snapped (DSK-01)", async () => {
    const { app, emit } = setup();
    expect(vm(app).frame).toBe("native");
    await app.start();
    expect(vm(app)).toMatchObject({ custom: true, frame: "rounded", resizable: true, maximized: false });
    emit({ maximized: true });
    expect(vm(app)).toMatchObject({ frame: "square", resizable: false, maximized: true });
    emit({ snapped: true });
    expect(vm(app)).toMatchObject({ frame: "square", resizable: true });
    emit({ fullScreen: true });
    expect(vm(app)).toMatchObject({ frame: "square", resizable: false });
    emit({ frame: "opaque" });
    expect(vm(app).frame).toBe("square");
  });
  it("DSK-04: tells the frame when the window is full screen, so the band hides until the pointer reaches the top edge", async () => {
    const { app, emit } = setup();
    await app.start();
    expect(vm(app).fullScreen).toBe(false);
    emit({ fullScreen: true });
    expect(vm(app)).toMatchObject({ fullScreen: true, frame: "square", resizable: false });
    emit({ fullScreen: false });
    expect(vm(app).fullScreen).toBe(false);
  });
  it("minimizes, maximizes, restores, closes, and snaps through the shell", async () => {
    const { app, calls, emit } = setup();
    await app.start();
    for (const id of ["window.minimize", "window.maximize", "window.close", "window.snap.left", "window.snap.rightThird", "window.toggleMaximize"]) await app.commands.run(id);
    emit({ maximized: true });
    await app.commands.run("window.toggleMaximize");
    await app.commands.run("window.restore");
    expect(calls).toEqual(["minimize", "maximize", "close", "snap left", "snap rightThird", "maximize", "restore", "restore"]);
  });
  it("D-141: double-clicking the top or bottom border maximizes vertically through the shell, but not while maximized", async () => {
    const { app, calls, emit } = setup();
    await app.start();
    await app.commands.run("window.toggleVertical");
    emit({ maximized: true });
    expect(app.commands.describe("window.toggleVertical").enabled).toBe(false);
    expect(calls).toEqual(["vertical"]);
  });
  it("passes the frame's moves and resizes to the shell", async () => {
    const { app, calls } = setup();
    await app.start();
    await app.commands.run("window.drag", { phase: "start", kind: "move", x: 10, y: 20 });
    await app.commands.run("window.drag", { phase: "move", kind: "se", x: 15, y: 25, shift: true });
    await app.commands.run("window.drag", { phase: "end", kind: "bogus", x: 15, y: 25 });
    expect(calls).toEqual(["drag start move 10,20", "drag move se 15,25 shift"]);
  });
  it("shows Restore only when there's something to restore, and no Move or Size when maximized, like Windows", async () => {
    const { app, emit } = setup();
    await app.start();
    const items = () => (vm(app).menu as { items: { id: string; disabled?: boolean }[] }[]).flatMap((s) => s.items);
    const disabled = () => items().filter((i) => i.disabled).map((i) => i.id);
    expect(items().map((i) => i.id)).toEqual(["window.restore", "window.move", "window.size", "window.minimize", "window.maximize", "window.snap.left", "window.snap.right", "window.close"]);
    expect(disabled()).toEqual(["window.restore"]);
    emit({ maximized: true });
    expect(disabled()).toEqual(["window.move", "window.size", "window.maximize"]);
  });
  it("opens the system menu with Alt+Space from the shell, or at the pointer", async () => {
    const { app, menuKey } = setup();
    await app.start();
    expect(vm(app).menuRequest).toBe(0);
    menuKey();
    expect(vm(app)).toMatchObject({ menuRequest: 1, menuX: -1, menuY: -1 });
    await app.commands.run("window.systemMenu", { x: 120, y: 30 });
    expect(vm(app)).toMatchObject({ menuRequest: 2, menuX: 120, menuY: 30 });
  });
  it("starts the system menu's keyboard Move and Size", async () => {
    const { app, calls, emit } = setup();
    await app.start();
    await app.commands.run("window.move");
    await app.commands.run("window.size");
    expect(calls).toEqual(["keyboard move", "keyboard size"]);
    // The shell says when it's running; keys the page gets meanwhile go to it.
    await app.commands.run("window.key", { key: "ArrowLeft" });
    emit({ keyboard: "size" });
    expect(vm(app).keyboard).toBe("size");
    await app.commands.run("window.key", { key: "ArrowLeft", fine: true });
    await app.commands.run("window.key", { key: "a" });
    emit({});
    expect(vm(app).keyboard).toBe("none");
    expect(calls.slice(2)).toEqual(["key ArrowLeft fine"]);
  });
  it("lists the Snap Layouts zones with names, thirds only when the display is wide", async () => {
    const { app, emit } = setup();
    await app.start();
    const layouts = () => vm(app).layouts as { id: string; label: string; items: { id: string; label: string }[] }[];
    expect(layouts().map((l) => l.id)).toEqual(["halves", "thirds", "quarters", "maximize"]);
    expect(layouts()[0]!.items).toEqual([{ id: "window.snap.left", label: "Left half" }, { id: "window.snap.right", label: "Right half" }]);
    expect(layouts()[3]!.items[0]!.id).toBe("window.maximize");
    emit({ layouts: ["halves", "quarters", "maximize"] });
    expect(layouts().map((l) => l.id)).toEqual(["halves", "quarters", "maximize"]);
  });
  it("shows the window controls while the window isn't active or the toolbar is open", async () => {
    const { app, emit } = setup();
    await app.start();
    expect(vm(app).reveal).toBe(false);
    emit({ active: false });
    expect(vm(app).reveal).toBe(true);
    emit({ active: true });
    await app.commands.run("toolbar.setOpen", { open: true });
    expect(vm(app).reveal).toBe(true);
  });
});

describe("DSK-01: macOS and the browser keep the native window", () => {
  for (const platform of ["macos", "web"] as const) {
    it(`${platform}: no frame and no window commands`, async () => {
      const app = createApp(base(platform), en);
      await app.start();
      expect(vm(app)).toMatchObject({ custom: false, frame: "native" });
      for (const id of ["window.minimize", "window.maximize", "window.close", "window.snap.left", "window.systemMenu"]) expect(app.commands.describe(id).enabled, id).toBe(false);
    });
  }
});
