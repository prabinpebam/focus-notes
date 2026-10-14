import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "WindowFrame",
  tier: "host",
  description: "The app-built window's behavior on Windows and Linux (D-14): moving by the title bar band (with double-click to maximize and right-click for the system menu), showing the window controls while the pointer is on the band (in full screen, once it reaches the top edge), the resize handles on every edge and corner, and the app-drawn system menu. The window's shape and shadow are AppRoot's `frame`.",
  props: {
    frame: { kind: "enum", values: ["native", "rounded", "square"], default: "native", description: "Native draws nothing. Rounded puts the handles in the shadow margin; square puts them just inside the edges." },
    resizable: { kind: "boolean", bindable: true, description: "Shows the resize handles: not while maximized or full screen." },
    fullScreen: { kind: "boolean", bindable: true, description: "Full screen (DSK-04): the title bar band and its window controls hide until the pointer reaches the top edge. Keyboard focus still shows the controls." },
    menu: { kind: "list", of: "menuSections", required: true, description: "The system menu: Restore, Move, Size, Minimize, Maximize, Snap left, Snap right, Close." },
    menuLabel: { kind: "message", required: true },
    menuRequest: { kind: "number", min: 0, description: "Each new value opens the system menu." },
    menuX: { kind: "number", description: "Where the menu opens, in the window; -1 opens it under the band's start (Alt+Space)." },
    menuY: { kind: "number" },
    keyboard: { kind: "enum", values: ["none", "move", "size"], default: "none", description: "The system menu's Move or Size is running: the arrow keys, Enter, and Esc go to it." },
  },
  events: {
    drag: { payload: { phase: "text", kind: "text", x: "number", y: "number", shift: "boolean" } },
    toggleMaximize: {},
    menu: { payload: { x: "number", y: "number" } },
    action: { payload: { id: "text" } },
    key: { payload: { key: "text", fine: "boolean" } },
  },
  slots: {},
  states: ["rest", "bandHover", "fullScreenHidden", "moving", "resizing", "menuOpen"],
  tokens: "cmp.windowFrame.*",
  a11y: { pattern: "menu (the system menu); the handles are pointer-only, with Move and Size in the menu for the keyboard", name: "menuLabel" },
  fixtures: [],
});
