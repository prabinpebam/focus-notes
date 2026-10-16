import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "SiteFigure",
  tier: "primitive",
  description: "A screenshot on the product site (D-169, D-176): a desktop scene, AVIF where the browser takes it and WebP otherwise, at the width the page shows it, in the visitor's light or dark, with its width and height so nothing shifts as it loads (PRF-12). The first one on a page loads first; the rest when they're near.",
  props: {
    src: { kind: "text", required: true, description: "The fallback image's address, relative to the page." },
    srcSet: { kind: "text", description: "WebP at each width (`media/x-1280.webp 1280w, …`)." },
    avifSet: { kind: "text", description: "AVIF at each width." },
    darkSrcSet: { kind: "text", description: "The dark scene's WebP, for a visitor whose setting is dark." },
    darkAvifSet: { kind: "text", description: "The dark scene's AVIF." },
    sizes: { kind: "text", description: "How wide the page shows it, for choosing a width." },
    alt: { kind: "text", required: true, description: "What the screenshot shows (D-169)." },
    width: { kind: "number", min: 1, description: "Its width in pixels (its aspect ratio, before CSS scales it)." },
    height: { kind: "number", min: 1, description: "Its height in pixels." },
    priority: { kind: "boolean", default: false, description: "The page's main image: loaded first, never lazily." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.siteFigure.*",
  a11y: { pattern: "img", name: "alt" },
  fixtures: [
    { name: "screenshot", props: { src: { get: "vm.gallery.href" }, alt: { get: "vm.gallery.query" }, width: 640, height: 360 } },
    { name: "priority, light and dark", props: { src: { get: "vm.gallery.href" }, darkSrcSet: { get: "vm.gallery.href" }, alt: { get: "vm.gallery.query" }, width: 640, height: 360, priority: true } },
  ],
});