/**
 * The main window's frame (D-14): on macOS the system's own window, with its place remembered and its
 * traffic lights shown only on the title bar band (`MacTitleBar`, DSK-02); on Windows and Linux the
 * transparent, app-built window (`CustomWindow`), with its snap preview, its keys (Alt+Space and the
 * system menu's Move and Size), and its IPC.
 */
import { BrowserWindow, ipcMain, screen, type BrowserWindowConstructorOptions, type IpcMainEvent, type IpcMainInvokeEvent } from "electron";
import { SNAP_ZONES, WINDOW_METRICS, type DisplayInfo, type Rect, type SnapZone } from "@focus-notes/core/window-geometry";
import { CustomWindow, type PreviewLike } from "./custom-window.ts";
import { MacTitleBar } from "./mac-title-bar.ts";
import { initialPlacement, readWindowMemory, writeWindowMemory, type Placement } from "./placement.ts";

export type FrameKind = "custom" | "opaque";
const EDGES: readonly string[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];

/**
 * Windows and Linux get the app-built window. Where transparency isn't possible (a Linux desktop
 * without a compositor) `--opaque-window` gives the same window, square and without the shadow.
 */
export function frameKindFor(platform: "macos" | "windows" | "linux", argv: readonly string[], env: NodeJS.ProcessEnv): FrameKind | undefined {
  if (platform === "macos") return undefined;
  return argv.includes("--opaque-window") || env.FOCUS_NOTES_WINDOW === "opaque" ? "opaque" : "custom";
}

const displays = (): DisplayInfo[] => screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor }));
const primary = (): DisplayInfo => {
  const d = screen.getPrimaryDisplay();
  return { id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor };
};

/** The snap preview: a translucent accent rectangle in a window of its own that never takes the pointer or focus. */
function snapPreview(): PreviewLike & { destroy(): void } {
  let w: BrowserWindow | undefined;
  return {
    show(r: Rect, color: string) {
      if (!w || w.isDestroyed()) {
        // Nothing loads in it: its background is the rectangle.
        w = new BrowserWindow({
          show: false, frame: false, transparent: true, focusable: false, skipTaskbar: true, resizable: false, movable: false,
          minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false, backgroundColor: color,
          webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false, webSecurity: true, devTools: false },
        });
        w.setIgnoreMouseEvents(true);
      }
      w.setBackgroundColor(color);
      w.setBounds(r);
      if (!w.isVisible()) w.showInactive();
    },
    hide() {
      if (w && !w.isDestroyed()) w.hide();
    },
    destroy() {
      if (w && !w.isDestroyed()) w.destroy();
      w = undefined;
    },
  };
}

export class AppWindowFrame {
  readonly kind: FrameKind | undefined;
  readonly #file: string;
  readonly #placement: Placement;
  #custom: CustomWindow | undefined;
  #mac: MacTitleBar | undefined;
  #accent = "#2f6fed";

  constructor(kind: FrameKind | undefined, memoryFile: string) {
    this.kind = kind;
    this.#file = memoryFile;
    this.#placement = initialPlacement(readWindowMemory(memoryFile), displays(), primary());
  }

  /** Where the window opens, and how it's drawn. */
  options(): BrowserWindowConstructorOptions {
    const p = this.#placement;
    // macOS: the traffic lights sit in the 44 px title bar band (DSK-02).
    if (!this.kind) return { ...p.restore, titleBarStyle: "hiddenInset", trafficLightPosition: { x: WINDOW_METRICS.trafficLightX, y: WINDOW_METRICS.trafficLightY } };
    const outer = CustomWindow.outer(p, this.kind);
    return {
      ...outer,
      frame: false,
      ...(this.kind === "custom" ? { transparent: true, backgroundColor: "#00000000", hasShadow: false } : {}),
    };
  }

  /** The window's state for the page's first frame, so it's drawn right from the start. */
  query(): Record<string, string> {
    return this.#custom ? { window: JSON.stringify(this.#custom.report()) } : {};
  }

