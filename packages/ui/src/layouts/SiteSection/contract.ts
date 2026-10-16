import { defineContract } from "../../contract.ts";

export const TONES = ["plain", "band", "hero", "feature", "tile"] as const;

export const contract = defineContract({
  type: "SiteSection",
  tier: "layout",
  description: "A section of a product site page (WP-10.1, D-174), with a stable anchor other pages link to. plain and band hold words; hero and feature are the landing page's big, centred showcases (a headline, a line, a screenshot); tile is one small tile of a grid.",
  props: {
    anchor: { kind: "text", description: "The section's stable anchor (its element ID); a tile has none." },
    tone: { kind: "enum", values: TONES, default: "plain" },
  },
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.siteSection.*",
  a11y: { pattern: "region", name: "Its heading, the first child's." },
  fixtures: [
    ...TONES.map((tone) => ({
      name: `tone ${tone}`,
      props: { anchor: { get: "vm.gallery.query" }, tone },
      children: [{ type: "SiteText", props: { value: { t: "site.landing.headline" }, as: "h2", look: "headline" } }],
    })),
  ],
});