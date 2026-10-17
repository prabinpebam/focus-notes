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
    pinned: { kind: "boolean", default: false, description: "Pinned open (D-161): a click on the canvas doesn't close it." },
    docked: { kind: "boolean", default: false, description: "Docked (D-187): flush to the window's edge below the title band and to its bottom, opaque, a hairline on its inner side, the note's area beside it; resizable from its inner edge." },
    dockWidth: { kind: "number", default: 0, description: "Its docked width in px, as the person resized it; 0: the token's default (cmp.sheet.dock.width)." },
    resizeLabel: { kind: "message", description: "The resize handle's name, \"Resize Files\"." },
  },
  events: { close: {}, resize: { payload: { width: "number" } } },
  slots: { band: { accepts: "any" }, header: { accepts: "any" }, default: { accepts: "any" }, footer: { accepts: "any" } },
  states: ["rest", "entering", "pinned", "docked"],
  tokens: "cmp.sheet.*",
  a11y: { pattern: "complementary landmark", name: "label" },
  fixtures: [
    { name: "start, files width", props: { label: { t: "files.heading" }, side: "start", width: "files", keyScope: "files" }, slots: { header: [{ type: "Heading", props: { level: "2", value: { t: "files.heading" } } }], footer: [{ type: "Button", props: { label: { t: "deleted.footer" }, variant: "subtle", icon: "history" } }] }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "end, theme width", props: { label: { t: "gallery.sample" }, side: "end", width: "theme", keyScope: "none" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] },
    { name: "end, find width", props: { label: { t: "findAll.title" }, side: "end", width: "find", keyScope: "findAll" }, slots: { header: [{ type: "Heading", props: { level: "2", value: { t: "findAll.title" } } }] }, children: [{ type: "ResultList", props: { label: { t: "findAll.results" }, items: { get: "vm.gallery.matches" }, height: "fill" } }] },
    { name: "start, docked", props: { label: { t: "files.heading" }, side: "start", width: "files", keyScope: "files", pinned: true, docked: true, dockWidth: 0, resizeLabel: { t: "files.resize" } }, slots: { band: [{ type: "Inline", props: { justify: "between", gap: "s", grow: true }, children: [{ type: "Inline", props: { gap: "s", grow: true }, children: [{ type: "Icon", props: { name: "github" } }, { type: "Text", props: { value: { t: "gallery.sample" }, role: "emphasis", lines: "one" } }] }, { type: "IconButton", props: { icon: "open", label: { t: "command.files.revealFolder" }, tone: "muted", bleed: true } }] }], header: [{ type: "Heading", props: { level: "2", value: { t: "files.heading" } } }] }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
  ],
});
