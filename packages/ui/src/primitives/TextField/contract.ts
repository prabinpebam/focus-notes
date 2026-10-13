import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "TextField",
  tier: "primitive",
  description: "A labelled single-line field, with an optional description. Secrets use type password.",
  props: {
    label: { kind: "message", required: true },
    value: { kind: "text", bindable: true },
    placeholder: { kind: "message" },
    description: { kind: "message" },
    type: { kind: "enum", values: ["text", "password", "url"], default: "text" },
    invalid: { kind: "boolean", default: false },
    autoFocus: { kind: "boolean", default: false },
    focusRequest: { kind: "number", min: 0 },
  },
  events: { change: { payload: { value: "text" }, binds: "value" } },
  slots: {},
  states: ["rest", "focused", "invalid"],
  tokens: "cmp.textField.*",
  a11y: { pattern: "text box", name: "label" },
  fixtures: [
    { name: "type text", props: { label: { t: "connect.repoLabel" }, type: "text", description: { t: "connect.repoHelp" } } },
    { name: "type password", props: { label: { t: "connect.tokenLabel" }, type: "password" } },
    { name: "type url", props: { label: { t: "connect.repoLabel" }, type: "url" } },
    { name: "invalid", props: { label: { t: "connect.repoLabel" }, invalid: true } },
  ],
});
