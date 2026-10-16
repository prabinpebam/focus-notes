import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "SiteSceneToggle",
  tier: "primitive",
  description: "One desktop scene with a Light / Dark choice under it (D-176): two radio buttons switch which of its two screenshots shows, with no script. Light is chosen first. The radios are a labelled group, so arrow keys move between them and a screen reader names the choice.",
  props: {
    name: { kind: "text", required: true, description: "The radio group's name, unique on the page (the section's anchor)." },
    label: { kind: "message", required: true, description: "The group's accessible name." },
    lightLabel: { kind: "message", required: true },
    darkLabel: { kind: "message", required: true },
  },
  events: {},
  slots: { light: { accepts: ["SiteFigure"], min: 1, max: 1 }, dark: { accepts: ["SiteFigure"], min: 1, max: 1 } },
  states: ["light", "dark", "focus"],
  tokens: "cmp.siteSceneToggle.*",
  a11y: { pattern: "radiogroup", name: "label" },
  fixtures: [
    {
      name: "light and dark",
      props: { name: { get: "vm.gallery.query" }, label: { t: "site.scheme.label" }, lightLabel: { t: "site.scheme.light" }, darkLabel: { t: "site.scheme.dark" } },
      slots: {
        light: [{ type: "SiteFigure", props: { src: { get: "vm.gallery.href" }, alt: { get: "vm.gallery.query" }, width: 640, height: 360 } }],
        dark: [{ type: "SiteFigure", props: { src: { get: "vm.gallery.href" }, alt: { get: "vm.gallery.query" }, width: 640, height: 360 } }],
      },
    },
  ],
});