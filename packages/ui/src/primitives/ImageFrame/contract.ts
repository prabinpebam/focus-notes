import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "ImageFrame",
  tier: "primitive",
  description: "An inline image in a note (IMG, D-300): Column, Wide or Actual size, with Fit height and Rounded corners as saved choices, a token backdrop behind transparency, and a selection ring. In Edit image it shows the crop frame and the rotation. Not for decoration or icons.",
  props: {
    src: { kind: "text", required: true, description: "A data URL the shell made from the managed asset (data:image/…), never an address." },
    alt: { kind: "message", description: "The image description. Without one the image is decorative and, when editable, shows the No description hint (hint)." },
    mode: { kind: "enum", values: ["column", "wide", "actual", "thumb"], default: "column", description: "column: fits the reading column. wide: the column plus imageWideExtra, centred, never past the canvas. actual: its own pixels, no upscaling. thumb: a dialog's thumbnail." },
    fitHeight: { kind: "boolean", default: true, description: "Fit height (D-300): no taller than imageFitMax or imageFitViewport, whichever is smaller." },
    rounded: { kind: "boolean", default: false },
    selected: { kind: "boolean", default: false, description: "Selected on its own or within a text selection: a full ring." },
    hint: { kind: "message", description: "An author-only line under the image (No description)." },
    crop: { kind: "boolean", default: false, description: "Edit image: the crop frame with its handles over the preview." },
    rotation: { kind: "enum", values: ["0", "90", "180", "270"], default: "0" },
  },
  events: {},
  slots: {},
  states: ["rest", "selected"],
  tokens: "cmp.imageFrame.*",
  a11y: { pattern: "img", name: "alt" },
  fixtures: [
    ...(["column", "wide", "actual", "thumb"] as const).map((mode) => ({ name: `mode ${mode}`, props: { src: { get: "vm.gallery.imageSrc" }, mode, alt: { t: "gallery.sample" } } })),
    { name: "rounded, no fit height", props: { src: { get: "vm.gallery.imageSrc" }, rounded: true, fitHeight: false } },
    { name: "selected", props: { src: { get: "vm.gallery.imageSrc" }, selected: true, hint: { t: "gallery.sample" } }, covers: ["selected"] },
    ...(["0", "90", "180", "270"] as const).map((rotation) => ({ name: `crop, rotation ${rotation}`, props: { src: { get: "vm.gallery.imageSrc" }, crop: true, rotation, mode: "actual" } })),
  ],
});
