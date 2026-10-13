import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "MorphPanel",
  tier: "primitive",
  description: "A trigger that morphs into its panel: the circle grows into the panel's shape, and the content fades in after it.",
  props: {
    label: { kind: "message", required: true },
    open: { kind: "boolean", default: false },
  },
  events: { openChange: { payload: { open: "boolean" } } },
  slots: { trigger: { accepts: "any", min: 1, max: 1 }, content: { accepts: "any", min: 1, max: 1 } },
  states: ["closed", "opening", "open", "closing"],
  tokens: "cmp.morphPanel.*",
  a11y: { pattern: "dialog (non-modal), opened by its trigger", name: "label" },
  fixtures: [
    { name: "closed", props: { label: { t: "toolbar.label" }, open: false }, slots: { trigger: [{ type: "TriggerButton", props: { label: { t: "trigger.label" } } }], content: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] } },
    { name: "open", props: { label: { t: "toolbar.label" }, open: true }, slots: { trigger: [{ type: "TriggerButton", props: { label: { t: "trigger.label" } } }], content: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] } },
  ],
});
