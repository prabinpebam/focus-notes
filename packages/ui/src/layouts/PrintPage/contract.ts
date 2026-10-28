import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "PrintPage",
  tier: "layout",
  description: "A note laid out for paper (SHR-12): hidden on screen; while printing, the only thing on the page, in Paper's colors at the print text size, with the print margin and, when asked, the page number and count at the foot of every page.",
  props: {
    pageNumbers: { kind: "boolean", default: false, description: "The page number and the count (n / N) at the foot of every page (D-231); off by default." },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.printPage.*",
  a11y: { pattern: "none", name: "Never on screen, so never in the accessibility tree; the note itself is the editor's." },
  fixtures: [
    { name: "page", children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
    { name: "numbered", props: { pageNumbers: true }, children: [{ type: "Text", props: { value: { t: "gallery.long" } } }] },
  ],
});
