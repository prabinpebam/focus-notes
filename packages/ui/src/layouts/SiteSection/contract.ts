import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "SiteSection",
  tier: "layout",
  description: "A section of a product site page (WP-10.1): one job each on the landing page, with a stable anchor other pages link to. A band sets it on a raised background.",
  props: {
    anchor: { kind: "text", required: true, description: "The section's stable anchor (its element ID)." },
    tone: { kind: "enum", values: ["plain", "band"], default: "plain" },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.siteSection.*",
  a11y: { pattern: "region", name: "Its heading, the first child's." },
  fixtures: [
    ...["plain", "band"].map((tone) => ({
      name: `tone ${tone}`,
      props: { anchor: { get: "vm.gallery.query" }, tone },
      children: [{ type: "NoteContent", props: { blocks: { get: "vm.gallery.noteBlocks" } } }],
    })),
  ],
});
