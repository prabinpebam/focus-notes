/**
 * The app-built window on Windows and Linux (DSK-01, DSK-03, DSK-08, D-14): the window's state as
 * the shell reports it, the window commands, the system menu, and the Snap Layouts picker. On macOS
 * and in the browser the window is the system's own: there's no window bridge, so the frame stays
 * native and the commands are unavailable.
 */
import type { AppState } from "./app.ts";
import type { PlatformBridge } from "./bridge.ts";
import type { CommandRegistry } from "./commands.ts";
import type { MessageCatalog } from "./messages.ts";
import type { Store } from "./store.ts";
import type { ViewModelRegistry } from "./view-models.ts";
import { SNAP_LAYOUTS, type ResizeEdge, type SnapLayout, type SnapZone } from "./window-geometry.ts";

/** What the shell reports about the window it manages for the app. */
export interface WindowReport {
  /** "custom": transparent, with 20 px corners and a drawn shadow. "opaque": square, where transparency isn't possible (Linux without a compositor). */
  frame: "custom" | "opaque";
  maximized: boolean;
  /** Snapped to a half, third, or quarter of the display. */
  snapped: boolean;
  fullScreen: boolean;
  /** The window has focus. Its controls show while it doesn't. */
  active: boolean;
  /** The Snap Layouts picker's layouts on the window's display: thirds only on wide ones. */
  layouts: SnapLayout[];
  /** The system menu's Move or Size is running: the arrow keys move or resize the window. */
  keyboard?: "move" | "size";
}

/** The desktop shell's window, on Windows and Linux. Coordinates are screen DIP. */
export interface WindowBridge {
  /** The state when the page loaded, so the first frame is already drawn right. */
  initial?: WindowReport;
  state(): Promise<WindowReport>;
  onState(listener: (r: WindowReport) => void): () => void;
  /** The system menu key (Alt+Space), which the shell catches before the system does. */
  onMenu(listener: () => void): () => void;
  minimize(): void;
  maximize(): void;
  restore(): void;
  close(): void;
  snap(zone: SnapZone): void;
  /** A move (the title bar band) or a resize (an edge or corner) the window frame is handling. Shift keeps the proportions. */
  drag(phase: "start" | "move" | "end", kind: "move" | ResizeEdge, x: number, y: number, shift: boolean): void;
  /** The system menu's Move or Size: the arrow keys move or resize the window until Enter or Esc. */
  keyboard(mode: "move" | "size"): void;
  /** A key while Move or Size runs, when the page has it (the shell usually catches them first). Ctrl moves by one pixel. */
  key(key: string, fine: boolean): void;
}

export interface WindowState extends Omit<WindowReport, "frame"> {
  frame: "native" | WindowReport["frame"];
  /** Bumped to open the system menu, at the pointer or (-1) under the band's start. */
  menu: number;
  menuAt: { x: number; y: number };
}
export const NATIVE_WINDOW: WindowState = {
  frame: "native", maximized: false, snapped: false, fullScreen: false, active: true, layouts: [], menu: 0, menuAt: { x: -1, y: -1 },
};

