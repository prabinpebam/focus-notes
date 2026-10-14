import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Sheet",
  tier: "layout",
  description: "A side sheet over the canvas (Files on the left, Theme and Find in all notes on the right). Not modal; closes on Esc or a click on the canvas.",
  props: {
    label: { kind: "message", required: true },
    side: { kind: "enum", values: ["start", "end"], default: "start" },
    width: { kind: "enum", values: ["files", "theme", "find"], default: "files", description: "A layout.sheet* token." },
    keyScope: { kind: "enum", values: ["none", "files", "findAll"], default: "none", description: "Keys registered for this scope work while focus is inside." },
  },
  events: { close: {} },
  slots: { header: { accepts: "any" }, default: { accepts: "any" }, footer: { accepts: "any" } },
  states: ["rest", "entering"],
  tokens: "cmp.sheet.*",
  a11y: { pattern: "complementary landmark", name: "label" },
  fixtures: [
    { name: "start, files width", props: { label: { t: "files.heading" }, side: "start", width: "files", keyScope: "files" }, slots: { header: [{ type: "Heading", props: { level: "2", value: { t: "files.heading" } } }], footer: [{ type: "Button", props: { label: { t: "deleted.footer" }, variant: "subtle", icon: "history" } }] }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "end, theme width", props: { label: { t: "gallery.sample" }, side: "end", width: "theme", keyScope: "none" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
    { name: "end, find width", props: { label: { t: "findAll.title" }, side: "end", width: "find", keyScope: "findAll" }, slots: { header: [{ type: "Heading", props: { level: "2", value: { t: "findAll.title" } } }] }, children: [{ type: "ResultList", props: { label: { t: "findAll.results" }, items: { get: "vm.gallery.matches" }, height: "fill" } }] },
  ],
});
