import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Text",
  tier: "primitive",
  description: "A run of interface text. Note text is never rendered with this; it lives in block components.",
  props: {
    value: { kind: "message", required: true },
    role: { kind: "enum", values: ["caption", "secondary", "body", "label", "emphasis", "title", "lead"], default: "body" },
    tone: { kind: "enum", values: ["default", "muted", "accent", "danger", "warning", "success"], default: "default" },
    lines: { kind: "enum", values: ["none", "one", "two", "three"], default: "none" },
    announce: { kind: "boolean", default: false, description: "A polite live region, for counts and results." },
    inset: { kind: "enum", values: ["none", "control"], default: "none", description: "control: inset like a small button's label, so a text that leads a row of buttons (the link card) lines up with them (D-111)." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.text.*",
  a11y: { pattern: "text" },
  fixtures: [
    ...["caption", "secondary", "body", "label", "emphasis", "title", "lead"].map((role) => ({ name: `role ${role}`, props: { value: { t: "gallery.sample" }, role } })),
    ...["default", "muted", "accent", "danger", "warning", "success"].map((tone) => ({ name: `tone ${tone}`, props: { value: { t: "gallery.sample" }, tone } })),
    ...["none", "one", "two", "three"].map((lines) => ({ name: `lines ${lines}`, props: { value: { t: "gallery.long" }, lines } })),
    ...["none", "control"].map((inset) => ({ name: `inset ${inset}`, props: { value: { t: "gallery.sample" }, inset } })),
  ],
});
