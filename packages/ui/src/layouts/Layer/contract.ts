import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Layer",
  tier: "layout",
  description: "Places content on a layer (trigger, panel, dialog, toast, tooltip) at a fixed position.",
  props: {
    layer: { kind: "enum", values: ["contextual", "trigger", "panel", "dialog", "toast", "tooltip"], default: "panel" },
    position: { kind: "enum", values: ["topBand", "belowTopBand", "fill", "center", "bottomCenter"], default: "center" },
    dragBand: { kind: "boolean", default: false },
    landmark: { kind: "enum", values: ["none", "banner", "complementary", "region"], default: "none" },
    label: { kind: "message", requiredWhen: "landmark" },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "layer.*",
  a11y: { pattern: "none" },
  fixtures: [
    ...["contextual", "trigger", "panel", "dialog", "toast", "tooltip"].map((layer) => ({
      name: `layer ${layer}`, props: { layer, position: "center" }, children: [{ type: "Surface", props: { variant: "frost", padding: "m", shape: "popover" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] }],
    })),
    ...["topBand", "belowTopBand", "fill", "center", "bottomCenter"].map((position) => ({
      name: `position ${position}`, props: { position }, children: [{ type: "Surface", props: { variant: "frost", padding: "m", shape: "popover" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] }],
    })),
    ...["none", "banner", "complementary", "region"].map((landmark) => ({
      name: `landmark ${landmark}`, props: { landmark, label: { t: "gallery.sample" } }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }],
    })),
  ],
});
