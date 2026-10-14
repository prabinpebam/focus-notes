import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "DialogPanel",
  tier: "primitive",
  description: "The modal surface behind every dialog: scrim, raised or frosted panel, a title row, fixed controls, a scrolling body, and a footer.",
  props: {
    label: { kind: "message", required: true },
    open: { kind: "boolean", default: false },
    size: { kind: "enum", values: ["s", "m", "l", "xl"], default: "l", description: "m is Spotlight's 640 px." },
    placement: { kind: "enum", values: ["center", "top"], default: "center", description: "top: about 20% down, as Spotlight opens." },
    material: { kind: "enum", values: ["raised", "frosted"], default: "raised", description: "frosted: the theme's frosted surface (Spotlight)." },
  },
  events: { openChange: { payload: { open: "boolean" } } },
  slots: { header: { accepts: "any", max: 1 }, fixed: { accepts: "any", max: 1 }, default: { accepts: "any" }, footer: { accepts: "any", max: 1 } },
  states: ["open", "entering", "exiting"],
  tokens: "cmp.dialogPanel.*",
  a11y: { pattern: "modal dialog", name: "label" },
  fixtures: [
    { name: "size s", props: { label: { t: "shortcuts.title" }, open: true, size: "s" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "size l", props: { label: { t: "shortcuts.title" }, open: true, size: "l" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "size xl", props: { label: { t: "shortcuts.title" }, open: true, size: "xl" }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    {
      name: "size m, top, frosted, with footer",
      props: { label: { t: "spotlight.dialog" }, open: true, size: "m", placement: "top", material: "frosted" },
      slots: { footer: [{ type: "Text", props: { value: { t: "spotlight.helpHint" }, role: "caption", tone: "muted" } }] },
      children: [{ type: "Text", props: { value: { t: "gallery.long" } } }],
    },
  ],
});
