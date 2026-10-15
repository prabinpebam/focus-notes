import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "CodeBlock",
  tier: "primitive",
  description: "Something to type or paste elsewhere, shown as itself (D-142): a command in a terminal, or a one-time code to enter on GitHub, in monospace with its own Copy. l: the code large, a step's focal point. Its label says where it goes, above it.",
  props: {
    value: { kind: "message", required: true, description: "The command or the code: data, read from a view model." },
    label: { kind: "message", description: "Where it goes, above it: Run this in a terminal, Enter this code on GitHub." },
    copyLabel: { kind: "message", required: true },
    size: { kind: "enum", values: ["m", "l"], default: "m", description: "m: a command; l: a one-time code." },
  },
  events: { copy: {} },
  slots: {},
  states: ["rest"],
  tokens: "cmp.codeBlock.*",
  a11y: { pattern: "group", name: "label" },
  fixtures: [
    { name: "size m", props: { value: { t: "gallery.sample" }, label: { t: "gallery.sample" }, copyLabel: { t: "gallery.action" } } },
    { name: "size l", props: { value: { t: "gallery.sample" }, label: { t: "gallery.sample" }, copyLabel: { t: "gallery.action" }, size: "l" } },
  ],
});
