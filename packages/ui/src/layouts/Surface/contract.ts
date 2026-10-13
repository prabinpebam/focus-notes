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
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.surface.*",
  a11y: { pattern: "none" },
  fixtures: [
    ...["canvas", "frost", "raised", "sunken", "inverted"].map((variant) => ({
      name: `variant ${variant}`, props: { variant, padding: "l", shape: "popover" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }],
    })),
    ...["none", "window", "sheet", "popover", "control", "round"].map((shape) => ({
      name: `shape ${shape}`, props: { shape, padding: "l" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }],
    })),
    ...["0", "1", "2", "3"].map((elevation) => ({
      name: `elevation ${elevation}`, props: { elevation, padding: "l", shape: "popover" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }],
    })),
  ],
});
