import { defineContract } from "../../contract.ts";

export const VARIANTS = ["inline", "nav", "brand", "primary", "secondary"] as const;

export const contract = defineContract({
  type: "SiteLink",
  tier: "primitive",
  description: "A link on the product site (WP-10.1): inline, one of the site's navigation links, the brand, or a call to action (primary or secondary). A plain anchor, so it works with no script.",
  props: {
    label: { kind: "message", required: true },
    href: { kind: "text", required: true, description: "Where it goes: a relative address on the site, or GitHub." },
    variant: { kind: "enum", values: VARIANTS, default: "inline" },
    current: { kind: "boolean", default: false, description: "The page this navigation link names (aria-current)." },
  },
  events: {},
  slots: {},
  states: ["rest", "hover", "focus"],
  tokens: "cmp.siteLink.*",
  a11y: { pattern: "link", name: "label" },
  fixtures: [
    ...VARIANTS.map((variant) => ({ name: `variant ${variant}`, props: { label: { t: "site.nav.help" }, href: { get: "vm.gallery.href" }, variant } })),
    { name: "current", props: { label: { t: "site.nav.help" }, href: { get: "vm.gallery.href" }, variant: "nav", current: true } },
  ],
});
