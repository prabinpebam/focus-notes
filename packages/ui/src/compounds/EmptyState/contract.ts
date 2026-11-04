import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "EmptyState", tier: "compound",
  description: "A known-empty wrapper, not loading or failure. Says why and offers the first action; good news may simply say all done. The same minimum size holds the layout.",
  props: {
    title: { kind: "message", required: true }, detail: { kind: "message" }, icon: { kind: "icon", default: "folder" },
    size: { kind: "enum", values: ["component", "section", "view"], default: "section" },
    tone: { kind: "enum", values: ["neutral", "good"], default: "neutral" }, actionLabel: { kind: "message" },
  },
  events: { action: {} }, slots: {}, states: ["rest"], tokens: "cmp.emptyState.*",
  a11y: { pattern: "text and optional button", name: "title" },
  fixtures: [
    ...["component", "section", "view"].map((size) => ({ name: `size ${size}`, props: { title: { t: "gallery.sample" }, detail: { t: "gallery.sample" }, size, actionLabel: { t: "gallery.action" } } })),
    { name: "all done", props: { title: { t: "gallery.sample" }, tone: "good", icon: "check" } },
  ],
});