  /** The theme's accent, for the snap preview (`cmp.windowFrame.snapPreview`). */
  setAccent(color: unknown): void {
    if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) this.#accent = color;
  }
  #previewColor(): string {
    const alpha = Math.round(WINDOW_METRICS.snapPreviewOpacity * 255).toString(16).padStart(2, "0");
    return `#${alpha}${this.#accent.slice(1)}`;
  }

  attach(win: BrowserWindow): void {
    const p = this.#placement;
    if (!this.kind) {
      // macOS: the system's window, put back where it was.
      if (p.mode === "maximized") win.maximize();
      if (p.fullScreen) win.once("ready-to-show", () => win.setFullScreen(true));
      win.on("close", () => writeWindowMemory(this.#file, { version: 1, bounds: win.getNormalBounds(), ...(win.isMaximized() ? { maximized: true } : {}), ...(win.isFullScreen() ? { fullScreen: true } : {}) }));
      // Its traffic lights, hidden at rest (DD-DSK-04).
      const mac = new MacTitleBar(win, () => screen.getCursorScreenPoint());
      this.#mac = mac;
      const update = () => mac.update();
      win.on("show", update);
      win.on("focus", update);
      win.on("blur", update);
      win.on("enter-full-screen", update);
      win.on("leave-full-screen", update);
      win.on("closed", () => mac.stop());
      return;
    }
    const preview = snapPreview();
    const custom = new CustomWindow(win, {
      frame: this.kind,
      screen: { getAllDisplays: displays, getCursorScreenPoint: () => screen.getCursorScreenPoint() },
      preview: () => preview,
      previewColor: () => this.#previewColor(),
      notify: (r) => win.webContents.send("window:state", r),
      save: (m) => writeWindowMemory(this.#file, m),
    }, p);
    this.#custom = custom;
    if (p.fullScreen) win.once("ready-to-show", () => custom.toggleFullScreen());
    win.webContents.on("before-input-event", (e, input) => {
      if (custom.key(input)) return e.preventDefault();
      // Alt+Space opens the app's system menu; the system's can't maximize a transparent window (DSK-08).
      if (input.type === "keyDown" && input.alt && !input.control && !input.meta && !input.shift && (input.code === "Space" || input.key === " ")) {
        e.preventDefault();
        win.webContents.send("window:menu");
      }
    });
    const notify = () => custom.notify();
    win.on("focus", notify);
    win.on("blur", () => {
      custom.endKeyboard(true);
      notify();
    });
    // A system maximize (a shortcut, an older shell) becomes the app's own, which knows the work area.
    win.on("maximize", () => {
      if (custom.report().maximized) return;
      win.unmaximize();
      custom.maximize();
    });
    const changed = () => custom.displaysChanged();
    screen.on("display-added", changed);
    screen.on("display-removed", changed);
    screen.on("display-metrics-changed", changed);
    win.on("close", () => custom.save());
    win.on("closed", () => {
      custom.stop();
      preview.destroy();
      screen.off("display-added", changed);
      screen.off("display-removed", changed);
      screen.off("display-metrics-changed", changed);
    });
  }

  /** Once the caret is ready: the click-through margin's pointer checks never compete with the first frame (PRF-02). */
  ready(): void {
    this.#custom?.watchPointer();
    this.#mac?.watchPointer();
  }

  /** F11 in the app-built window, which keeps full screen itself. False where the system does it (macOS). */
  toggleFullScreen(): boolean {
    this.#custom?.toggleFullScreen();
    return Boolean(this.#custom);
  }

  /** The window channels, each checked to come from the app's own page. */
  registerIpc(fromApp: (e: IpcMainEvent | IpcMainInvokeEvent) => boolean, win: () => BrowserWindow | undefined): void {
    const on = (channel: string, fn: (...args: unknown[]) => void) =>
      ipcMain.on(channel, (e, ...args: unknown[]) => {
        if (fromApp(e) && this.#custom) fn(...args);
      });
    ipcMain.handle("window:state", (e) => (fromApp(e) ? this.#custom?.report() : undefined));
    // macOS: the traffic lights show while the toolbar is open, as the app-drawn controls do.
    ipcMain.on("window:reveal", (e, show: unknown) => {
      if (fromApp(e)) this.#mac?.reveal(show === true);
    });
    on("window:minimize", () => this.#custom?.minimize());
    on("window:maximize", () => this.#custom?.maximize());
    on("window:restore", () => this.#custom?.restore());
    on("window:close", () => win()?.close());
    on("window:snap", (zone) => {
      if ((SNAP_ZONES as readonly unknown[]).includes(zone)) this.#custom?.snap(zone as SnapZone);
    });
    on("window:drag", (phase, kind, x, y, shift) => {
      if ((phase !== "start" && phase !== "move" && phase !== "end") || (kind !== "move" && !EDGES.includes(kind as string))) return;
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return;
      this.#custom?.drag(phase, kind as Parameters<CustomWindow["drag"]>[1], Math.round(x), Math.round(y), shift === true);
    });
    on("window:keyboard", (mode) => {
      if (mode === "move" || mode === "size") this.#custom?.keyboard(mode);
    });
    // Keys of Move and Size that reached the page rather than the shell's own key handling.
    on("window:key", (key, fine) => {
      if (typeof key === "string" && /^(Arrow(Left|Right|Up|Down)|Enter|Escape)$/.test(key)) this.#custom?.key({ type: "keyDown", key, control: fine === true, alt: false, shift: false, meta: false });
    });
  }
}
