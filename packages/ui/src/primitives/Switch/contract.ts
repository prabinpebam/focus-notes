import { defineContract, GAP } from "../../contract.ts";

export const contract = defineContract({
  type: "Switch",
  tier: "primitive",
  description: "An on/off setting that takes effect as it changes (DSY-15): a track and thumb whose position, fill and On or Off word say the state. Not for a choice between named options (use SegmentedControl) or an action (use Button).",
  props: {
    label: { kind: "message", required: true, description: "The setting's name: Link, Passcode." },
    checked: { kind: "boolean", default: false, bindable: true },
    onLabel: { kind: "message", required: true, description: "The word beside the track when on: On." },
    offLabel: { kind: "message", required: true, description: "The word beside the track when off: Off." },
    description: { kind: "message", description: "One line under the name about what it does." },
    disabled: { kind: "boolean", default: false },
    disabledReason: { kind: "message", requiredWhen: "disabled", description: "Why it can't change now, shown in place of the description." },
  },
  events: { change: { payload: { value: "boolean" }, binds: "checked" } },
  slots: {},
  states: ["rest", "checked", "disabled", "hover", "focusVisible"],
  tokens: "cmp.switch.*",
  a11y: { pattern: "switch", name: "label" },
  uncovered: { hover: GAP.hover, focusVisible: GAP.focusVisible },
  fixtures: [
    { name: "off", props: { label: { t: "share.dialog.passcode" }, onLabel: { t: "switch.on" }, offLabel: { t: "switch.off" } } },
    { name: "on", covers: ["checked"], props: { label: { t: "share.dialog.link" }, checked: true, onLabel: { t: "switch.on" }, offLabel: { t: "switch.off" } } },
    { name: "with description", props: { label: { t: "share.dialog.later" }, description: { t: "share.dialog.link.detail" }, onLabel: { t: "switch.on" }, offLabel: { t: "switch.off" } } },
    { name: "disabled with reason", covers: ["disabled", "checked"], props: { label: { t: "share.dialog.link" }, checked: true, disabled: true, disabledReason: { t: "share.dialog.keepOne" }, onLabel: { t: "switch.on" }, offLabel: { t: "switch.off" } } },
  ],
});
