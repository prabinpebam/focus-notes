import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "SiteFigure",
  tier: "primitive",
  description: "A screenshot on the product site (D-169, D-174): the app's own window, in the visitor's light or dark, with its width and height so nothing shifts as it loads (PRF-12). The first one on a page loads first; the rest when they're near.",
  props: {
    src: { kind: "text", required: true, description: "The light screenshot's address, relative to the page." },
    srcDark: { kind: "text", description: "The dark screenshot, shown when the visitor's setting is dark." },
    alt: { kind: "text", required: true, description: "What the screenshot shows (D-169)." },
    width: { kind: "number", min: 1, description: "Its width in CSS pixels." },
    height: { kind: "number", min: 1, description: "Its height in CSS pixels." },
    priority: { kind: "boolean", default: false, description: "The page's main image: loaded first, never lazily." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.siteFigure.*",
  a11y: { pattern: "img", name: "alt" },
  fixtures: [
    { name: "screenshot", props: { src: { get: "vm.gallery.href" }, alt: { get: "vm.gallery.query" }, width: 640, height: 400 } },
    { name: "priority, light and dark", props: { src: { get: "vm.gallery.href" }, srcDark: { get: "vm.gallery.href" }, alt: { get: "vm.gallery.query" }, width: 640, height: 400, priority: true } },
  ],
});