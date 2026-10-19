import { defineContract, GAP } from "../../contract.ts";

const variants = ["primary", "secondary", "subtle", "danger"] as const;

export const contract = defineContract({
  type: "Button",
  tier: "primitive",
  description: "A labelled action. Its label says what it does.",
  props: {
    label: { kind: "message", required: true },
    variant: { kind: "enum", values: variants, default: "secondary" },
    size: { kind: "enum", values: ["s", "m", "l"], default: "m", description: "l: an onboarding step's main action (Get started, D-126)." },
    icon: { kind: "icon" },
    iconPosition: { kind: "enum", values: ["start", "end"], default: "start" },
    toggle: { kind: "boolean", default: false },
    pressed: { kind: "boolean", default: false },
    expanded: { kind: "boolean", description: "A disclosure button (More options, Having trouble?): whether what it shows is open (aria-expanded)." },
    busy: { kind: "boolean", default: false, description: "A wait it started (Waits, D-199): inert at once; after wait.signDelay a Spinner replaces its icon." },
    busyLabel: { kind: "text", description: "Its words while the wait shows (\"Signing out…\"), and the task tracker's done words after it." },
    disabled: { kind: "boolean", default: false },
    disabledReason: { kind: "message", requiredWhen: "disabled" },
    bleed: { kind: "boolean", default: false, description: "A subtle button at the start of the content (a first-run step's Back): its label lines up with the content's edge, and its hit area reaches into the padding (D-111)." },
    autoFocus: { kind: "boolean", default: false, description: "Takes focus when it appears: in a confirmation, the choice that changes nothing (APG alert dialog); in the first run, a step's primary action, so Enter continues." },
  },
  events: { press: {} },
  slots: {},
  states: ["rest", "hover", "pressed", "selected", "focusVisible", "disabled", "busy"],
  tokens: "cmp.button.*",
  a11y: { pattern: "button", name: "label" },
  uncovered: { hover: GAP.hover, pressed: GAP.pressed, focusVisible: GAP.focusVisible },
  fixtures: [
    ...variants.map((variant) => ({ name: `variant ${variant}`, props: { label: { t: "gallery.action" }, variant } })),
    { name: "size s", props: { label: { t: "gallery.action" }, size: "s" } },
    { name: "size l", props: { label: { t: "gallery.action" }, size: "l", variant: "primary" } },
    { name: "bleed", props: { label: { t: "gallery.action" }, variant: "subtle", bleed: true } },
    { name: "size m with icon", props: { label: { t: "gallery.action" }, size: "m", icon: "save" } },
    { name: "icon at end", props: { label: { t: "gallery.action" }, icon: "chevronRight", iconPosition: "end" } },
    { name: "busy", covers: ["busy"], props: { label: { t: "gallery.action" }, busy: true } },
    { name: "busy with icon and words", covers: ["busy"], props: { label: { t: "gallery.action" }, icon: "save", busy: true, busyLabel: { get: "vm.gallery.query" } } },
    { name: "toggle off", props: { label: { t: "gallery.action" }, variant: "subtle", icon: "link", toggle: true, pressed: false } },
    { name: "toggle on", covers: ["selected"], props: { label: { t: "gallery.action" }, variant: "subtle", icon: "link", toggle: true, pressed: true } },
    { name: "disabled with reason", covers: ["disabled"], props: { label: { t: "gallery.action" }, disabled: true, disabledReason: { t: "gallery.reason" } } },
  ],
});
