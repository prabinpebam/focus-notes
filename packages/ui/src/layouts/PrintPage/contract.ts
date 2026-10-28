import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "PrintPage",
  tier: "layout",
  description: "A note laid out for paper (SHR-12): hidden on screen; while printing, the only thing on the page, in Paper's colors at the print text size, with the print margin and, from page 2, the page number and count at the foot.",
  props: {},
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.printPage.*",
  a11y: { pattern: "none", name: "Never on screen, so never in the accessibility tree; the note itself is the editor's." },
  fixtures: [
    { name: "page", children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
  ],
});
