import { defineContract } from "../../contract.ts";

const sample = [{ type: "Surface", props: { variant: "frost", padding: "s", shape: "popover", elevation: "2" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] }];

export const contract = defineContract({
  type: "Positioner",
  tier: "layout",
  description: "Anchors floating content to a range in the note (the selection or a link): never covering it, kept on screen, and following it as it scrolls.",
  props: {
    anchor: { kind: "enum", values: ["selection", "link", "caret"], default: "selection", description: "The selection, a link, or the `/` the slash menu opened at." },
    placement: { kind: "enum", values: ["above", "below"], default: "above", description: "Above flips below near the top band; touch screens always use below." },
    align: { kind: "enum", values: ["center", "start"], default: "center", description: "Centered on the anchor, or lined up with its start." },
    offset: { kind: "token", group: "space", default: "s" },
    landmark: { kind: "enum", values: ["none", "region"], default: "none" },
    label: { kind: "message", requiredWhen: "landmark" },
  },
  events: {},
  slots: { default: { accepts: "any", max: 1 } },
  states: ["above", "below", "offscreen"],
  tokens: "cmp.positioner.*",
  a11y: { pattern: "none" },
  fixtures: [
    { name: "anchor selection, above", props: { anchor: "selection", placement: "above" }, children: sample },
    { name: "anchor link, below", props: { anchor: "link", placement: "below" }, children: sample },
    { name: "anchor caret, below, start", props: { anchor: "caret", placement: "below", align: "start" }, children: sample },
    { name: "align center", props: { align: "center" }, children: sample },
    { name: "landmark region", props: { landmark: "region", label: { t: "gallery.sample" } }, children: sample },
  ],
});
