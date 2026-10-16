import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "BlockHandle",
  tier: "host",
  description: "The block handle drawn in the gutter beside the hovered block, from the editor's geometry: a grip that opens the block menu and drags the block between blocks, with a drop line.",
  props: {
    label: { kind: "message", required: true, description: "The grip's name, for its block: \"Paragraph options\", \"Heading 2 options\"." },
    menu: { kind: "list", of: "menuSections", required: true, description: "The block menu: Turn into, Duplicate, Move up and down, Copy link (headings), Delete." },
    menuRequest: { kind: "number", min: 0, description: "Each new value opens the block menu at the caret's block (Shift+F10, the Menu key)." },
  },
  events: {
    action: { payload: { id: "text", block: "number", to: "number" } },
    close: {},
  },
  slots: {},
  states: ["hidden", "shown", "pressed", "menuOpen", "dragging"],
  tokens: "cmp.blockHandle.*",
  a11y: { pattern: "button with a menu (menu button), out of the Tab order: Shift+F10 opens the same menu", name: "label" },
  fixtures: [],
});
