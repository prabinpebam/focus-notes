import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "IconButton",
  tier: "primitive",
  description: "An icon-only action with a required label, shown as its tooltip and accessible name.",
  props: {
    icon: { kind: "icon", required: true },
    label: { kind: "message", required: true },
    shortcut: { kind: "text" },
    tone: { kind: "enum", values: ["default", "muted"], default: "default" },
    toggle: { kind: "boolean", default: false },
    pressed: { kind: "boolean", default: false },
    disabled: { kind: "boolean", default: false },
    disabledReason: { kind: "message", requiredWhen: "disabled" },
    busy: { kind: "boolean", default: false },
    busyLabel: { kind: "text" },
  },
  events: { press: {} },
  slots: {},
  states: ["rest", "hover", "pressed", "selected", "focusVisible", "disabled", "busy"],
  tokens: "cmp.iconButton.*",
  a11y: { pattern: "button", name: "label" },
  fixtures: [
    { name: "tone default", props: { icon: "open", label: { t: "gallery.action" } } },
    { name: "tone muted", props: { icon: "more", label: { t: "gallery.action" }, tone: "muted" } },
    { name: "toggle off", props: { icon: "focus", label: { t: "gallery.action" }, toggle: true, pressed: false } },
    { name: "toggle on", props: { icon: "focus", label: { t: "gallery.action" }, toggle: true, pressed: true } },
    { name: "busy", props: { icon: "save", label: { t: "gallery.action" }, busy: true, busyLabel: { get: "vm.gallery.query" } } },
    { name: "disabled with reason", props: { icon: "save", label: { t: "gallery.action" }, disabled: true, disabledReason: { t: "gallery.reason" } } },
  ],
});
