import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "Toast",
  tier: "primitive",
  description: "A one-sentence confirmation with an optional action. Pauses while hovered or focused; Esc dismisses it.",
  props: {
    message: { kind: "text", required: true },
    tone: { kind: "enum", values: ["info", "error", "success", "warning", "progress"], default: "info" },
    sticky: { kind: "boolean", default: false, description: "Explicit must-read outcome: the host must retain it for an inventoried data-risk, recovery decision or operation control. Tone and optional actions never imply sticky." },
    actionLabel: { kind: "text" },
    actionPending: { kind: "boolean", default: false, description: "Only this recovery action is inert while it runs; the host pauses its remaining dismissal time until it settles." },
    dismissLabel: { kind: "message", required: true },
    focusRequest: { kind: "number", min: 0 },
  },
  events: { action: {}, dismiss: {}, pausedChange: { payload: { paused: "boolean" } }, wrapped: {} },
  slots: {},
  states: ["rest", "paused", "focusVisible"],
  tokens: "cmp.toast.*",
  a11y: { pattern: "status (errors: alert)", name: "message" },
  uncovered: { paused: "Pauses while the pointer or focus is on it: native journeys cover overlapping causes; a static fixture cannot.", focusVisible: GAP.focusVisible },
  fixtures: [
    ...["success", "warning", "progress"].map((tone) => ({ name: `tone ${tone}`, props: { message: { get: "vm.gallery.query" }, tone, dismissLabel: { t: "toast.dismiss" }, sticky: tone !== "success" } })),
    { name: "tone info", props: { message: { get: "vm.gallery.query" }, tone: "info", dismissLabel: { t: "toast.dismiss" } } },
    { name: "tone error with action", props: { message: { get: "vm.gallery.query" }, tone: "error", actionLabel: { get: "vm.gallery.query" }, dismissLabel: { t: "toast.dismiss" } } },
    { name: "pending recovery", props: { message: { get: "vm.gallery.query" }, tone: "error", actionLabel: { get: "vm.gallery.query" }, actionPending: true, dismissLabel: { t: "toast.dismiss" } } },
  ],
});
