import { defineContract } from "../../contract.ts";

/** At most this many themes per scheme: the CSS that shows a theme's screenshot is written for each place. */
export const MAX_THEMES = 8;

export const contract = defineContract({
  type: "SiteThemeShowcase",
  tier: "primitive",
  description: "Every built-in theme, one screenshot each, on the product site (D-176): a large screenshot, a Light / Dark switch, and a row of swatches (each theme's background and accent) that shows that theme's screenshot. Radio buttons and CSS alone, as the site has no script: labelled groups, arrow keys between swatches, a visible focus ring. The first light theme shows first; the rest load when chosen.",
  props: {
    name: { kind: "text", required: true, description: "The radio groups' name, unique on the page (the section's anchor)." },
    themes: { kind: "list", of: "siteThemes", required: true, description: "Each theme: its ID (for its swatch's colours), name, light or dark, and its screenshot." },
    schemeLabel: { kind: "message", required: true, description: "The Light / Dark switch's name." },
    lightLabel: { kind: "message", required: true },
    darkLabel: { kind: "message", required: true },
    lightThemesLabel: { kind: "message", required: true, description: "The light swatches' name." },
    darkThemesLabel: { kind: "message", required: true, description: "The dark swatches' name." },
  },
  events: {},
  slots: {},
  states: ["light", "dark", "focus"],
  tokens: "cmp.siteThemeShowcase.*",
  a11y: { pattern: "radiogroup", name: "schemeLabel, lightThemesLabel and darkThemesLabel" },
  fixtures: [
    {
      name: "themes",
      props: {
        name: { get: "vm.gallery.query" }, themes: { get: "vm.gallery.siteThemes" },
        schemeLabel: { t: "site.scheme.label" }, lightLabel: { t: "site.scheme.light" }, darkLabel: { t: "site.scheme.dark" },
        lightThemesLabel: { t: "site.themes.light" }, darkThemesLabel: { t: "site.themes.dark" },
      },
    },
  ],
});