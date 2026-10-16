import { defineContract } from "../../contract.ts";

export const LOOKS = ["display", "headline", "lead", "eyebrow", "tile", "caption"] as const;

export const contract = defineContract({
  type: "SiteText",
  tier: "primitive",
  description: "The product site's type (D-174): a few words in the display face at a large scale. The hero's headline (display), a section's headline, the one line under it (lead), an eyebrow, a tile's label, or a caption.",
  props: {
    value: { kind: "message", required: true },
    as: { kind: "enum", values: ["h1", "h2", "h3", "p"], default: "p", description: "The element: a heading level, or a paragraph." },
    look: { kind: "enum", values: LOOKS, default: "lead" },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.siteText.*",
  a11y: { pattern: "text", name: "Headings keep their levels; the look never changes the level." },
  fixtures: [
    ...LOOKS.map((look) => ({ name: `look ${look}`, props: { value: { t: "site.landing.headline" }, look } })),
    ...["h1", "h2", "h3", "p"].map((as) => ({ name: `as ${as}`, props: { value: { t: "site.landing.headline" }, as, look: "headline" } })),
  ],
});