const ZONE_COMMANDS: Record<SnapZone, string> = {
  maximize: "window.maximize", left: "window.snap.left", right: "window.snap.right", topLeft: "window.snap.topLeft",
  topRight: "window.snap.topRight", bottomLeft: "window.snap.bottomLeft", bottomRight: "window.snap.bottomRight",
  leftThird: "window.snap.leftThird", centerThird: "window.snap.centerThird", rightThird: "window.snap.rightThird",
};
const EDGES: readonly string[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
/** The system menu, in Windows' order (DSK-08). */
const SYSTEM_MENU = [
  ["window.restore", "window.move", "window.size", "window.minimize", "window.maximize"],
  ["window.snap.left", "window.snap.right"],
  ["window.close"],
];

interface Ctx {
  store: Store<AppState>;
  commands: CommandRegistry<AppState>;
  viewModels: ViewModelRegistry<AppState>;
  catalog: MessageCatalog;
  bridge: PlatformBridge;
}

export const initialWindow = (bridge: PlatformBridge): WindowState => (bridge.window?.initial ? { ...NATIVE_WINDOW, ...bridge.window.initial } : NATIVE_WINDOW);

export function registerWindow({ store, commands, viewModels, catalog, bridge }: Ctx) {
  const win = bridge.window;
  const custom = (s: AppState) => Boolean(win) && s.window.frame !== "native";
  const free = (s: AppState) => custom(s) && !s.window.fullScreen;
  const apply = (r: WindowReport) => store.update((s) => {
    const { keyboard: _k, ...rest } = s.window;
    return { ...s, window: { ...rest, ...r } };
  });
  const openMenu = (x = -1, y = -1) => store.update((s) => ({ ...s, window: { ...s.window, menu: s.window.menu + 1, menuAt: { x, y } } }));

  const cmd = (id: string, enabled: (s: AppState) => boolean, run: (args: Record<string, unknown>) => void) =>
    commands.register({ id, title: `command.${id}`, enabled, run: (args) => run(args) });
  cmd("window.minimize", custom, () => win?.minimize());
  cmd("window.maximize", (s) => free(s) && !s.window.maximized, () => win?.maximize());
  cmd("window.restore", (s) => free(s) && (s.window.maximized || s.window.snapped), () => win?.restore());
  cmd("window.toggleMaximize", free, () => (store.state.window.maximized ? win?.restore() : win?.maximize()));
  cmd("window.close", custom, () => win?.close());
  cmd("window.move", (s) => free(s) && !s.window.maximized, () => win?.keyboard("move"));
  cmd("window.size", (s) => free(s) && !s.window.maximized, () => win?.keyboard("size"));
  cmd("window.key", (s) => custom(s) && Boolean(s.window.keyboard), ({ key, fine }) => {
    if (typeof key === "string" && /^(Arrow(Left|Right|Up|Down)|Enter|Escape)$/.test(key)) win?.key(key, fine === true);
  });
  cmd("window.systemMenu", custom, ({ x, y }) => openMenu(typeof x === "number" ? Math.round(x) : -1, typeof y === "number" ? Math.round(y) : -1));
  for (const [zone, id] of Object.entries(ZONE_COMMANDS)) if (zone !== "maximize") cmd(id, free, () => win?.snap(zone as SnapZone));
  // The window frame's own moves and resizes, as it handles them (Window management → Move, Resize).
  cmd("window.drag", free, ({ phase, kind, x, y, shift }) => {
    if ((phase !== "start" && phase !== "move" && phase !== "end") || (kind !== "move" && !EDGES.includes(String(kind)))) return;
    if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return;
    win?.drag(phase, kind as "move" | ResizeEdge, Math.round(x), Math.round(y), shift === true);
  });

  // The system menu's items use Windows' short words (Restore, Move, Size); Spotlight uses the commands' names.
  const item = (id: string) => ({
    id,
    label: catalog.format(`window.menuItem.${id.slice("window.".length)}`),
    // Closing is the system's own key, on Windows and on most Linux desktops.
    ...(id === "window.close" ? { shortcut: "Alt+F4" } : {}),
    ...(commands.describe(id).enabled ? {} : { disabled: true }),
  });
  const ITEM = { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, shortcut: { type: "string" as const }, disabled: { type: "boolean" as const } } };
  const SECTIONS = { type: "array" as const, items: { type: "object" as const, properties: { id: { type: "string" as const }, label: { type: "string" as const }, items: { type: "array" as const, items: ITEM } } } };
  viewModels.register({
    id: "vm.window",
    reads: ["window", "ui.toolbarOpen"],
    schema: {
      type: "object",
      properties: {
        custom: { type: "boolean", description: "The app draws and manages the window (Windows and Linux)." },
        frame: { type: "string", enum: ["native", "rounded", "square"], description: "Rounded (20 px, with the shadow margin) at rest; square when maximized, snapped, full screen, or opaque." },
        resizable: { type: "boolean" },
        maximized: { type: "boolean" },
        reveal: { type: "boolean", description: "Show the window controls without hover: the window isn't active, or the toolbar is open." },
        menu: SECTIONS,
        menuRequest: { type: "number" },
        menuX: { type: "number" },
        menuY: { type: "number" },
        keyboard: { type: "string", enum: ["none", "move", "size"], description: "The system menu's Move or Size is taking the arrow keys." },
        layouts: SECTIONS,
      },
    },
    select: (s) => {
      const w = s.window;
      const isCustom = custom(s);
      return {
        custom: isCustom,
        frame: !isCustom ? "native" : w.frame === "custom" && !w.maximized && !w.snapped && !w.fullScreen ? "rounded" : "square",
        resizable: isCustom && !w.maximized && !w.fullScreen,
        maximized: w.maximized,
        reveal: !w.active || s.ui.toolbarOpen,
        menu: isCustom ? SYSTEM_MENU.map((ids, i) => ({ id: `window${i}`, items: ids.map(item) })) : [],
        menuRequest: w.menu,
        menuX: w.menuAt.x,
        menuY: w.menuAt.y,
        keyboard: w.keyboard ?? "none",
        layouts: w.layouts.map((l) => ({
          id: l,
          label: catalog.format(`window.layout.${l}`),
          items: SNAP_LAYOUTS[l].map((z) => ({ id: ZONE_COMMANDS[z], label: catalog.format(`window.zone.${z}`) })),
        })),
      };
    },
  });

  return {
    start() {
      if (!win) return;
      win.onState(apply);
      win.onMenu(() => openMenu());
      void win.state().then(apply, () => {});
    },
  };
}
