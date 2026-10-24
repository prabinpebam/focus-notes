import { defineContract } from "../../contract.ts";

export const contract = defineContract({
  type: "Skeleton",
  tier: "primitive",
  description: "A placeholder in the shape of content that's on its way: a line of words, a tile or an avatar, with a light that passes across it a few times, then stands still. Decorative: the region it sits in says what it's waiting for, once. Not for a wait without a known shape (use Spinner), nor for an empty or failed result (say so instead).",
  props: {
    shape: { kind: "enum", values: ["line", "tile", "avatar"], default: "line", description: "What's coming: a line of words, a card's picture, or a person's photo." },
    width: { kind: "enum", values: ["full", "long", "medium", "short"], default: "full", description: "A line's length, so a list of placeholders looks like words, not bars." },
  },
  events: {},
  slots: {},
  states: ["rest"],
  tokens: "cmp.skeleton.*",
  a11y: { pattern: "presentation: hidden from assistive technology; its region carries the one status (D-208)" },
  fixtures: [
    { name: "line", props: { shape: "line", width: "long" } },
    { name: "medium line", props: { shape: "line", width: "medium" } },
    { name: "short line", props: { shape: "line", width: "short" } },
    { name: "full line", props: { shape: "line", width: "full" } },
    { name: "tile", props: { shape: "tile" } },
    { name: "avatar", props: { shape: "avatar" } },
  ],
});