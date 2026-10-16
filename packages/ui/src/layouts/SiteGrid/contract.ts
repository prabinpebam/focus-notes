import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "SiteGrid",
  tier: "layout",
  description: "The product site's grid of small tiles (D-174): as many columns as fit, each at least a tile wide.",
  props: {},
  events: {},
  slots: { default: { accepts: "any" } },
  states: ["rest"],
  tokens: "cmp.siteGrid.*",
  a11y: { pattern: "list", name: "A list of its tiles." },
  fixtures: [
    { name: "tiles", children: [1, 2, 3].map(() => ({ type: "SiteSection", props: { tone: "tile" }, children: [{ type: "SiteText", props: { value: { t: "gallery.sample" }, look: "tile" } }] })) },
  ],
});