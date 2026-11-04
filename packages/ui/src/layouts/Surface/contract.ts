import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Surface",
  tier: "layout",
  description: "A background, border, radius, and shadow. Frost works only inside a floating Layer.",
  props: {
    variant: { kind: "enum", values: ["canvas", "frost", "raised", "sunken", "inverted"], default: "raised" },
    shape: { kind: "enum", values: ["none", "window", "sheet", "popover", "control", "round"], default: "none" },
    elevation: { kind: "enum", values: ["0", "1", "2", "3"], default: "0" },
    padding: { kind: "token", group: "space", default: "none" },
    shortPadding: { kind: "token", group: "space", description: "The padding in a short window (below breakpoint.short): the full-window setup tightens up (D-131)." },
    scroll: { kind: "boolean", default: false, description: "What it holds scrolls inside its padding when the surface is held shorter than its content: a dialog in the middle of a short window (D-123)." },
    minimum: { kind: "enum", values: ["none", "component", "section", "view"], default: "none", description: "The wrapper's minimum block size, shared by populated, empty and loading content." },
    busy: { kind: "boolean", description: "This region is loading; its placeholders stay decorative." },
    label: { kind: "message", description: "Names a region when its content changes independently." },
    keyScope: { kind: "enum", values: ["none", "findBar", "findField", "replaceField", "pickerField", "formatToolbar", "linkEditor", "firstRun", "rewritePrompt"], default: "none", description: "Keys registered for this scope work while focus is inside." },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.surface.*",
  a11y: { pattern: "none" },
  fixtures: [
    { name: "loading section", props: { label: { t: "gallery.sample" }, busy: true, minimum: "section", padding: "m" }, children: [{ type: "Skeleton", props: { shape: "row" } }] },
    ...["component", "section", "view"].map((minimum) => ({ name: `minimum ${minimum}`, props: { minimum }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] })),
    { name: "scroll", props: { padding: "xl", shape: "popover", scroll: true }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    ...["canvas", "frost", "raised", "sunken", "inverted"].map((variant) => ({
      name: `variant ${variant}`, props: { variant, padding: "l", shape: "popover" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }],
    })),
    ...["none", "window", "sheet", "popover", "control", "round"].map((shape) => ({
      name: `shape ${shape}`, props: { shape, padding: "l" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }],
    })),
    ...["none", "findBar", "findField", "replaceField", "pickerField", "formatToolbar", "linkEditor", "firstRun", "rewritePrompt"].map((keyScope) => ({
      name: `keyScope ${keyScope}`, props: { keyScope, padding: "l", shape: "popover" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }],
    })),
    ...["0", "1", "2", "3"].map((elevation) => ({
      name: `elevation ${elevation}`, props: { elevation, padding: "l", shape: "popover" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }],
    })),
  ],
});
