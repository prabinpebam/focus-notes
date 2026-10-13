import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Toast",
  tier: "primitive",
  description: "A one-sentence confirmation with an optional action. Pauses while hovered or focused; Esc dismisses it.",
  props: {
    message: { kind: "text", required: true },
    tone: { kind: "enum", values: ["info", "error"], default: "info" },
    actionLabel: { kind: "text" },
    dismissLabel: { kind: "message", required: true },
    focusRequest: { kind: "number", min: 0 },
  },
  events: { action: {}, dismiss: {}, pausedChange: { payload: { paused: "boolean" } } },
  slots: {},
  states: ["rest", "paused", "focusVisible"],
  tokens: "cmp.toast.*",
  a11y: { pattern: "status (errors: alert)", name: "message" },
  fixtures: [
    { name: "tone info", props: { message: { get: "vm.gallery.query" }, tone: "info", dismissLabel: { t: "toast.dismiss" } } },
    { name: "tone error with action", props: { message: { get: "vm.gallery.query" }, tone: "error", actionLabel: { get: "vm.gallery.query" }, dismissLabel: { t: "toast.dismiss" } } },
  ],
});
