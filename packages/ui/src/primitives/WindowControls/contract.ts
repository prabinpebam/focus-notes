import { defineContract } from "../../contract.ts";

const labels = {
  label: { t: "window.controls" }, minimizeLabel: { t: "window.minimize" }, maximizeLabel: { t: "window.maximize" },
  restoreLabel: { t: "window.restore" }, closeLabel: { t: "window.close" }, layoutsLabel: { t: "window.layouts" },
  layouts: { get: "vm.gallery.snapLayouts" },
};

export const contract = defineContract({
  type: "WindowControls",
  tier: "primitive",
  description: "The app-drawn minimize, maximize or restore, and close buttons of the Windows and Linux window (D-15), shown on hover, keyboard focus, or while the window isn't active, with the Snap Layouts picker on the maximize button.",
  props: {
    label: { kind: "message", required: true },
    minimizeLabel: { kind: "message", required: true },
    maximizeLabel: { kind: "message", required: true },
    restoreLabel: { kind: "message", required: true },
    closeLabel: { kind: "message", required: true },
    layoutsLabel: { kind: "message", required: true, description: "The Snap Layouts picker's name." },
    maximized: { kind: "boolean", bindable: true, description: "Shows Restore instead of Maximize." },
    reveal: { kind: "boolean", bindable: true, description: "Shows the buttons without hover: the window isn't active, or the toolbar is open." },
    layouts: { kind: "list", of: "menuSections", required: true, description: "The picker's layouts (halves, thirds, quarters, maximize) and their zones, each a command." },
  },
  events: { action: { payload: { id: "text" } }, dismiss: {} },
  slots: {},
  states: ["hidden", "shown", "buttonHover", "closeHover", "focusVisible", "layoutsOpen", "zoneHover"],
  tokens: "cmp.windowControls.*",
  a11y: { pattern: "group of buttons; the picker is a non-modal dialog of zone buttons", name: "label" },
  fixtures: [
    { name: "shown", props: { ...labels, reveal: true } },
    { name: "maximized", props: { ...labels, reveal: true, maximized: true } },
    { name: "hidden until hover", props: { ...labels } },
  ],
});
