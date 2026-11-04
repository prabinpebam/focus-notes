import { defineContract } from "../../contract.ts";

const sample = [{ type: "Surface", props: { variant: "frost", padding: "insetSm", shape: "popover", elevation: "2" }, children: [{ type: "Text", props: { value: { t: "gallery.sample" } } }] }];

export const contract = defineContract({
  type: "Positioner",
  tier: "layout",
  description: "Anchors floating content to a range in the note (the selection or a link): never covering it, kept on screen, and following it as it scrolls.",
  props: {
    anchor: { kind: "enum", values: ["selection", "link", "caret", "rewrite"], default: "selection", description: "The selection, a link, the slash menu caret, or Rewrite's retained selection fragments and viewport." },
    placement: { kind: "enum", values: ["above", "below"], default: "above", description: "Above flips below near the top band; touch screens always use below." },
    align: { kind: "enum", values: ["center", "start"], default: "center", description: "Centered on the anchor, or lined up with its start." },
    offset: { kind: "token", group: "space", default: "stackItem" },
    landmark: { kind: "enum", values: ["none", "region"], default: "none" },
    label: { kind: "message", requiredWhen: "landmark" },
    returnAboveLabel: { kind: "message", description: "Return to the selection above the viewport (Rewrite)." },
    returnBelowLabel: { kind: "message", description: "Return to the selection below the viewport (Rewrite)." },
    focusRequest: { kind: "number", description: "Each new value reveals Rewrite's retained fragment before its field receives focus." },
  },
  events: { dismiss: {} },
  slots: { default: { accepts: "any", max: 1 } },
  states: ["above", "below", "offscreen"],
  tokens: "cmp.positioner.*",
  a11y: { pattern: "none" },
  uncovered: { offscreen: "Needs an anchor measured outside the window: a static fixture can't place one, and no journey checks it yet." },
  fixtures: [
    { name: "anchor selection, above", covers: ["above"], props: { anchor: "selection", placement: "above" }, children: sample },
    { name: "anchor link, below", covers: ["below"], props: { anchor: "link", placement: "below" }, children: sample },
    { name: "anchor caret, below, start", props: { anchor: "caret", placement: "below", align: "start" }, children: sample },
    { name: "anchor rewrite, below, start", props: { anchor: "rewrite", placement: "below", align: "start" }, children: sample },
    { name: "align center", props: { align: "center" }, children: sample },
    { name: "landmark region", props: { landmark: "region", label: { t: "gallery.sample" } }, children: sample },
  ],
});
