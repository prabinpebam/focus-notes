import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "DatePicker",
  tier: "primitive",
  description: "A day, typed segment by segment or picked on a calendar that opens from its button (an audience's last day, D-143). Every part works from the keyboard and is named in the locale's words.",
  props: {
    label: { kind: "message", required: true },
    value: { kind: "text", bindable: true, description: "The day picked, YYYY-MM-DD, or empty." },
    min: { kind: "text", description: "The first day that can be picked, YYYY-MM-DD." },
    max: { kind: "text", description: "The last day that can be picked, YYYY-MM-DD (an audience's: a year from today)." },
    description: { kind: "message" },
    invalid: { kind: "boolean", default: false },
  },
  events: { change: { payload: { value: "text" }, binds: "value" } },
  slots: {},
  states: ["rest", "focused", "open", "invalid"],
  tokens: "cmp.datePicker.*",
  a11y: { pattern: "date picker (group of spin buttons, and a dialog with a grid)", name: "label" },
  uncovered: { focused: GAP.focused, open: GAP.open },
  fixtures: [
    { name: "empty", props: { label: { t: "gallery.sample" } } },
    { name: "with a description", props: { label: { t: "gallery.sample" }, description: { t: "gallery.sample" } } },
    { name: "invalid", covers: ["invalid"], props: { label: { t: "gallery.sample" }, invalid: true } },
  ],
});
