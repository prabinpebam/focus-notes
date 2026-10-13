import { defineContract } from "../../contract.ts";

const variants = ["primary", "secondary", "subtle", "danger"] as const;

export const contract = defineContract({
  type: "Button",
  tier: "primitive",
  description: "A labelled action. Its label says what it does.",
  props: {
    label: { kind: "message", required: true },
    variant: { kind: "enum", values: variants, default: "secondary" },
    size: { kind: "enum", values: ["s", "m"], default: "m" },
    icon: { kind: "icon" },
    iconPosition: { kind: "enum", values: ["start", "end"], default: "start" },
    toggle: { kind: "boolean", default: false },
    pressed: { kind: "boolean", default: false },
    busy: { kind: "boolean", default: false },
    disabled: { kind: "boolean", default: false },
    disabledReason: { kind: "message", requiredWhen: "disabled" },
  },
  events: { press: {} },
  slots: {},
  states: ["rest", "hover", "pressed", "selected", "focusVisible", "disabled", "busy"],
  tokens: "cmp.button.*",
  a11y: { pattern: "button", name: "label" },
  fixtures: [
    ...variants.map((variant) => ({ name: `variant ${variant}`, props: { label: { t: "gallery.action" }, variant } })),
    { name: "size s", props: { label: { t: "gallery.action" }, size: "s" } },
    { name: "size m with icon", props: { label: { t: "gallery.action" }, size: "m", icon: "save" } },
    { name: "icon at end", props: { label: { t: "gallery.action" }, icon: "chevronRight", iconPosition: "end" } },
    { name: "busy", props: { label: { t: "gallery.action" }, busy: true } },
    { name: "toggle off", props: { label: { t: "gallery.action" }, variant: "subtle", icon: "link", toggle: true, pressed: false } },
    { name: "toggle on", props: { label: { t: "gallery.action" }, variant: "subtle", icon: "link", toggle: true, pressed: true } },
    { name: "disabled with reason", props: { label: { t: "gallery.action" }, disabled: true, disabledReason: { t: "gallery.reason" } } },
  ],
});
