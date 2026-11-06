import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "ImageCrop", tier: "primitive",
  description: "Image-only direct crop stage (D-372, strict design). Eight native edge/corner buttons and a move target surround the source; Arrow moves one oriented source pixel, Shift+Arrow ten. The same component renders the exact clipped, rotated and flipped result without handles. Draft-only; never writes assets. Not an inline image menu. Aspect presets in the owning view supply the draft rectangle; free handle resizing is a prototype limitation until approval.",
  props: {
    src: { kind: "text", required: true },
    alt: { kind: "message", required: true },
    intrinsicWidth: { kind: "number", min: 1, required: true },
    intrinsicHeight: { kind: "number", min: 1, required: true },
    editing: { kind: "boolean", default: true },
    x: { kind: "number", min: 0, max: 100, default: 0 },
    y: { kind: "number", min: 0, max: 100, default: 0 },
    width: { kind: "number", min: 0, max: 100, default: 100 },
    height: { kind: "number", min: 0, max: 100, default: 100 },
    rotation: { kind: "enum", values: ["0", "90", "180", "270"], default: "0" },
    flipHorizontal: { kind: "boolean", default: false },
    flipVertical: { kind: "boolean", default: false },
    handles: { kind: "list", of: "options", required: true },
  },
  events: { change: { payload: { x: "number", y: "number", width: "number", height: "number" } } },
  slots: {}, states: ["rest", "editing"], tokens: "cmp.imageCrop.*",
  a11y: { pattern: "named native crop buttons", name: "alt" },
  fixtures: [
    { name: "cropped result", covers: ["rest"], props: { src: { get: "vm.gallery.imageSrc" }, alt: { t: "gallery.sample" }, intrinsicWidth: 640, intrinsicHeight: 360, editing: false, x: 25, y: 10, width: 50, height: 80, handles: { get: "vm.gallery.options" } } },
    { name: "editing stage", covers: ["editing"], props: { src: { get: "vm.gallery.imageSrc" }, alt: { t: "gallery.sample" }, intrinsicWidth: 640, intrinsicHeight: 360, handles: { get: "vm.gallery.options" } } },
  ],
});
