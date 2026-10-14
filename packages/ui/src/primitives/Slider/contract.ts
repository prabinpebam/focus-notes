import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Slider",
  tier: "primitive",
  description: "A labelled slider for a number on steps, showing its value in words (Theme manager → Reading).",
  props: {
    label: { kind: "message", required: true },
    value: { kind: "number", bindable: true },
    min: { kind: "number", required: true },
    max: { kind: "number", required: true },
    step: { kind: "number", required: true },
    valueText: { kind: "text", description: "The value as shown: \"60 characters\"." },
    format: { kind: "enum", values: ["number", "percent"], default: "number", description: "How the value is spoken: a number, or a percentage of 1." },
  },
  events: { change: { payload: { value: "number" }, binds: "value" } },
  slots: {},
  states: ["rest", "hover", "dragging", "focusVisible"],
  tokens: "cmp.slider.*",
  a11y: { pattern: "slider", name: "label" },
  fixtures: [
    { name: "at the middle", props: { label: { t: "reading.measure" }, value: 75, min: 50, max: 100, step: 5, valueText: { get: "vm.gallery.query" } } },
    { name: "at the start", props: { label: { t: "reading.lineHeight" }, value: 1.3, min: 1.3, max: 2, step: 0.1 } },
    { name: "format percent", props: { label: { t: "reading.focusDim" }, value: 0.3, min: 0.15, max: 0.6, step: 0.05, format: "percent" } },
  ],
});
